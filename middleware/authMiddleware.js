import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { createClerkClient } from '@clerk/clerk-sdk-node';
import { verifyToken } from '@clerk/backend'; // ✅ Correct import

// ✅ Load environment variables
import dotenv from 'dotenv';
dotenv.config();

// ✅ Debug: Check if Clerk keys are loaded
console.log('🔑 CLERK_SECRET_KEY exists:', !!process.env.CLERK_SECRET_KEY);
console.log('🔑 JWT_SECRET exists:', !!process.env.JWT_SECRET);

// ✅ Initialize Clerk client
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
 * ✅ Detect token type based on algorithm
 */
const detectTokenType = (token) => {
  try {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded) return 'invalid';

    const alg = decoded.header.alg;
    if (alg === 'RS256') return 'clerk';
    if (alg === 'HS256') return 'local';
    return 'unknown';
  } catch (error) {
    return 'invalid';
  }
};

/**
 * ✅ Verify Clerk token using @clerk/backend's verifyToken
 * This handles JWKS fetching, caching, and signature verification automatically
 */
const verifyClerkToken = async (token) => {
  try {
    if (!process.env.CLERK_SECRET_KEY) {
      throw new Error('CLERK_SECRET_KEY is not set');
    }

    // ✅ Use Clerk's official verifyToken helper
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
      // authorizedParties: ['https://your-frontend.com'], // Optional: add your frontend URL
    });

    return payload;
  } catch (error) {
    console.error('❌ Clerk token verification failed:', error.message);
    throw error;
  }
};

/**
 * ✅ Verify local JWT token (HS256)
 */
const verifyLocalToken = (token) => {
  try {
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET is not set on the server');
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded;
  } catch (error) {
    console.error('❌ Local JWT verification failed:', error.message);
    throw error;
  }
};

/**
 * Protect routes - Verify JWT token
 * Supports both Clerk JWT (RS256) and custom JWT (HS256)
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
    // ✅ Detect token type by algorithm
    const tokenType = detectTokenType(token);
    console.log(`📌 Token type: ${tokenType}`);

    let payload;
    let userId;

    if (tokenType === 'clerk') {
      // ✅ CLERK TOKEN (RS256) - Use Clerk's verifyToken
      try {
        console.log('🔄 Verifying Clerk token...');
        payload = await verifyClerkToken(token);
        userId = payload.sub;
        console.log('✅ Clerk token verified for user:', userId);
      } catch (error) {
        console.error('❌ Clerk token verification failed:', error.message);
        return res.status(401).json({ message: 'Invalid Clerk token' });
      }

      // ✅ Get user details from Clerk
      let clerkEmail = null;
      let clerkName = null;

      if (clerkClient) {
        try {
          const clerkUser = await clerkClient.users.getUser(userId);
          clerkEmail = clerkUser.emailAddresses[0]?.emailAddress;
          clerkName = `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim();
        } catch (userError) {
          console.log('⚠️ Could not fetch Clerk user details, using token data');
          clerkEmail = payload.email || payload.emailAddress || userId;
          clerkName = payload.name || payload.username || 'User';
        }
      }

      if (!clerkEmail) {
        clerkEmail = payload.email || payload.emailAddress || userId;
        clerkName = payload.name || payload.username || 'User';
      }

      // ✅ Find or create user in MongoDB
      let user = await User.findOne({
        $or: [{ clerkId: userId }, { email: clerkEmail }],
      });

      if (!user) {
        console.log('📝 Creating new user from Clerk...');
        user = await User.create({
          name: clerkName || clerkEmail.split('@')[0],
          email: clerkEmail,
          password: 'clerk_oauth_user',
          clerkId: userId,
          isEmailVerified: true,
        });
        console.log('✅ Created new user from Clerk:', user.email);
      } else if (!user.clerkId) {
        user.clerkId = userId;
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

    } else if (tokenType === 'local') {
      // ✅ LOCAL JWT TOKEN (HS256) - For email/password auth
      try {
        console.log('🔄 Verifying local JWT token...');
        payload = await verifyLocalToken(token);
        userId = payload.id;
        console.log('✅ Local JWT verified for user:', userId);

        // ✅ Find user in database
        const user = await User.findById(userId).select('-password');

        if (!user) {
          console.log('❌ User not found in database for ID:', userId);
          return res.status(401).json({ message: 'User not found' });
        }

        // ✅ Attach user to request
        req.user = {
          _id: user._id,
          id: user._id,
          email: user.email,
          name: user.name,
        };
        console.log('✅ User authenticated via local JWT:', user.email);
        return next();
      } catch (error) {
        console.error('❌ Local JWT verification failed:', error.message);
        return res.status(401).json({ message: 'Invalid token' });
      }

    } else {
      // ✅ UNKNOWN TOKEN TYPE
      console.error('❌ Unknown token type:', tokenType);
      return res.status(401).json({ message: 'Unsupported token type' });
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