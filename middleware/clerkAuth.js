import { createClerkClient } from '@clerk/clerk-sdk-node';

const clerkClient = createClerkClient({ 
  secretKey: process.env.CLERK_SECRET_KEY 
});

export const requireClerkAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    
    // Verify Clerk token
    const session = await clerkClient.sessions.verifySession({ 
      sessionId: token 
    });
    
    if (!session) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    const user = await clerkClient.users.getUser(session.userId);
    req.user = {
      id: user.id,
      email: user.emailAddresses[0].emailAddress,
      name: `${user.firstName} ${user.lastName}`.trim(),
    };
    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json({ message: 'Authentication failed' });
  }
};