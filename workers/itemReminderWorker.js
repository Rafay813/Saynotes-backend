import { DateTime } from 'luxon';
import Item from '../models/Item.js';
import User from '../models/User.js';
import { sendPushNotification } from '../services/pushNotificationService.js';
import { generateReminderAudio, formatReminderText } from '../services/voiceReminderService.js';

let reminderWorkerInterval = null;

/**
 * Process due reminders (Items with type: 'Reminder')
 */
export const processDueReminders = async () => {
  try {
    const now = DateTime.now();
    const startOfMinute = now.startOf('minute').toJSDate();
    const endOfMinute = now.endOf('minute').toJSDate();

    // Find active reminders due in this minute
    const dueReminders = await Item.find({
      type: 'Reminder',
      status: 'active',
      startTime: {
        $gte: startOfMinute,
        $lte: endOfMinute,
      },
    });

    console.log(`⏰ Found ${dueReminders.length} due reminders`);

    for (const reminder of dueReminders) {
      await sendReminderNotification(reminder);
    }

    // Also check for tasks needing check-in (15-45 min after start)
    const checkinTasks = await Item.find({
      type: 'Task',
      status: 'active',
      startTime: {
        $lt: now.minus({ minutes: 15 }).toJSDate(),
        $gt: now.minus({ minutes: 45 }).toJSDate(),
      },
    });

    for (const task of checkinTasks) {
      // Skip if already triggered
      if (task.checkInTriggered) continue;
      
      await sendCheckInNotification(task);
      
      // Mark as triggered to avoid duplicate notifications
      task.checkInTriggered = true;
      await task.save();
    }
  } catch (error) {
    console.error('❌ Error processing due reminders:', error);
  }
};

/**
 * Send a reminder notification with TTS audio
 */
const sendReminderNotification = async (reminder) => {
  try {
    const user = await User.findById(reminder.userId);
    if (!user || !user.expoPushToken) {
      console.log(`⚠️ No push token for user ${reminder.userId}`);
      return;
    }

    const formattedText = formatReminderText(reminder);
    
    // Generate TTS audio
    let audioUrl = null;
    try {
      const audio = await generateReminderAudio(formattedText);
      if (audio) {
        audioUrl = audio.audioUrl;
      }
    } catch (error) {
      console.warn('⚠️ Failed to generate TTS audio:', error.message);
    }

    const result = await sendPushNotification({
      userId: reminder.userId.toString(),
      title: '⏰ Reminder',
      body: reminder.title,
      data: {
        type: 'reminder',
        itemId: reminder._id.toString(),
        title: reminder.title,
        content: reminder.content || '',
        startTime: reminder.startTime,
        formattedText,
        audioUrl,
      },
      sound: 'default',
      priority: 'high',
    });

    console.log(`✅ Reminder notification sent for: ${reminder.title}`);
    return result;
  } catch (error) {
    console.error(`❌ Failed to send reminder for ${reminder._id}:`, error);
    return null;
  }
};

/**
 * Send a check-in notification for a task
 */
const sendCheckInNotification = async (task) => {
  try {
    const user = await User.findById(task.userId);
    if (!user || !user.expoPushToken) {
      console.log(`⚠️ No push token for user ${task.userId}`);
      return;
    }

    const result = await sendPushNotification({
      userId: task.userId.toString(),
      title: '📋 Task Check-In',
      body: `Did you complete "${task.title}"?`,
      data: {
        type: 'check_in',
        itemId: task._id.toString(),
        title: task.title,
        content: task.content || '',
        startTime: task.startTime,
      },
      sound: 'default',
      priority: 'high',
    });

    console.log(`✅ Check-in notification sent for: ${task.title}`);
    return result;
  } catch (error) {
    console.error(`❌ Failed to send check-in for ${task._id}:`, error);
    return null;
  }
};

/**
 * Start the reminder worker
 */
export const startReminderWorker = () => {
  if (reminderWorkerInterval) {
    clearInterval(reminderWorkerInterval);
  }

  console.log('⏰ Starting item reminder worker...');
  
  // Run immediately
  processDueReminders();

  // Then run every minute
  reminderWorkerInterval = setInterval(processDueReminders, 60000);
};

/**
 * Stop the reminder worker
 */
export const stopReminderWorker = () => {
  if (reminderWorkerInterval) {
    clearInterval(reminderWorkerInterval);
    reminderWorkerInterval = null;
    console.log('⏰ Reminder worker stopped');
  }
};

/**
 * Run initial reminder cleanup
 */
export const runInitialReminderCleanup = async () => {
  try {
    const now = new Date();
    
    // Mark expired reminders as expired
    const result = await Item.updateMany(
      {
        type: 'Reminder',
        status: 'active',
        startTime: { $lt: now },
      },
      { status: 'expired' }
    );
    console.log(`✅ Cleaned up ${result.modifiedCount} expired reminders`);
  } catch (error) {
    console.error('❌ Error cleaning up reminders:', error);
  }
};

export default {
  processDueReminders,
  startReminderWorker,
  stopReminderWorker,
  runInitialReminderCleanup,
};