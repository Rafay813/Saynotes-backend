import express from 'express';
import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const router = express.Router();

// Clerk Webhook endpoint
router.post('/clerk-webhook', async (req, res) => {
  try {
    const payload = req.body;
    const eventType = payload.type;

    if (eventType === 'user.created' || eventType === 'user.updated') {
      const { id, email_addresses, first_name, last_name } = payload.data;
      
      const email = email_addresses[0]?.email_address;
      if (!email) return res.status(200).end();

      let user = await User.findOne({ email });
      
      if (!user) {
        const randomPassword = crypto.randomBytes(32).toString('hex');
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(randomPassword, salt);

        user = await User.create({
          name: `${first_name || ''} ${last_name || ''}`.trim() || email.split('@')[0],
          email,
          password: hashedPassword,
          clerkId: id,
        });
        console.log('✅ User created via Clerk webhook:', email);
      } else if (!user.clerkId) {
        user.clerkId = id;
        await user.save();
        console.log('✅ User updated with clerkId:', email);
      }

      res.status(200).json({ success: true });
    }
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook failed' });
  }
});

export default router;