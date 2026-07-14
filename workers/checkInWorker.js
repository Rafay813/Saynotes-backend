import Item from '../models/Item.js';
import User from '../models/User.js';
import { sendPushNotification } from '../services/notificationService.js';

/**
 * Background worker to check for items that need check-in
 * Can be imported into server.js and initialized, e.g., startCheckInWorker()
 */
export const startCheckInWorker = () => {
  const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  console.log('[WORKER] Check-in worker started...');

  setInterval(async () => {
    try {
      const now = new Date();

      // Find active tasks or events in the past that haven't triggered check-in
      const itemsToCheckIn = await Item.find({
        type: { $in: ['Task', 'Event'] },
        status: 'active',
        checkInTriggered: false,
        $or: [
          { endTime: { $lte: now, $ne: null } },
          { startTime: { $lte: now, $ne: null }, endTime: null }
        ]
      });

      for (const item of itemsToCheckIn) {
        // Mark as triggered
        item.checkInTriggered = true;
        await item.save();

        console.log(`[WORKER] Triggering check-in push notification for item: ${item.title}`);

        const user = await User.findById(item.userId).select('expoPushToken');

        // Uses the same underlying delivery logic as POST /api/v1/notifications/schedule,
        // called directly (no HTTP round-trip needed since we're in-process).
        // The client should respond via PATCH /api/items/:id/status with either
        // { status: 'completed' } or { reschedule: true, new_time: '...' }, which
        // routes back into the confirmation-card assistant loop.
        await sendPushNotification({
          title: 'Did you get this done?',
          message: `Did you complete "${item.title}"?`,
          userId: item.userId.toString(),
          itemId: item._id.toString(),
          expoPushToken: user?.expoPushToken,
        });
      }
    } catch (error) {
      console.error('[WORKER] Error during check-in scan:', error);
    }
  }, CHECK_INTERVAL_MS);
};
