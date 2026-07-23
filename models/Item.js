import mongoose from 'mongoose';

const itemSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  type: {
    type: String,
    enum: ['Note', 'Task', 'Reminder', 'Event'],
    default: 'Note',
  },
  title: {
    type: String,
    required: true,
  },
  content: {
    type: String,
    default: '',
  },
  status: {
    type: String,
    enum: ['pending_confirmation', 'active', 'completed', 'cancelled', 'expired'],
    default: 'pending_confirmation',
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium',
  },
  category: {
    type: String,
    default: 'General',
  },
  startTime: {
    type: Date,
    default: null,
  },
  endTime: {
    type: Date,
    default: null,
  },
  location: {
    type: String,
    default: null,
  },
  repeat: {
    type: String,
    enum: ['none', 'daily', 'weekly', 'monthly'],
    default: 'none',
  },
  googleEventId: {
    type: String,
    default: null,
  },
  isSynced: {
    type: Boolean,
    default: false,
  },
  checkInTriggered: {
    type: Boolean,
    default: false,
  },
  completedAt: {
    type: Date,
    default: null,
  },
  isClientBooking: {
    type: Boolean,
    default: false,
  },
  clientName: {
    type: String,
    default: null,
  },
  clientEmail: {
    type: String,
    default: null,
  },
  videoCallLink: {
    type: String,
    default: null,
  },
  deleteAfter: {
    type: Date,
    default: null,
  },
  linkedEventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item',
    default: null,
  },
  linkedReminderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item',
    default: null,
  },
  isLinkedEvent: {
    type: Boolean,
    default: false,
  },
  subtasks: [{
    text: { type: String, required: true },
    done: { type: Boolean, default: false },
  }],
}, {
  timestamps: true,
});

// ✅ Helper function - computes deleteAfter based on item type and dates
export function computeDeleteAfter({ type, startTime, endTime, createdAt }) {
  const now = new Date();
  
  // ✅ For Notes: keep 30 days
  if (type === 'Note') {
    const d = new Date(now);
    d.setDate(d.getDate() + 30);
    return d;
  }
  
  // ✅ For Tasks: keep 30 days
  if (type === 'Task') {
    const d = new Date(now);
    d.setDate(d.getDate() + 30);
    return d;
  }
  
  // ✅ For Reminders: keep 7 days after reminder date or 30 days from creation
  if (type === 'Reminder') {
    if (startTime) {
      const d = new Date(startTime);
      d.setDate(d.getDate() + 7);
      return d;
    }
    const d = new Date(now);
    d.setDate(d.getDate() + 30);
    return d;
  }
  
  // ✅ For Events: keep 7 days after the event ends
  if (type === 'Event') {
    if (endTime) {
      const d = new Date(endTime);
      d.setDate(d.getDate() + 7);
      return d;
    }
    if (startTime) {
      const d = new Date(startTime);
      d.setDate(d.getDate() + 7);
      return d;
    }
    // If no startTime, keep 30 days from creation
    const d = new Date(now);
    d.setDate(d.getDate() + 30);
    return d;
  }
  
  // Default: keep 30 days
  const d = new Date(now);
  d.setDate(d.getDate() + 30);
  return d;
}

// ✅ FIXED: Pre-save middleware - removed 'next' parameter and used function()
itemSchema.pre('save', function() {
  // Only calculate if not explicitly set
  if (this.deleteAfter === undefined || this.deleteAfter === null) {
    this.deleteAfter = computeDeleteAfter({
      type: this.type,
      startTime: this.startTime,
      endTime: this.endTime,
      createdAt: this.createdAt || new Date(),
    });
  }
});

// Indexes for performance
itemSchema.index({ userId: 1, type: 1, status: 1 });
itemSchema.index({ userId: 1, startTime: 1 });
itemSchema.index({ userId: 1, createdAt: -1 });
itemSchema.index({ deleteAfter: 1 });
itemSchema.index({ userId: 1, isLinkedEvent: 1 });

// ✅ Safe model loading
const Item = mongoose.models.Item || mongoose.model('Item', itemSchema);

export default Item;