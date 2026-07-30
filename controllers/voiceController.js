import mongoose from 'mongoose';
import { transcribeAudioWithGroq, isGroqAvailable } from '../services/groqTranscriptionService.js';
import { aiParsingService } from '../services/aiService.js';
import { syncWithGoogleCalendar } from '../services/calendarService.js';
import { 
  parseDateTime, 
  calculateEndTime, 
  extractEmail, 
  detectClientBooking
  // ✅ parseTimeString removed - not needed directly
} from '../utils/dateUtils.js';
import Item from '../models/Item.js';
import { invalidateDashboardCache } from './dashboardController.js';
import { DateTime } from 'luxon';

// ✅ Development logging helper
const devLog = (...args) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(...args);
  }
};

/**
 * Process voice input with Optimized Performance
 */
export const processVoice = async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Validate user
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
        errorCode: 'UNAUTHORIZED',
      });
    }

    // Validate audio
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No audio file provided',
        errorCode: 'MISSING_AUDIO',
      });
    }

    // Check Groq availability
    if (!isGroqAvailable()) {
      return res.status(503).json({
        success: false,
        message: 'Voice service unavailable',
        errorCode: 'SERVICE_UNAVAILABLE',
      });
    }

    devLog('🎤 Processing voice input (optimized)...');

    // Step 1: Transcribe
    const transcription = await transcribeAudioWithGroq(req.file.buffer, req.file.mimetype);
    if (!transcription.success) {
      return res.status(400).json({
        success: false,
        message: transcription.message,
        errorCode: transcription.error,
      });
    }

    const transcript = transcription.transcript;
    devLog(`📝 Transcript: "${transcript}" (${Date.now() - startTime}ms)`);

    // Step 2: AI Classification
    const timezone = req.body.timezone || 'Asia/Karachi';
    devLog(`🌍 Timezone: ${timezone}`);

    const classified = await aiParsingService(transcript);
    devLog(`🤖 Classified: ${Date.now() - startTime}ms`);
    devLog('🤖 AI Response:', JSON.stringify(classified, null, 2));

    // ✅ Step 3: Parse Date/Time using dateUtils.js - ALL parsing is here!
    let startTimeParsed = null;
    let endTime = null;

    devLog(`📅 Date from AI: "${classified.date}"`);
    devLog(`⏰ Time from AI: "${classified.time}"`);

    // Get current time in user's timezone
    const nowInTimezone = DateTime.now().setZone(timezone);
    devLog(`🕐 Current time in ${timezone}: ${nowInTimezone.toFormat('yyyy-MM-dd HH:mm')}`);

    // ✅ Use parseDateTime for ALL date/time parsing
    // No manual parsing in the controller!
    const dateToUse = classified.date || 'today';
    const timeToUse = classified.time || null;

    devLog(`📅 Using date: "${dateToUse}", time: "${timeToUse}"`);

    try {
      // ✅ Let parseDateTime handle everything:
      // - "today", "tomorrow", "Friday", "next Monday"
      // - "in 5 days", "in 2 weeks"
      // - "11:45 PM", "10:30 am", "noon", "evening"
      // - Timezone conversion
      // - Past date handling
      startTimeParsed = parseDateTime(dateToUse, timeToUse, timezone);
      
      if (!startTimeParsed) {
        throw new Error('parseDateTime returned null');
      }
      
      devLog(`✅ Parsed startTime (UTC): ${startTimeParsed.toISOString()}`);
      const startLocal = DateTime.fromJSDate(startTimeParsed).setZone(timezone);
      devLog(`✅ Parsed startTime (local): ${startLocal.toFormat('yyyy-MM-dd HH:mm')}`);
      
    } catch (parseError) {
      console.error('❌ Date parsing error:', parseError);
      devLog('🔄 Using fallback: current time + 3 hours');
      
      // Fallback: current time + 3 hours
      const fallbackTime = nowInTimezone.plus({ hours: 3 });
      startTimeParsed = fallbackTime.toJSDate();
      devLog(`🔄 Fallback time: ${fallbackTime.toFormat('yyyy-MM-dd HH:mm')}`);
    }

    // ✅ Calculate end time using dateUtils.js
    if (startTimeParsed) {
      endTime = calculateEndTime(
        startTimeParsed,
        classified.endTime,
        classified.duration || '30 minutes',
        timezone
      );
      devLog(`⏱️ End time (UTC): ${endTime?.toISOString()}`);
      
      if (endTime) {
        const endLocal = DateTime.fromJSDate(endTime).setZone(timezone);
        devLog(`⏱️ End time (local): ${endLocal.toFormat('yyyy-MM-dd HH:mm')}`);
      }
    }

    // Step 4: Extract Email & Detect Client
    const clientEmail = extractEmail(transcript);
    const isClientBooking = detectClientBooking(transcript, classified.person);
    const clientName = isClientBooking ? classified.person : null;
    devLog(`👤 Client: ${clientName || 'none'}, Booking: ${isClientBooking}`);

    // Step 5: Use AI-generated title
    const title = classified.title || 'Untitled';
    devLog(`📝 Final title: "${title}"`);

    // Step 6: Build Item Data
    const itemData = {
      userId: req.user._id,
      type: classified.type || 'Note',
      title: title,
      content: transcript,
      startTime: startTimeParsed || null,
      endTime: endTime || null,
      status: 'active',
      priority: req.body.priority || 'medium',
      category: req.body.category || 'General',
      isClientBooking: isClientBooking && clientName !== null,
      clientName: clientName,
      clientEmail: clientEmail,
      repeat: classified.repeat || 'none',
      location: classified.location || null,
    };

    devLog(`📦 Final item data:`, JSON.stringify(itemData, (key, value) => {
      if (value instanceof Date) return value.toISOString();
      return value;
    }, 2));

    // Step 7: Add subtasks for Tasks
    if (classified.type === 'Task') {
      const subtaskItems = classified.items || classified.subtasks || [];
      if (subtaskItems.length > 0) {
        itemData.subtasks = subtaskItems.map(text => ({ text, done: false }));
      }
    }

    // Step 8: Generate video link for client bookings
    if (isClientBooking && (classified.type === 'Event' || classified.type === 'Reminder')) {
      const newId = new mongoose.Types.ObjectId();
      itemData.videoCallLink = `https://meet.jit.si/SayNote-${newId}`;
      devLog('✅ Video link generated before save');
    }

    // Step 9: Create and Save Item
    const savedItem = await Item.create(itemData);
    invalidateDashboardCache(req.user._id);
    devLog(`✅ Item created: ${savedItem._id} (${Date.now() - startTime}ms)`);

    // Step 10: REMINDER → EVENT AUTO-CREATION
    let linkedEvent = null;
    if (savedItem.type === 'Reminder' && savedItem.startTime) {
      devLog(`🔗 Creating linked Event from Reminder: "${savedItem.title}"`);
      
      let eventEndTime = savedItem.endTime || new Date(savedItem.startTime.getTime() + 30 * 60 * 1000);
      
      let eventVideoLink = null;
      if (savedItem.isClientBooking) {
        const newId = new mongoose.Types.ObjectId();
        eventVideoLink = `https://meet.jit.si/SayNote-${newId}`;
      }
      
      const eventData = {
        userId: req.user._id,
        type: 'Event',
        title: savedItem.title,
        content: `Linked to reminder: "${savedItem.title}"\nOriginal transcript: ${transcript}`,
        startTime: savedItem.startTime,
        endTime: eventEndTime,
        status: 'active',
        priority: savedItem.priority || 'medium',
        category: savedItem.category || 'General',
        isClientBooking: savedItem.isClientBooking || false,
        clientName: savedItem.clientName || null,
        clientEmail: savedItem.clientEmail || null,
        location: savedItem.location || null,
        linkedReminderId: savedItem._id,
        isLinkedEvent: true,
        videoCallLink: eventVideoLink,
      };

      linkedEvent = await Item.create(eventData);
      invalidateDashboardCache(req.user._id);
      
      devLog(`✅ Linked Event created: ${linkedEvent._id}`);
      
      await Item.findByIdAndUpdate(savedItem._id, {
        $set: { linkedEventId: linkedEvent._id }
      });
      
      devLog(`🔗 Reminder ${savedItem._id} linked to Event ${linkedEvent._id}`);
    }

    devLog(`✅ Voice processed in ${Date.now() - startTime}ms`);

    // Step 11: Send response immediately
    const responseData = {
      success: true,
      message: 'Voice processed successfully',
      transcript,
      item: savedItem,
    };

    if (linkedEvent) {
      responseData.linkedEvent = linkedEvent;
      responseData.message = 'Voice processed successfully. Linked Event created from Reminder.';
    }

    res.status(201).json(responseData);

    // Step 12: Background tasks - Google Calendar sync
    if (savedItem.type === 'Event' && savedItem.startTime && !savedItem.isLinkedEvent) {
      setImmediate(async () => {
        try {
          const syncResult = await syncWithGoogleCalendar(savedItem);
          if (syncResult && syncResult.googleEventId) {
            savedItem.googleEventId = syncResult.googleEventId;
            savedItem.isSynced = true;
            await savedItem.save();
            devLog('✅ Google Calendar synced (background)');
          }
        } catch (gcalError) {
          console.warn('⚠️ Calendar sync error (non-fatal):', gcalError.message);
        }
      });
    }

    if (linkedEvent) {
      setImmediate(async () => {
        try {
          const syncResult = await syncWithGoogleCalendar(linkedEvent);
          if (syncResult && syncResult.googleEventId) {
            linkedEvent.googleEventId = syncResult.googleEventId;
            linkedEvent.isSynced = true;
            await linkedEvent.save();
            devLog('✅ Linked event synced (background)');
          }
        } catch (gcalError) {
          console.warn('⚠️ Linked event sync error (non-fatal):', gcalError.message);
        }
      });
    }

    return;

  } catch (error) {
    console.error('❌ Voice processing error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process voice input. Please try again.',
      errorCode: 'VOICE_PROCESSING_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred',
    });
  }
};

/**
 * Transcribe audio only
 */
export const transcribeOnly = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
        errorCode: 'UNAUTHORIZED',
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No audio file provided',
        errorCode: 'MISSING_AUDIO',
      });
    }

    if (!isGroqAvailable()) {
      return res.status(503).json({
        success: false,
        message: 'Voice service unavailable',
        errorCode: 'SERVICE_UNAVAILABLE',
      });
    }

    const transcription = await transcribeAudioWithGroq(req.file.buffer, req.file.mimetype);
    if (!transcription.success) {
      return res.status(400).json({
        success: false,
        message: transcription.message,
        errorCode: transcription.error,
      });
    }

    return res.status(200).json({
      success: true,
      transcript: transcription.transcript,
    });

  } catch (error) {
    console.error('❌ Transcription error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to transcribe audio',
      errorCode: 'INTERNAL_ERROR',
    });
  }
};

/**
 * Parse text with AI (no audio required)
 */
export const parseText = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
        errorCode: 'UNAUTHORIZED',
      });
    }

    const { text, timezone } = req.body;
    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Text is required',
        errorCode: 'MISSING_TEXT',
      });
    }

    if (!isGroqAvailable()) {
      return res.status(503).json({
        success: false,
        message: 'AI service unavailable',
        errorCode: 'SERVICE_UNAVAILABLE',
      });
    }

    const classified = await aiParsingService(text);
    return res.status(200).json({
      success: true,
      parsed: classified,
    });

  } catch (error) {
    console.error('❌ Parse error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to parse text',
      errorCode: 'INTERNAL_ERROR',
    });
  }
};

export default {
  processVoice,
  transcribeOnly,
  parseText,
};