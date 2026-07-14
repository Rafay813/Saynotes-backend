import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { createClerkClient, verifyToken } from '@clerk/backend';

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

export const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      console.log('🔑 Token received:', token.substring(0, 20) + '...');

      // ✅ DETECT TOKEN TYPE FIRST
      // Clerk tokens are longer (~200+ chars) 
      // Manual JWT tokens are shorter (~100-150 chars)
      const isClerkToken = token.length > 180;
      
      if (isClerkToken) {
        // ✅ TRY CLERK VERIFICATION ONLY FOR CLERK TOKENS
        try {
          console.log('🔄 Attempting Clerk verification...');

          if (!process.env.CLERK_SECRET_KEY) {
            throw new Error('CLERK_SECRET_KEY is not set on the server');
          }

          const payload = await verifyToken(token, {
            secretKey: process.env.CLERK_SECRET_KEY,
          });

          const clerkUserId = payload.sub;
          console.log('✅ Clerk JWT verified for user:', clerkUserId);

          const clerkUser = await clerkClient.users.getUser(clerkUserId);
          const clerkEmail = clerkUser.emailAddresses[0]?.emailAddress;

          if (!clerkEmail) {
            throw new Error('Clerk user has no email address');
          }

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
            });
            console.log('✅ Created new user from Clerk:', user.email);
          } else if (!user.clerkId) {
            user.clerkId = clerkUserId;
            await user.save();
            console.log('✅ Updated existing user with clerkId:', user.email);
          }

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
          return res.status(401).json({ message: 'Not authorized, invalid Clerk token' });
        }
      } else {
        // ✅ MANUAL JWT VERIFICATION (skip Clerk entirely)
        try {
          console.log('🔄 Manual JWT verification...');
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          console.log('✅ Token decoded for user:', decoded.id);

          req.user = await User.findById(decoded.id).select('-password');

          if (!req.user) {
            console.log('❌ User not found in database for ID:', decoded.id);
            return res.status(401).json({ message: 'User not found' });
          }

          console.log('✅ User authenticated via manual JWT:', req.user._id);
          return next();
        } catch (jwtError) {
          console.error('❌ JWT verification failed:', jwtError.message);
          return res.status(401).json({ message: 'Not authorized, token failed' });
        }
      }
    } catch (error) {
      console.error('❌ Auth error:', error.message);
      res.status(401).json({ message: 'Not authorized, token failed' });
    }
  } else {
    console.log('❌ No authorization header');
    res.status(401).json({ message: 'Not authorized, no token' });
  }
};