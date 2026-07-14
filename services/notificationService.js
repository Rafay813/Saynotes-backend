/**
 * Shared notification-sending logic.
 * Used directly by controllers/notificationController.js (the public
 * /api/v1/notifications/schedule endpoint) and by workers/checkInWorker.js
 * (which needs to fire check-in prompts without an HTTP round-trip).
 *
 * Swap the body of `sendPushNotification` for a real push provider
 * (Expo Push API, FCM, APNs, etc.) when one is wired up — see EXPO_ACCESS_TOKEN
 * in .env.example for the Expo Push Notifications option.
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * @param {object} params
 * @param {string} params.title
 * @param {string} params.message
 * @param {string} [params.userId]
 * @param {string} [params.itemId]
 * @param {string} [params.expoPushToken] - Recipient's Expo push token, if known.
 */
export const sendPushNotification = async ({ title, message, userId, itemId, expoPushToken }) => {
  // If we don't have a device push token (e.g. not wired up yet), just log —
  // this keeps the worker/dev flow functional without a push provider configured.
  if (!expoPushToken || !process.env.EXPO_ACCESS_TOKEN) {
    console.log('\n----------------------------------------');
    console.log('[NOTIFICATION]');
    if (userId) console.log(`User: ${userId}`);
    if (itemId) console.log(`Item: ${itemId}`);
    console.log(`Title: ${title}`);
    console.log(`Message: ${message}`);
    console.log('----------------------------------------\n');
    return { delivered: false, reason: 'no_push_token_configured' };
  }

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        to: expoPushToken,
        title,
        body: message,
        data: { itemId },
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error(`Expo push failed (${response.status}): ${errText}`);
      return { delivered: false, reason: 'push_provider_error' };
    }

    return { delivered: true };
  } catch (error) {
    console.error('Error sending push notification:', error.message);
    return { delivered: false, reason: error.message };
  }
};
