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
    // No default — leave unset for email/password signups so it's
    // truly absent from the document, not stored as null.
  },
  timezone: {
    type: String,
    default: 'UTC',
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
}, {
  timestamps: true,
});

// ✅ Partial unique index — only enforces uniqueness on documents
// where clerkId is an actual string, ignoring users where it's
// missing/unset (i.e. email/password signups).
userSchema.index(
  { clerkId: 1 },
  { unique: true, partialFilterExpression: { clerkId: { $type: 'string' } } }
);

// ✅ Hash password before saving - Modern async (no callback)
userSchema.pre('save', async function () {
  if (!this.isModified('password')) {
    return;
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// ✅ Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);
export default User;