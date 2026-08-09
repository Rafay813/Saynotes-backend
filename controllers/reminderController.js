import { DateTime } from 'luxon';
import Item from '../models/Item.js';
import User from '../models/User.js'; // ✅ Fixed: User imported
import { invalidateDashboardCache } from './dashboardController.js';
import { sendPushNotification } from '../services/pushNotificationService.js';
import { generateReminderAudio, formatReminderText } from '../services/voiceReminderService.js';

/**
 * Get all reminders for the user (with pagination)
 */
export const getReminders = async (req, res) => {
  try {
    const { status, type, limit = 20, page = 1 } = req.query;
    
    const query = {
      userId: req.user._id,
      type: { $in: ['Reminder', 'Event'] }, // Both types are "reminder-like"
    };
    
    if (status) query.status = status;
    if (type) query.type = type;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [reminders, total] = await Promise.all([
      Item.find(query)
        .sort({ startTime: 1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Item.countDocuments(query),
    ]);

    res.json({
      success: true,
      reminders: reminders.map(r => ({
        id: r._id,
        title: r.title,
        content: r.content,
        type: r.type,
        status: r.status,
        startTime: r.startTime,
        endTime: r.endTime,
        priority: r.priority,
        category: r.category,
        createdAt: r.createdAt,
        formattedText: formatReminderText(r),
      })),
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('❌ Failed to get reminders:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Get upcoming reminders (next hour)
 */
export const getUpcomingReminders = async (req, res) => {
  try {
    const { timezone = 'Asia/Karachi' } = req.query;
    const now = DateTime.now().setZone(timezone);
    const nextHour = now.plus({ hours: 1 });

    const reminders = await Item.find({
      userId: req.user._id,
      type: 'Reminder',
      status: 'active',
      startTime: {
        $gte: now.toJSDate(),
        $lt: nextHour.toJSDate(),
      },
    }).sort({ startTime: 1 });

    res.json({
      success: true,
      reminders: reminders.map(r => ({
        id: r._id,
        title: r.title,
        content: r.content,
        startTime: r.startTime,
        formattedText: formatReminderText(r),
      })),
    });
  } catch (error) {
    console.error('❌ Failed to get upcoming reminders:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Snooze a reminder (Item)
 */
export const snoozeReminder = async (req, res) => {
  try {
    const { minutes, until } = req.body;
    const { timezone = 'Asia/Karachi' } = req.query;
    const itemId = req.params.id;

    const item = await Item.findOne({ _id: itemId, userId: req.user._id });
    if (!item) {
      return res.status(404).json({ success: false, error: 'Reminder not found' });
    }

    const now = DateTime.now().setZone(timezone);
    let newStartTime = null;

    if (minutes) {
      newStartTime = now.plus({ minutes }).toJSDate();
    } else if (until) {
      const parsed = DateTime.fromISO(until).setZone(timezone);
      if (parsed.isValid) {
        newStartTime = parsed.toJSDate();
      } else {
        return res.status(400).json({ success: false, error: 'Invalid date format for "until"' });
      }
    } else {
      newStartTime = now.plus({ minutes: 5 }).toJSDate();
    }

    item.startTime = newStartTime;
    item.status = 'active';
    await item.save();
    invalidateDashboardCache(req.user._id);

    res.json({
      success: true,
      item: {
        id: item._id,
        title: item.title,
        startTime: item.startTime,
      },
      message: `Snoozed until ${DateTime.fromJSDate(newStartTime).setZone(timezone).toFormat('yyyy-MM-dd HH:mm')}`,
    });
  } catch (error) {
    console.error('❌ Failed to snooze:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Complete a reminder (Item)
 */
export const completeReminder = async (req, res) => {
  try {
    const itemId = req.params.id;

    const item = await Item.findOne({ _id: itemId, userId: req.user._id });
    if (!item) {
      return res.status(404).json({ success: false, error: 'Reminder not found' });
    }

    item.status = 'completed';
    item.completedAt = new Date().toISOString();
    await item.save();
    invalidateDashboardCache(req.user._id);

    res.json({
      success: true,
      item: {
        id: item._id,
        title: item.title,
        status: item.status,
      },
      message: `✅ Completed: ${item.title}`,
    });
  } catch (error) {
    console.error('❌ Failed to complete:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Get tasks needing check-in
 */
export const getCheckInTasks = async (req, res) => {
  try {
    const { timezone = 'Asia/Karachi' } = req.query;
    const now = DateTime.now().setZone(timezone);
    const today = now.startOf('day');

    const tasks = await Item.find({
      userId: req.user._id,
      type: 'Task',
      status: 'active',
      startTime: {
        $gte: today.toJSDate(),
        $lt: now.toJSDate(),
      },
    }).sort({ startTime: 1 });

    const checkinTasks = tasks.filter(task => {
      if (!task.startTime) return false;
      const scheduled = DateTime.fromISO(task.startTime).setZone(timezone);
      const minutesPassed = now.diff(scheduled, 'minutes').minutes;
      return minutesPassed >= 15 && minutesPassed <= 45;
    });

    res.json({
      success: true,
      tasks: checkinTasks.map(t => ({
        id: t._id,
        title: t.title,
        content: t.content,
        startTime: t.startTime,
        formattedText: `Did you complete "${t.title}"?`,
      })),
    });
  } catch (error) {
    console.error('❌ Failed to get check-in tasks:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Respond to a task check-in
 */
export const respondToCheckIn = async (req, res) => {
  try {
    const { response } = req.body; // 'done', 'working_on_it', 'snooze', 'reschedule'
    const { timezone = 'Asia/Karachi' } = req.query;
    const itemId = req.params.id;

    const item = await Item.findOne({ _id: itemId, userId: req.user._id });
    if (!item) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }

    let result = {};
    const now = DateTime.now().setZone(timezone);

    switch (response) {
      case 'done':
        item.status = 'completed';
        item.completedAt = new Date().toISOString();
        await item.save();
        invalidateDashboardCache(req.user._id);
        result = { item, message: `✅ Completed: ${item.title}` };
        break;

      case 'working_on_it':
        result = { item, message: '✅ Keep going! You\'re working on this.' };
        break;

      case 'snooze':
        item.startTime = now.plus({ minutes: 15 }).toJSDate();
        item.status = 'active';
        await item.save();
        invalidateDashboardCache(req.user._id);
        result = { 
          item, 
          message: `⏰ Snoozed for 15 minutes until ${now.plus({ minutes: 15 }).toFormat('HH:mm')}` 
        };
        break;

      case 'reschedule':
        const { newDate, newTime } = req.body;
        if (newDate && newTime) {
          const newStart = DateTime.fromISO(`${newDate}T${newTime}`).setZone(timezone);
          if (newStart.isValid) {
            item.startTime = newStart.toJSDate();
            await item.save();
            invalidateDashboardCache(req.user._id);
            result = { 
              item, 
              message: `✅ Rescheduled to ${newStart.toFormat('yyyy-MM-dd HH:mm')}` 
            };
          } else {
            return res.status(400).json({ success: false, error: 'Invalid date/time format' });
          }
        } else {
          return res.status(400).json({ success: false, error: 'New date/time required for reschedule' });
        }
        break;

      default:
        return res.status(400).json({ success: false, error: 'Invalid response type' });
    }

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('❌ Failed to process check-in response:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Hear Now - Generate TTS audio for a reminder
 */
export const hearNow = async (req, res) => {
  try {
    const itemId = req.params.id;

    const item = await Item.findOne({ _id: itemId, userId: req.user._id });
    if (!item) {
      return res.status(404).json({ success: false, error: 'Reminder not found' });
    }

    const text = formatReminderText(item);
    const audio = await generateReminderAudio(text);

    if (!audio) {
      // Fallback: return the text so client can use device TTS
      return res.json({
        success: true,
        audioUrl: null,
        text: text,
        useDeviceTTS: true,
      });
    }

    res.json({
      success: true,
      audioUrl: audio.audioUrl,
      text: text,
      useDeviceTTS: false,
    });
  } catch (error) {
    console.error('❌ Failed to generate TTS:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Register push token (stored in User model)
 */
export const registerToken = async (req, res) => {
  try {
    const { expoPushToken, platform } = req.body;
    
    if (!expoPushToken) {
      return res.status(400).json({ success: false, error: 'expoPushToken is required' });
    }

    await User.findByIdAndUpdate(req.user._id, {
      expoPushToken,
      platform: platform || 'unknown',
      pushTokenUpdatedAt: new Date(),
    });

    res.json({ success: true, message: 'Push token registered successfully' });
  } catch (error) {
    console.error('❌ Failed to register push token:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};