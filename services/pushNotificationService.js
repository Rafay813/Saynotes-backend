import User from '../models/User.js';

/**
 * Send a push notification via Expo's push API
 * @param {Object} notification - { to, userId, title, body, message, data, sound, priority }
 */
export const sendPushNotification = async (notification) => {
  try {
    let targetToken = notification.to;

    // If userId is provided, look up the token
    if (notification.userId) {
      const user = await User.findById(notification.userId);
      if (user && user.expoPushToken) {
        targetToken = user.expoPushToken;
      } else {
        console.log(`⚠️ No push token found for user: ${notification.userId}`);
        return { success: false, error: 'No push token found' };
      }
    }

    if (!targetToken) {
      console.log('⚠️ No target token provided');
      return { success: false, error: 'No target token' };
    }

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: targetToken,
        title: notification.title || 'SayNotes',
        body: notification.body || notification.message || 'You have a reminder',
        data: notification.data || {},
        sound: notification.sound || 'default',
        priority: notification.priority || 'high',
      }),
    });

    const result = await response.json();
    
    if (result.data && result.data.status === 'ok') {
      console.log('✅ Push notification sent successfully');
      return { success: true, result };
    } else {
      console.error('❌ Push notification failed:', result);
      return { success: false, error: result };
    }
  } catch (error) {
    console.error('❌ Error sending push notification:', error);
    return { success: false, error: error.message };
  }
};

export default { sendPushNotification };