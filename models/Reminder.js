import mongoose from 'mongoose';

const reminderSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },
  message: {
    type: String,
    required: true,
    trim: true,
  },
  scheduledFor: {
    type: Date,
    required: true,
    index: true,
  },
  snoozedUntil: {
    type: Date,
    default: null,
  },
  snoozeCount: {
    type: Number,
    default: 0,
  },
  maxSnoozes: {
    type: Number,
    default: 5,
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'snoozed', 'cancelled', 'overdue'],
    default: 'pending',
    index: true,
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
  context: {
    type: String,
    default: '',
  },
  hasBeenRead: {
    type: Boolean,
    default: false,
  },
  readAt: {
    type: Date,
    default: null,
  },
  completedAt: {
    type: Date,
    default: null,
  },
  lastRemindedAt: {
    type: Date,
    default: null,
  },
  followUpRequired: {
    type: Boolean,
    default: false,
  },
  followUpAsked: {
    type: Boolean,
    default: false,
  },
  followUpResponse: {
    type: String,
    enum: ['completed', 'still_working', 'rescheduled', 'snoozed', null],
    default: null,
  },
  isClientBooking: {
    type: Boolean,
    default: false,
  },
  clientName: {
    type: String,
    default: '',
  },
  clientEmail: {
    type: String,
    default: '',
  },
  tags: [{
    type: String,
    trim: true,
  }],
}, {
  timestamps: true,
});

// Indexes for efficient querying
reminderSchema.index({ scheduledFor: 1, status: 1 });
reminderSchema.index({ userId: 1, scheduledFor: 1 });
reminderSchema.index({ userId: 1, status: 1 });
reminderSchema.index({ snoozedUntil: 1 });

// Virtual for checking if reminder is due
reminderSchema.virtual('isDue').get(function() {
  const now = new Date();
  const checkTime = this.snoozedUntil || this.scheduledFor;
  return checkTime <= now && this.status === 'pending';
});

// Method to snooze the reminder
reminderSchema.methods.snooze = function(minutes) {
  const snoozeTime = new Date();
  snoozeTime.setMinutes(snoozeTime.getMinutes() + minutes);
  this.snoozedUntil = snoozeTime;
  this.snoozeCount += 1;
  this.status = 'snoozed';
  return this.save();
};

// Method to complete the reminder
reminderSchema.methods.complete = function() {
  this.status = 'completed';
  this.completedAt = new Date();
  return this.save();
};

// Method to mark as read
reminderSchema.methods.markAsRead = function() {
  this.hasBeenRead = true;
  this.readAt = new Date();
  return this.save();
};

// Static method to get due reminders
reminderSchema.statics.getDueReminders = function() {
  const now = new Date();
  return this.find({
    status: 'pending',
    $or: [
      { scheduledFor: { $lte: now } },
      { snoozedUntil: { $lte: now } },
    ],
  }).populate('userId', 'name email');
};

const Reminder = mongoose.model('Reminder', reminderSchema);
export default Reminder;