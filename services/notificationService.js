// Simple notification service - works without Expo SDK
// For production, install: npm install expo-server-sdk

// Store user push tokens (in production, store in database)
const userPushTokens = new Map();

/**
 * Register a user's push token
 */
export const registerPushToken = async (userId, pushToken) => {
  try {
    if (!pushToken || typeof pushToken !== 'string' || pushToken.length < 10) {
      return { success: false, message: 'Invalid push token' };
    }

    // Store the token (in production, save to database)
    if (!userPushTokens.has(userId)) {
      userPushTokens.set(userId, []);
    }
    
    const tokens = userPushTokens.get(userId);
    if (!tokens.includes(pushToken)) {
      tokens.push(pushToken);
      userPushTokens.set(userId, tokens);
    }

    console.log(`✅ Push token registered for user ${userId}`);
    return { success: true, message: 'Push token registered' };
  } catch (error) {
    console.error('❌ Register push token error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send a push notification to a user (console version for testing)
 */
export const sendPushNotification = async (notificationData) => {
  try {
    const { userId, title, body, data = {}, sound = 'default' } = notificationData;

    // Get user's push tokens
    const tokens = userPushTokens.get(userId) || [];
    
    if (tokens.length === 0) {
      console.log(`⚠️ No push tokens found for user ${userId}`);
      // Still log the notification for testing
      console.log(`📤 [NOTIFICATION] To: ${userId}`);
      console.log(`📤 Title: ${title}`);
      console.log(`📤 Body: ${body}`);
      console.log(`📤 Data:`, data);
      return { success: true, message: 'Notification logged (no tokens)' };
    }

    console.log(`📤 Sending push notification to ${tokens.length} devices for user ${userId}`);
    console.log(`📤 Title: ${title}`);
    console.log(`📤 Body: ${body}`);
    
    // In production, use Expo SDK or Firebase to send actual notifications
    // For now, log the notification
    tokens.forEach(token => {
      console.log(`  - Token: ${token.substring(0, 20)}...`);
    });

    return { 
      success: true, 
      sent: tokens.length,
      message: `Notification sent to ${tokens.length} devices`,
    };
  } catch (error) {
    console.error('❌ Send notification error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send a voice-enabled notification (with TTS audio)
 */
export const sendVoiceNotification = async (notificationData) => {
  try {
    const { userId, title, body, audioBase64, data = {} } = notificationData;

    console.log(`🎤 Sending voice notification to user ${userId}`);
    console.log(`📤 Title: ${title}`);
    console.log(`📤 Body: ${body}`);
    
    if (audioBase64) {
      console.log(`📤 Audio: ${audioBase64.length} characters (base64)`);
    } else {
      console.log(`📤 Audio: Using device TTS`);
    }

    // Send the notification with audio attached
    const result = await sendPushNotification({
      userId,
      title,
      body,
      data: {
        ...data,
        type: 'voice_reminder',
        audioBase64: audioBase64 || null,
        hasAudio: !!audioBase64,
      },
      sound: 'default',
    });

    return result;
  } catch (error) {
    console.error('❌ Send voice notification error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send a check-in notification
 */
export const sendCheckInNotification = async (userId, taskTitle) => {
  try {
    console.log(`📋 Sending check-in notification to user ${userId}`);
    console.log(`📤 Task: ${taskTitle}`);
    
    return await sendPushNotification({
      userId,
      title: 'Task Check-In',
      body: `Did you complete "${taskTitle}"?`,
      data: {
        type: 'check_in',
        taskTitle,
        actions: ['yes', 'no', 'snooze', 'reschedule'],
      },
      sound: 'default',
    });
  } catch (error) {
    console.error('❌ Send check-in error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Get push tokens for a user
 */
export const getUserPushTokens = (userId) => {
  return userPushTokens.get(userId) || [];
};

export default {
  registerPushToken,
  sendPushNotification,
  sendVoiceNotification,
  sendCheckInNotification,
  getUserPushTokens,
};