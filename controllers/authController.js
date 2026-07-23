import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { exchangeAuthCode } from '../services/calendarService.js';
import { sendPasswordResetEmail } from '../services/emailService.js';

// Generate JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

// Register User
export const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const user = await User.create({
      name,
      email,
      password,
    });

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      token: generateToken(user._id),
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Login User
export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      token: generateToken(user._id),
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Get User Profile
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json(user);
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Google Login
export const googleLogin = async (req, res) => {
  try {
    const { token } = req.body;
    // Handle Google OAuth login
    res.json({ message: 'Google login successful' });
  } catch (error) {
    console.error('Google login error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Connect Google Calendar
export const connectGoogleCalendar = async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ message: 'Authorization code required' });
    }

    const tokens = await exchangeAuthCode(code);

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    await User.findByIdAndUpdate(user._id, {
      googleAccessToken: tokens.access_token,
      googleRefreshToken: tokens.refresh_token || user.googleRefreshToken,
      googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : user.googleTokenExpiry,
      googleCalendarConnected: true,
    });

    console.log('Google Calendar connected for user:', user.email);

    res.json({ 
      success: true, 
      connected: true,
      message: 'Google Calendar connected successfully',
    });
  } catch (error) {
    console.error('Google connection error:', error);
    res.status(500).json({ message: 'Failed to connect Google Calendar' });
  }
};

// Register Push Token
export const registerPushToken = async (req, res) => {
  try {
    const { expoPushToken } = req.body;
    
    if (!expoPushToken) {
      return res.status(400).json({
        success: false,
        message: 'expoPushToken is required',
      });
    }

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
    }

    await User.findByIdAndUpdate(req.user._id, { expoPushToken });
    console.log('Push token registered for user:', req.user._id);

    res.json({
      success: true,
      message: 'Push token registered successfully',
    });
  } catch (error) {
    console.error('Push token error:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error',
    });
  }
};

// Request password reset
export const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(200).json({ message: 'If that email exists, a reset code has been sent.' });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    await User.findByIdAndUpdate(user._id, {
      resetPasswordCode: code,
      resetPasswordExpires: expires,
    });

    sendPasswordResetEmail({ to: user.email, name: user.name, code })
      .then(result => {
        if (result.sent) {
          console.log('Password reset email sent to:', user.email);
        } else {
          console.warn('Reset email not sent:', result.reason);
        }
      })
      .catch(err => {
        console.error('Reset email send failed:', err.message);
      });

    res.status(200).json({ message: 'If that email exists, a reset code has been sent.' });
  } catch (error) {
    console.error('Request password reset error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Reset password
export const resetPassword = async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({ message: 'Email, code, and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const user = await User.findOne({ email });

    if (!user || !user.resetPasswordCode || !user.resetPasswordExpires) {
      return res.status(400).json({ message: 'Invalid or expired code' });
    }

    if (user.resetPasswordCode !== code) {
      return res.status(400).json({ message: 'Invalid or expired code' });
    }

    if (user.resetPasswordExpires < new Date()) {
      return res.status(400).json({ message: 'Code has expired. Please request a new one.' });
    }

    user.password = newPassword;
    user.resetPasswordCode = null;
    user.resetPasswordExpires = null;
    await user.save();

    console.log('Password reset successful for:', user.email);

    res.status(200).json({ message: 'Password reset successful. Please sign in.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};