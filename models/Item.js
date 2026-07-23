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

// Helper function - computes deleteAfter based on item type and dates
export function computeDeleteAfter({ type, startTime, endTime, createdAt }) {
  const now = new Date();
  
  if (type === 'Note') {
    const d = new Date(now);
    d.setDate(d.getDate() + 30);
    return d;
  }
  
  if (type === 'Task') {
    const d = new Date(now);
    d.setDate(d.getDate() + 30);
    return d;
  }
  
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
    const d = new Date(now);
    d.setDate(d.getDate() + 30);
    return d;
  }
  
  const d = new Date(now);
  d.setDate(d.getDate() + 30);
  return d;
}

// Pre-save middleware - no 'next' parameter
itemSchema.pre('save', function() {
  if (this.deleteAfter === undefined || this.deleteAfter === null) {
    this.deleteAfter = computeDeleteAfter({
      type: this.type,
      startTime: this.startTime,
      endTime: this.endTime,
      createdAt: this.createdAt || new Date(),
    });
  }
});

// ✅ Indexes for performance - including compound index
itemSchema.index({ userId: 1, type: 1, status: 1 });
itemSchema.index({ userId: 1, startTime: 1 });
itemSchema.index({ userId: 1, createdAt: -1 });
itemSchema.index({ deleteAfter: 1 });
itemSchema.index({ userId: 1, isLinkedEvent: 1 });
// ✅ Compound index for dashboard queries
itemSchema.index({ userId: 1, status: 1, startTime: 1 });

// Safe model loading
const Item = mongoose.models.Item || mongoose.model('Item', itemSchema);

export default Item;