import Reminder from '../models/Reminder.js';
import { registerPushToken } from '../services/notificationService.js';

// @desc    Schedule a new reminder
// @route   POST /api/v1/reminders/schedule
// @access  Private
export const scheduleReminder = async (req, res) => {
  try {
    const {
      title,
      message,
      scheduledFor,
      priority = 'medium',
      category = 'General',
      context = '',
      isClientBooking = false,
      clientName = '',
      clientEmail = '',
      tags = [],
      followUpRequired = false,
    } = req.body;

    // Validate required fields
    if (!title || !message || !scheduledFor) {
      return res.status(400).json({
        success: false,
        message: 'Please provide title, message, and scheduledFor',
      });
    }

    const scheduledDate = new Date(scheduledFor);
    if (scheduledDate < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Scheduled time must be in the future',
      });
    }

    const reminder = await Reminder.create({
      userId: req.user._id,
      title,
      message,
      scheduledFor: scheduledDate,
      priority,
      category,
      context,
      isClientBooking,
      clientName,
      clientEmail,
      tags,
      followUpRequired,
    });

    res.status(201).json({
      success: true,
      data: reminder,
      message: 'Reminder scheduled successfully',
    });
  } catch (error) {
    console.error('❌ Schedule reminder error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to schedule reminder',
      error: error.message,
    });
  }
};

// @desc    Get all reminders for user
// @route   GET /api/v1/reminders
// @access  Private
export const getReminders = async (req, res) => {
  try {
    const { status, limit = 50, page = 1 } = req.query;
    const skip = (page - 1) * limit;

    const query = { userId: req.user._id };
    if (status) {
      query.status = status;
    }

    const reminders = await Reminder.find(query)
      .sort({ scheduledFor: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Reminder.countDocuments(query);

    res.status(200).json({
      success: true,
      data: reminders,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('❌ Get reminders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get reminders',
      error: error.message,
    });
  }
};

// @desc    Get a single reminder
// @route   GET /api/v1/reminders/:id
// @access  Private
export const getReminder = async (req, res) => {
  try {
    const reminder = await Reminder.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!reminder) {
      return res.status(404).json({
        success: false,
        message: 'Reminder not found',
      });
    }

    res.status(200).json({
      success: true,
      data: reminder,
    });
  } catch (error) {
    console.error('❌ Get reminder error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get reminder',
      error: error.message,
    });
  }
};

// @desc    Snooze a reminder
// @route   POST /api/v1/reminders/:id/snooze
// @access  Private
export const snoozeReminder = async (req, res) => {
  try {
    const { minutes = 10 } = req.body;

    if (!minutes || minutes < 1) {
      return res.status(400).json({
        success: false,
        message: 'Please provide valid minutes (minimum 1)',
      });
    }

    const reminder = await Reminder.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!reminder) {
      return res.status(404).json({
        success: false,
        message: 'Reminder not found',
      });
    }

    if (reminder.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Cannot snooze a completed reminder',
      });
    }

    if (reminder.snoozeCount >= reminder.maxSnoozes) {
      return res.status(400).json({
        success: false,
        message: `Maximum snoozes (${reminder.maxSnoozes}) reached`,
      });
    }

    await reminder.snooze(minutes);

    res.status(200).json({
      success: true,
      data: reminder,
      message: `Reminder snoozed for ${minutes} minutes`,
    });
  } catch (error) {
    console.error('❌ Snooze reminder error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to snooze reminder',
      error: error.message,
    });
  }
};

// @desc    Complete a reminder
// @route   POST /api/v1/reminders/:id/complete
// @access  Private
export const completeReminder = async (req, res) => {
  try {
    const reminder = await Reminder.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!reminder) {
      return res.status(404).json({
        success: false,
        message: 'Reminder not found',
      });
    }

    await reminder.complete();

    res.status(200).json({
      success: true,
      data: reminder,
      message: 'Reminder marked as complete',
    });
  } catch (error) {
    console.error('❌ Complete reminder error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete reminder',
      error: error.message,
    });
  }
};

// @desc    Cancel a reminder
// @route   POST /api/v1/reminders/:id/cancel
// @access  Private
export const cancelReminder = async (req, res) => {
  try {
    const reminder = await Reminder.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!reminder) {
      return res.status(404).json({
        success: false,
        message: 'Reminder not found',
      });
    }

    reminder.status = 'cancelled';
    await reminder.save();

    res.status(200).json({
      success: true,
      data: reminder,
      message: 'Reminder cancelled',
    });
  } catch (error) {
    console.error('❌ Cancel reminder error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel reminder',
      error: error.message,
    });
  }
};

// @desc    Mark reminder as read
// @route   POST /api/v1/reminders/:id/read
// @access  Private
export const markAsRead = async (req, res) => {
  try {
    const reminder = await Reminder.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!reminder) {
      return res.status(404).json({
        success: false,
        message: 'Reminder not found',
      });
    }

    await reminder.markAsRead();

    res.status(200).json({
      success: true,
      data: reminder,
      message: 'Reminder marked as read',
    });
  } catch (error) {
    console.error('❌ Mark as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark as read',
      error: error.message,
    });
  }
};

// @desc    Process due reminders (called by background worker)
// @route   GET /api/v1/reminders/process-due
// @access  Private (internal)
export const processDueReminders = async (req, res) => {
  try {
    const dueReminders = await Reminder.getDueReminders();

    const processed = [];
    for (const reminder of dueReminders) {
      reminder.lastRemindedAt = new Date();
      await reminder.save();

      processed.push({
        reminder: reminder,
      });
    }

    res.status(200).json({
      success: true,
      processed: processed.length,
      data: processed,
    });
  } catch (error) {
    console.error('❌ Process due reminders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process reminders',
      error: error.message,
    });
  }
};

// @desc    Create a reminder from voice note
// @route   POST /api/v1/reminders/from-voice
// @access  Private
export const createFromVoice = async (req, res) => {
  try {
    const { transcript, scheduledFor } = req.body;

    if (!transcript) {
      return res.status(400).json({
        success: false,
        message: 'Please provide transcript',
      });
    }

    // Simple NLP to extract reminder info
    let title = 'Reminder';
    let message = transcript;
    let parsedScheduledFor = scheduledFor || new Date(Date.now() + 3600000);

    // Try to extract time from transcript
    const timeMatch = transcript.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i);
    if (timeMatch) {
      try {
        const parsed = new Date();
        const timeStr = timeMatch[1];
        const hours = parseInt(timeStr);
        const isPM = timeStr.toLowerCase().includes('pm');
        parsed.setHours(isPM ? hours + 12 : hours, 0, 0, 0);
        if (parsed > new Date()) {
          parsedScheduledFor = parsed;
        }
      } catch (e) {
        // Fallback to default
      }
    }

    const reminder = await Reminder.create({
      userId: req.user._id,
      title: title,
      message: message,
      scheduledFor: parsedScheduledFor,
      context: 'Created from voice note',
    });

    res.status(201).json({
      success: true,
      data: reminder,
      message: 'Reminder created from voice',
    });
  } catch (error) {
    console.error('❌ Voice reminder error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create reminder from voice',
      error: error.message,
    });
  }
};

// @desc    Register push token for user
// @route   POST /api/v1/reminders/register-token
// @access  Private
export const registerToken = async (req, res) => {
  try {
    const { pushToken } = req.body;

    if (!pushToken) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a push token',
      });
    }

    const result = await registerPushToken(req.user._id, pushToken);

    if (result.success) {
      res.status(200).json({
        success: true,
        message: result.message,
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message || 'Failed to register token',
      });
    }
  } catch (error) {
    console.error('❌ Register token error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register push token',
      error: error.message,
    });
  }
};