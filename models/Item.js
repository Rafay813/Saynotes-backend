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
    enum: ['pending_confirmation', 'active', 'completed', 'cancelled'],
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
  // ✅ Client booking fields (only relevant when type === 'Event')
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
}, {
  timestamps: true,
});

// ✅ Indexes for performance
itemSchema.index({ userId: 1, type: 1, status: 1 });
itemSchema.index({ userId: 1, startTime: 1 });
itemSchema.index({ userId: 1, createdAt: -1 });

const Item = mongoose.model('Item', itemSchema);

export default Item;