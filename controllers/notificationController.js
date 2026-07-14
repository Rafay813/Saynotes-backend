import { sendPushNotification } from '../services/notificationService.js';

// @desc    Schedule a delayed notification
// @route   POST /api/v1/notifications/schedule
// @access  Private
export const scheduleNotification = async (req, res) => {
  try {
    const { title, message, delayMs, itemId, expoPushToken } = req.body;

    if (!title || !message || delayMs === undefined) {
      return res.status(400).json({ message: 'Please provide title, message, and delayMs' });
    }

    const delay = parseInt(delayMs, 10);

    console.log(`[Notification Scheduler] Scheduled: "${title}" in ${delay}ms`);

    setTimeout(() => {
      sendPushNotification({
        title,
        message,
        userId: req.user._id.toString(),
        itemId,
        expoPushToken,
      });
    }, delay);

    res.status(200).json({
      message: 'Notification scheduled successfully',
      scheduledFor: new Date(Date.now() + delay),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
