import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  clerkId: {
    type: String,
  },
  timezone: {
    type: String,
    default: 'UTC',
  },
  expoPushToken: {
    type: String,
    default: null,
  },
  googleAccessToken: {
    type: String,
    default: null,
  },
  googleRefreshToken: {
    type: String,
    default: null,
  },
  googleTokenExpiry: {
    type: Date,
    default: null,
  },
  googleCalendarConnected: {
    type: Boolean,
    default: false,
  },
  resetPasswordCode: {
    type: String,
    default: null,
  },
  resetPasswordExpires: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
});

// Partial unique index for clerkId
userSchema.index(
  { clerkId: 1 },
  { unique: true, partialFilterExpression: { clerkId: { $type: 'string' } } }
);

// Hash password before saving
userSchema.pre('save', async function () {
  if (!this.isModified('password')) {
    return;
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);
export default User;