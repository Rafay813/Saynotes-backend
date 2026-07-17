import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { createClerkClient, verifyToken } from '@clerk/backend';

// ✅ Load environment variables
import dotenv from 'dotenv';
dotenv.config();

// ✅ Debug: Check if Clerk keys are loaded
console.log('🔑 CLERK_SECRET_KEY exists:', !!process.env.CLERK_SECRET_KEY);
console.log('🔑 JWT_SECRET exists:', !!process.env.JWT_SECRET);

// ✅ Initialize Clerk client (only if secret key exists)
let clerkClient = null;
try {
  if (process.env.CLERK_SECRET_KEY) {
    clerkClient = createClerkClient({
      secretKey: process.env.CLERK_SECRET_KEY,
    });
    console.log('✅ Clerk client initialized');
  } else {
    console.warn('⚠️ CLERK_SECRET_KEY not set - Clerk verification disabled');
  }
} catch (error) {
  console.error('❌ Failed to initialize Clerk client:', error.message);
  clerkClient = null;
}

/**
 * Protect routes - Verify JWT token
 * Supports both Clerk JWT and custom JWT
 */
export const protect = async (req, res, next) => {
  let token;

  // ✅ Check for token in Authorization header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    console.error('❌ No token provided');
    return res.status(401).json({ message: 'Not authorized, no token' });
  }

  console.log('🔑 Token received:', token.substring(0, 30) + '...');

  try {
    // ✅ DETECT TOKEN TYPE
    // Clerk tokens are longer (~200+ chars) with RS256
    // Manual JWT tokens are shorter (~100-150 chars) with HS256
    const isClerkToken = token.length > 180;

    if (isClerkToken && clerkClient && process.env.CLERK_SECRET_KEY) {
      // ✅ TRY CLERK VERIFICATION
      try {
        console.log('🔄 Attempting Clerk verification...');

        const payload = await verifyToken(token, {
          secretKey: process.env.CLERK_SECRET_KEY,
        });

        const clerkUserId = payload.sub;
        console.log('✅ Clerk JWT verified for user:', clerkUserId);

        // ✅ Get user from Clerk
        const clerkUser = await clerkClient.users.getUser(clerkUserId);
        const clerkEmail = clerkUser.emailAddresses[0]?.emailAddress;

        if (!clerkEmail) {
          throw new Error('Clerk user has no email address');
        }

        // ✅ Find or create user in MongoDB
        let user = await User.findOne({
          $or: [{ clerkId: clerkUserId }, { email: clerkEmail }],
        });

        if (!user) {
          console.log('📝 Creating new user from Clerk...');
          user = await User.create({
            name:
              `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() ||
              clerkEmail.split('@')[0],
            email: clerkEmail,
            password: 'clerk_oauth_user',
            clerkId: clerkUserId,
            isEmailVerified: true,
          });
          console.log('✅ Created new user from Clerk:', user.email);
        } else if (!user.clerkId) {
          user.clerkId = clerkUserId;
          await user.save();
          console.log('✅ Updated existing user with clerkId:', user.email);
        }

        // ✅ Attach user to request
        req.user = {
          _id: user._id,
          id: user._id,
          email: user.email,
          name: user.name,
        };
        console.log('✅ User authenticated via Clerk:', user.email);
        return next();
      } catch (clerkError) {
        console.error('❌ Clerk verification failed:', clerkError.message);
        // Fall through to try manual JWT verification
      }
    }

    // ✅ MANUAL JWT VERIFICATION (for email auth or fallback)
    try {
      console.log('🔄 Attempting manual JWT verification...');
      
      if (!process.env.JWT_SECRET) {
        throw new Error('JWT_SECRET is not set on the server');
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('✅ Token decoded for user:', decoded.id);

      // ✅ Find user in database
      const user = await User.findById(decoded.id).select('-password');
      
      if (!user) {
        console.log('❌ User not found in database for ID:', decoded.id);
        return res.status(401).json({ message: 'User not found' });
      }

      // ✅ Attach user to request
      req.user = {
        _id: user._id,
        id: user._id,
        email: user.email,
        name: user.name,
      };
      console.log('✅ User authenticated via manual JWT:', user.email);
      return next();
    } catch (jwtError) {
      console.error('❌ Manual JWT verification failed:', jwtError.message);
      return res.status(401).json({ message: 'Not authorized, token failed' });
    }
  } catch (error) {
    console.error('❌ Auth error:', error.message);
    return res.status(401).json({ message: 'Not authorized, token failed' });
  }
};

/**
 * Optional: Verify user is admin
 */
export const admin = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const user = await User.findById(req.user._id);
    if (!user || !user.isAdmin) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    next();
  } catch (error) {
    console.error('❌ Admin check error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

export default {
  protect,
  admin,
};