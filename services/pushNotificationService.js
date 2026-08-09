// services/pushNotificationService.js

/**
 * Send a push notification via Expo's push API
 * This is the standalone service that can be imported by other modules
 */
export const sendPushNotification = async (notification) => {
  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: notification.to,
        title: notification.title,
        body: notification.body,
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