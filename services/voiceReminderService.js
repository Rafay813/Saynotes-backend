// backend/services/voiceReminderService.js

import { DateTime } from 'luxon';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Item from '../models/Item.js';
import { invalidateDashboardCache } from '../controllers/dashboardController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ Dynamic import for Google TTS (optional - won't crash if not installed)
let ttsClient = null;
let isTTSAvailable = false;

try {
  // Try to dynamically import Google TTS
  const { TextToSpeechClient } = await import('@google-cloud/text-to-speech');
  
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    ttsClient = new TextToSpeechClient();
    isTTSAvailable = true;
    console.log('✅ Google TTS initialized');
  } else {
    console.log('⚠️ Google TTS credentials not found, using device fallback');
  }
} catch (error) {
  console.log('⚠️ Google TTS not installed or failed to load:', error.message);
  console.log('ℹ️ Voice reminders will use device TTS fallback');
}

// Audio cache directory
const AUDIO_CACHE_DIR = path.join(__dirname, '../audio-cache');
if (!fs.existsSync(AUDIO_CACHE_DIR)) {
  fs.mkdirSync(AUDIO_CACHE_DIR, { recursive: true });
}

/**
 * Generate TTS audio for a reminder (with graceful fallback)
 */
export async function generateReminderAudio(text, voice = 'en-US-Neural2-F') {
  // If Google TTS is not available, return null (client will use device TTS)
  if (!isTTSAvailable || !ttsClient) {
    console.log('⚠️ TTS not available, client will use device fallback');
    return null;
  }

  try {
    const request = {
      input: { text },
      voice: {
        languageCode: 'en-US',
        name: voice,
        ssmlGender: 'FEMALE',
      },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: 1.0,
        pitch: 0,
      },
    };

    const [response] = await ttsClient.synthesizeSpeech(request);
    const audioContent = response.audioContent;

    // Cache the audio
    const hash = Buffer.from(text).toString('base64').substring(0, 20);
    const filename = `${hash}-${Date.now()}.mp3`;
    const filepath = path.join(AUDIO_CACHE_DIR, filename);
    fs.writeFileSync(filepath, audioContent);

    return {
      audioUrl: `/api/audio/${filename}`,
      filepath,
      filename,
    };
  } catch (error) {
    console.error('❌ TTS generation failed:', error.message);
    return null;
  }
}

/**
 * Get reminder text with context
 */
export function formatReminderText(item) {
  let text = `Reminder: ${item.title}`;
  
  if (item.content) {
    text += `. ${item.content}`;
  }
  
  if (item.startTime) {
    const time = DateTime.fromISO(item.startTime).toFormat('h:mm a');
    text += ` for ${time}`;
  }
  
  if (item.location) {
    text += ` at ${item.location}`;
  }
  
  return text;
}

/**
 * Snooze an item
 */
export async function snoozeItem(itemId, userId, minutes = null, until = null, timezone = 'Asia/Karachi') {
  const item = await Item.findOne({ _id: itemId, userId });
  if (!item) {
    throw new Error('Item not found');
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
      throw new Error('Invalid date format for "until"');
    }
  } else {
    // Default: snooze for 5 minutes
    newStartTime = now.plus({ minutes: 5 }).toJSDate();
  }

  item.startTime = newStartTime;
  item.status = 'active';
  await item.save();
  invalidateDashboardCache(userId);

  return {
    item,
    newStartTime: newStartTime.toISOString(),
    message: `Snoozed until ${DateTime.fromJSDate(newStartTime).setZone(timezone).toFormat('yyyy-MM-dd HH:mm')}`,
  };
}

/**
 * Mark item as complete
 */
export async function completeItem(itemId, userId) {
  const item = await Item.findOne({ _id: itemId, userId });
  if (!item) {
    throw new Error('Item not found');
  }

  item.status = 'completed';
  item.completedAt = new Date().toISOString();
  await item.save();
  invalidateDashboardCache(userId);

  return {
    item,
    message: `✅ Completed: ${item.title}`,
  };
}

/**
 * Check-in on incomplete tasks (Task Check-Ins)
 */
export async function getPendingTasksForCheckIn(userId, timezone = 'Asia/Karachi') {
  const now = DateTime.now().setZone(timezone);
  const today = now.startOf('day');
  const tomorrow = today.plus({ days: 1 });

  // Get tasks that were scheduled for today and are still active
  const tasks = await Item.find({
    userId,
    type: 'Task',
    status: 'active',
    startTime: {
      $gte: today.toJSDate(),
      $lt: tomorrow.toJSDate(),
    },
  }).sort({ startTime: 1 });

  return tasks;
}

/**
 * Check if it's time for a check-in
 */
export function shouldCheckIn(item, timezone = 'Asia/Karachi') {
  if (!item.startTime) return false;
  
  const now = DateTime.now().setZone(timezone);
  const scheduled = DateTime.fromISO(item.startTime).setZone(timezone);
  const timePassed = now.diff(scheduled, 'minutes').minutes;
  
  // Check-in 15-30 minutes after scheduled time
  return timePassed >= 15 && timePassed <= 45;
}

export default {
  generateReminderAudio,
  formatReminderText,
  snoozeItem,
  completeItem,
  getPendingTasksForCheckIn,
  shouldCheckIn,
};