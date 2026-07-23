/**
 * Shared notification-sending logic.
 * Used directly by controllers/notificationController.js and workers/checkInWorker.js
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Send a push notification via Expo Push API
 * 
 * @param {object} params
 * @param {string} params.title - Notification title
 * @param {string} params.message - Notification body
 * @param {string} [params.userId] - User ID (for logging)
 * @param {string} [params.itemId] - Item ID (for deep linking)
 * @param {string} [params.expoPushToken] - Recipient's Expo push token
 * @param {object} [params.data] - Additional data payload
 * @returns {Promise<{delivered: boolean, reason?: string}>}
 */
export const sendPushNotification = async ({ 
  title, 
  message, 
  userId, 
  itemId, 
  expoPushToken,
  data = {} 
}) => {
  // If we don't have a device push token, just log
  if (!expoPushToken) {
    console.log('\n----------------------------------------');
    console.log('[NOTIFICATION] (No push token)');
    if (userId) console.log(`User: ${userId}`);
    if (itemId) console.log(`Item: ${itemId}`);
    console.log(`Title: ${title}`);
    console.log(`Message: ${message}`);
    console.log('----------------------------------------\n');
    return { delivered: false, reason: 'no_push_token' };
  }

  // If no Expo access token, log but don't send
  if (!process.env.EXPO_ACCESS_TOKEN) {
    console.log('\n----------------------------------------');
    console.log('[NOTIFICATION] (No EXPO_ACCESS_TOKEN)');
    if (userId) console.log(`User: ${userId}`);
    if (itemId) console.log(`Item: ${itemId}`);
    console.log(`Title: ${title}`);
    console.log(`Message: ${message}`);
    console.log('----------------------------------------\n');
    return { delivered: false, reason: 'no_expo_token_configured' };
  }

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${process.env.EXPO_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        to: expoPushToken,
        title: title,
        body: message,
        sound: 'default',
        priority: 'high',
        data: {
          itemId: itemId,
          ...data,
        },
      }),
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error(`Expo push failed (${response.status}):`, responseData);
      return { 
        delivered: false, 
        reason: responseData.errors?.[0]?.message || 'push_provider_error' 
      };
    }

    console.log(`✅ Push notification sent to token: ${expoPushToken.substring(0, 10)}...`);
    return { delivered: true, response: responseData };
  } catch (error) {
    console.error('Error sending push notification:', error.message);
    return { delivered: false, reason: error.message };
  }
};

/**
 * Send notification about a new item
 */
export const sendNewItemNotification = async (userId, item, expoPushToken) => {
  const titles = {
    'Task': '📋 New Task',
    'Event': '📅 New Event',
    'Reminder': '⏰ New Reminder',
    'Note': '📝 New Note',
  };

  const title = titles[item.type] || '📌 New Item';
  const message = item.title || 'A new item has been added';

  return await sendPushNotification({
    title,
    message,
    userId,
    itemId: item._id?.toString(),
    expoPushToken,
    data: {
      type: 'new_item',
      itemType: item.type,
    },
  });
};

/**
 * Send daily summary notification
 */
export const sendDailySummaryNotification = async (userId, items, expoPushToken) => {
  const count = items.length;
  if (count === 0) {
    return await sendPushNotification({
      title: '🌅 Good Morning!',
      message: 'You have no items scheduled for today. Enjoy your day!',
      userId,
      expoPushToken,
      data: { type: 'daily_summary', count: 0 },
    });
  }

  let message = `You have ${count} item${count > 1 ? 's' : ''} scheduled for today.`;
  
  // Add first few items to message
  if (count <= 3) {
    const itemTitles = items.map(item => item.title).join(', ');
    message += `\n${itemTitles}`;
  } else {
    const firstThree = items.slice(0, 3).map(item => item.title).join(', ');
    message += `\n${firstThree} and ${count - 3} more...`;
  }

  return await sendPushNotification({
    title: '🌅 Good Morning!',
    message,
    userId,
    expoPushToken,
    data: { type: 'daily_summary', count },
  });
};

/**
 * Send notification for upcoming item
 */
export const sendUpcomingNotification = async (userId, item, minutesUntil, expoPushToken) => {
  return await sendPushNotification({
    title: '⏰ Upcoming Reminder',
    message: `"${item.title}" starts in ${minutesUntil} minutes`,
    userId,
    itemId: item._id?.toString(),
    expoPushToken,
    data: {
      type: 'upcoming',
      itemType: item.type,
      minutesUntil,
    },
  });
};

/**
 * Send notification when item is completed
 */
export const sendItemCompletedNotification = async (userId, item, expoPushToken) => {
  return await sendPushNotification({
    title: '✅ Item Completed!',
    message: `"${item.title}" has been marked as completed`,
    userId,
    itemId: item._id?.toString(),
    expoPushToken,
    data: {
      type: 'item_completed',
      itemType: item.type,
    },
  });
};

export default {
  sendPushNotification,
  sendNewItemNotification,
  sendDailySummaryNotification,
  sendUpcomingNotification,
  sendItemCompletedNotification,
};