import cron from 'node-cron';
import Reminder from '../models/Reminder.js';
import { textToSpeech } from '../services/ttsService.js';

// Track processed reminders to avoid duplicates
const processedReminders = new Set();

// Clean up processed set periodically
setInterval(() => {
  processedReminders.clear();
  console.log('🧹 Cleaned processed reminders set');
}, 60000);

// Run initial cleanup for overdue reminders
export const runInitialReminderCleanup = async () => {
  try {
    console.log('🧹 Running initial reminder cleanup...');
    
    const now = new Date();
    const overdueReminders = await Reminder.find({
      status: 'pending',
      $or: [
        { scheduledFor: { $lte: now } },
        { snoozedUntil: { $lte: now } },
      ],
    });

    if (overdueReminders.length > 0) {
      console.log(`⏰ Found ${overdueReminders.length} overdue reminders`);
      
      for (const reminder of overdueReminders) {
        if (reminder.snoozeCount >= reminder.maxSnoozes) {
          reminder.status = 'overdue';
          await reminder.save();
          console.log(`📌 Reminder ${reminder._id} marked as overdue (max snoozes reached)`);
        }
      }
    }
    
    console.log('✅ Initial reminder cleanup complete');
  } catch (error) {
    console.error('❌ Initial reminder cleanup error:', error);
  }
};

// Send notification with TTS audio
const sendReminderNotification = async (reminder) => {
  try {
    // Generate TTS audio for the reminder
    console.log(`🎤 Generating TTS for reminder: ${reminder.title}`);
    const ttsResult = await textToSpeech(
      `${reminder.title}. ${reminder.message}`
    );

    // Prepare notification data with audio
    const notificationData = {
      userId: reminder.userId._id,
      title: reminder.title,
      body: reminder.message,
      data: {
        reminderId: reminder._id.toString(),
        type: 'reminder',
        priority: reminder.priority,
        category: reminder.category,
        canSnooze: reminder.snoozeCount < reminder.maxSnoozes,
        audioBase64: ttsResult.audioBase64 || null,
        useDeviceTTS: ttsResult.useDeviceTTS || false,
        provider: ttsResult.provider || 'unknown',
        actions: ['hear_now', 'snooze_5', 'snooze_10', 'complete'],
      },
      sound: 'default',
    };

    console.log(`📤 Notification prepared for reminder: ${reminder._id}`);
    console.log(`   TTS Provider: ${ttsResult.provider || 'unknown'}`);
    
    if (ttsResult.audioBase64) {
      console.log(`   Audio size: ${ttsResult.audioBase64.length} characters (base64)`);
    } else if (ttsResult.useDeviceTTS) {
      console.log(`   Using device TTS`);
    }

    // Log the notification
    console.log(`📤 [NOTIFICATION] To: ${reminder.userId._id}`);
    console.log(`📤 Title: ${reminder.title}`);
    console.log(`📤 Body: ${reminder.message}`);
    console.log(`📤 Actions: hear_now, snooze_5, snooze_10, complete`);

    return {
      success: true,
      notificationData,
      ttsResult,
    };
  } catch (error) {
    console.error('❌ Send notification error:', error);
    return { success: false, error: error.message };
  }
};

// Start the reminder worker
export const startReminderWorker = () => {
  console.log('🔄 Reminder worker started - checking every minute');

  cron.schedule('* * * * *', async () => {
    console.log('⏰ Checking for due reminders...');
    
    try {
      const now = new Date();
      
      const dueReminders = await Reminder.find({
        status: 'pending',
        $or: [
          { scheduledFor: { $lte: now } },
          { snoozedUntil: { $lte: now, $ne: null } },
        ],
      }).populate('userId', 'name email');

      if (dueReminders.length === 0) {
        return;
      }

      const newDueReminders = dueReminders.filter(
        r => !processedReminders.has(r._id.toString())
      );

      if (newDueReminders.length === 0) {
        return;
      }

      console.log(`🔔 Found ${newDueReminders.length} new due reminders`);

      for (const reminder of newDueReminders) {
        // Mark as processed
        processedReminders.add(reminder._id.toString());

        // Update reminder status
        reminder.lastRemindedAt = new Date();
        
        if (reminder.status === 'snoozed') {
          reminder.status = 'pending';
        }
        
        await reminder.save();

        // Send notification with TTS audio
        await sendReminderNotification(reminder);

        // ✅ Schedule follow-up check-in ONLY if:
        // 1. followUpRequired is true
        // 2. followUpAsked is false (not already asked)
        // 3. It's NOT already a follow-up reminder
        if (reminder.followUpRequired && !reminder.followUpAsked && !reminder.tags?.includes('follow-up')) {
          const followUpTime = new Date(now.getTime() + 15 * 60 * 1000);
          const followUpReminder = new Reminder({
            userId: reminder.userId._id,
            title: `Follow-up: ${reminder.title}`,
            message: `Did you complete "${reminder.title}"?`,
            scheduledFor: followUpTime,
            priority: 'high',
            context: `Follow-up for reminder ${reminder._id}`,
            followUpRequired: false,
            followUpAsked: true,
            tags: ['follow-up', 'check-in'],
          });
          
          await followUpReminder.save();
          
          // ✅ Mark original reminder as follow-up asked
          reminder.followUpAsked = true;
          await reminder.save();
          
          console.log(`📌 Follow-up reminder scheduled for ${followUpTime.toLocaleString()}`);
        }

        console.log(`✅ Processed reminder: ${reminder._id}`);
      }
    } catch (error) {
      console.error('❌ Reminder worker error:', error);
    }
  });
};

export default startReminderWorker;