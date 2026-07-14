import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { exchangeAuthCode } from '../services/calendarService.js';

// ✅ Generate JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

// ✅ Register User
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
    console.error('❌ Register error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// ✅ Login User
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
    console.error('❌ Login error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// ✅ Get User Profile
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json(user);
  } catch (error) {
    console.error('❌ Profile error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// ✅ Google Login
export const googleLogin = async (req, res) => {
  try {
    // Handle Google OAuth login
    const { token } = req.body;
    // ... existing Google login logic
  } catch (error) {
    console.error('❌ Google login error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// ✅ Connect Google Calendar (protected - uses auth token)
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

    // ✅ Use findByIdAndUpdate to avoid pre('save') hook
    await User.findByIdAndUpdate(user._id, {
      googleAccessToken: tokens.access_token,
      googleRefreshToken: tokens.refresh_token || user.googleRefreshToken,
      googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : user.googleTokenExpiry,
      googleCalendarConnected: true,
    });

    console.log('✅ Google Calendar connected for user:', user.email);

    res.json({ 
      success: true, 
      connected: true,
      message: 'Google Calendar connected successfully',
    });
  } catch (error) {
    console.error('❌ Google connection error:', error);
    res.status(500).json({ message: 'Failed to connect Google Calendar' });
  }
};

// ✅ Register Push Token
export const registerPushToken = async (req, res) => {
  try {
    // Handle push token registration
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Push token error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};