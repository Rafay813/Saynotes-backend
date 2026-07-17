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
  // Client booking fields
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
  // ✅ Auto-delete tracking
  deleteScheduled: {
    type: Boolean,
    default: false,
  },
  deletedAt: {
    type: Date,
    default: null,
  },
  expiryBufferMinutes: {
    type: Number,
    default: 60,
  },
  // ✅ Phase 1: Linked items (Reminder ↔ Event)
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
  // ✅ Phase 2: Subtasks/Checklist
  subtasks: [{
    text: { type: String, required: true },
    done: { type: Boolean, default: false },
  }],
}, {
  timestamps: true,
});

// ✅ Indexes for performance
itemSchema.index({ userId: 1, type: 1, status: 1 });
itemSchema.index({ userId: 1, startTime: 1 });
itemSchema.index({ userId: 1, createdAt: -1 });
itemSchema.index({ endTime: 1, status: 1 });
itemSchema.index({ deletedAt: 1 });

// ✅ Method to check if item should be auto-deleted
itemSchema.methods.shouldAutoDelete = function() {
  if (this.deletedAt) return false;
  if (this.status === 'cancelled') return false;
  
  const now = new Date();
  
  if (this.endTime) {
    const expiryTime = new Date(this.endTime);
    expiryTime.setMinutes(expiryTime.getMinutes() + (this.expiryBufferMinutes || 60));
    return now >= expiryTime;
  }
  
  if (this.startTime && !this.endTime) {
    const expiryTime = new Date(this.startTime);
    expiryTime.setHours(23, 59, 59, 999);
    return now >= expiryTime;
  }
  
  if (this.type === 'Note' || this.type === 'Reminder') {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return this.createdAt <= sevenDaysAgo;
  }
  
  return false;
};

// ✅ Static method to find and delete expired items
itemSchema.statics.cleanupExpiredItems = async function() {
  const now = new Date();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const allItems = await this.find({
    deletedAt: null,
    status: { $nin: ['cancelled', 'expired'] },
  });
  
  const expiredItems = [];
  for (const item of allItems) {
    if (item.shouldAutoDelete()) {
      expiredItems.push(item);
    }
  }
  
  const deletedIds = [];
  for (const item of expiredItems) {
    try {
      item.status = 'expired';
      item.deletedAt = now;
      item.deleteScheduled = true;
      await item.save();
      deletedIds.push(item._id);
      console.log(`🗑️ Auto-deleted item: "${item.title}" (${item.type})`);
    } catch (error) {
      console.error(`❌ Failed to auto-delete item ${item._id}:`, error);
    }
  }
  
  return deletedIds;
};

// ✅ Static method to permanently remove old soft-deleted items
itemSchema.statics.permanentCleanup = async function(daysToKeep = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  
  const result = await this.deleteMany({
    deletedAt: { $lt: cutoffDate },
    status: 'expired'
  });
  
  console.log(`✅ Permanently deleted ${result.deletedCount} items`);
  return result;
};

const Item = mongoose.model('Item', itemSchema);

export default Item;