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
  // ✅ Reminder → Event linking
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
  // ✅ IMPORTANT: Flag to identify linked events (was missing)
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

// Helper function - can be imported from here
export function computeDeleteAfter({ type, startTime, endTime }) {
  const now = new Date();
  
  if (endTime) {
    const d = new Date(endTime);
    d.setMinutes(d.getMinutes() + 60);
    return d;
  }
  
  if (startTime) {
    const d = new Date(startTime);
    d.setHours(23, 59, 59, 999);
    return d;
  }
  
  const d = new Date(now);
  d.setDate(d.getDate() + 7);
  return d;
}

// Indexes for performance
itemSchema.index({ userId: 1, type: 1, status: 1 });
itemSchema.index({ userId: 1, startTime: 1 });
itemSchema.index({ userId: 1, createdAt: -1 });
itemSchema.index({ deleteAfter: 1 });
itemSchema.index({ userId: 1, isLinkedEvent: 1 }); // ✅ Added index for linked event queries

const Item = mongoose.model('Item', itemSchema);

export default Item;