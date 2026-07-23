import express from 'express';
import {
  registerUser,
  loginUser,
  getMe,
  googleLogin,
  connectGoogleCalendar,
  registerPushToken,
  requestPasswordReset,
  resetPassword,
} from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';
import { getGoogleAuthUrl, exchangeAuthCode } from '../services/calendarService.js';
import User from '../models/User.js';

const router = express.Router();

// Public routes
router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/google', googleLogin);
router.post('/forgot-password', requestPasswordReset);
router.post('/reset-password', resetPassword);

// Protected routes
router.get('/me', protect, getMe);
router.post('/push-token', protect, registerPushToken);

// Get Google Calendar Auth URL
router.get('/google/auth-url', protect, async (req, res) => {
  try {
    const { userId } = req.query;
    const userIdToUse = userId || req.user._id;
    
    const url = getGoogleAuthUrl(userIdToUse);
    console.log('Generated Google Auth URL with userId:', userIdToUse);
    res.json({ url });
  } catch (error) {
    console.error('Auth URL error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// Google Calendar Auth Callback - GET
router.get('/google/callback', async (req, res) => {
  try {
    const { code, state } = req.query;

    console.log('Google callback received');
    console.log('Code:', code ? 'Present' : 'Missing');
    console.log('State:', state || 'Missing');

    if (!code) {
      return res.status(400).send(`
        <html>
          <body>
            <h2>Error: No authorization code received</h2>
            <p>Please go back to the app and try again.</p>
          </body>
        </html>
      `);
    }

    if (!state) {
      return res.status(400).send(`
        <html>
          <body>
            <h2>Error: No user identifier found</h2>
            <p>Please go back to the app and try again.</p>
          </body>
        </html>
      `);
    }

    const tokens = await exchangeAuthCode(code);

    const user = await User.findById(state);
    if (!user) {
      return res.status(404).send(`
        <html>
          <body>
            <h2>Error: User not found</h2>
            <p>Please go back to the app and try again.</p>
          </body>
        </html>
      `);
    }

    await User.findByIdAndUpdate(user._id, {
      googleAccessToken: tokens.access_token,
      googleRefreshToken: tokens.refresh_token || user.googleRefreshToken,
      googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : user.googleTokenExpiry,
      googleCalendarConnected: true,
    });

    console.log('Google Calendar connected for user:', user.email);

    res.send(`
      <html>
        <head>
          <meta http-equiv="refresh" content="1;url=saynotesmvp://auth/google?success=true" />
        </head>
        <body>
          <h2>Google Calendar Connected Successfully!</h2>
          <p>Redirecting back to the app...</p>
          <p>If you are not redirected, <a href="saynotesmvp://auth/google?success=true">click here</a>.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Google callback error:', error);
    res.send(`
      <html>
        <head>
          <meta http-equiv="refresh" content="2;url=saynotesmvp://auth/google?error=true" />
        </head>
        <body>
          <h2>Failed to connect Google Calendar</h2>
          <p>Error: ${error.message}</p>
          <p>Redirecting back to the app...</p>
        </body>
      </html>
    `);
  }
});

// Protected - User sends code with auth token
router.post('/google/calendar', protect, connectGoogleCalendar);

// Disconnect Google Calendar
router.post('/google/disconnect', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    await User.findByIdAndUpdate(user._id, {
      googleAccessToken: null,
      googleRefreshToken: null,
      googleTokenExpiry: null,
      googleCalendarConnected: false,
    });

    res.json({ success: true, message: 'Google Calendar disconnected' });
  } catch (error) {
    console.error('Disconnect error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// Logout route
router.post('/logout', protect, (req, res) => {
  res.status(200).json({ message: 'Logged out successfully' });
});

export default router;