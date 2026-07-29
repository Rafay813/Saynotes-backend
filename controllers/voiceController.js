import mongoose from 'mongoose';
import { transcribeAudioWithGroq, isGroqAvailable } from '../services/groqTranscriptionService.js';
import { aiParsingService } from '../services/aiService.js';
import { syncWithGoogleCalendar } from '../services/calendarService.js';
import { parseDateTime, calculateEndTime, extractEmail, detectClientBooking } from '../utils/dateUtils.js';
import Item from '../models/Item.js';
import { invalidateDashboardCache } from './dashboardController.js';

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

    console.log('🎤 Processing voice input (optimized)...');

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
    console.log(`📝 Transcript: "${transcript}" (${Date.now() - startTime}ms)`);

    // Step 2: AI Classification
    const timezone = req.body.timezone || 'UTC';
    console.log(`🌍 Timezone: ${timezone}`);

    const classified = await aiParsingService(transcript);
    console.log(`🤖 Classified: ${Date.now() - startTime}ms`);

    // Step 3: Parse Date/Time - FIXED with current time + 3 hours default
    let startTimeParsed = null;
    let endTime = null;

    console.log(`📅 Date from AI: "${classified.date}"`);
    console.log(`⏰ Time from AI: "${classified.time}"`);

    let dateToUse = classified.date;

    // ✅ If we have time but no date, default to "today"
    if (!dateToUse && classified.time) {
      dateToUse = 'today';
      console.log('📅 No date provided, defaulting to "today"');
    }

    // ✅ If we have date but no time, use current time + 3 hours
    if (dateToUse && !classified.time) {
      const now = new Date();
      const threeHoursLater = new Date(now.getTime() + 3 * 60 * 60 * 1000);
      const hours = String(threeHoursLater.getHours()).padStart(2, '0');
      const minutes = String(threeHoursLater.getMinutes()).padStart(2, '0');
      classified.time = `${hours}:${minutes}`;
      console.log(`⏰ No time provided, defaulting to current time + 3 hours: ${classified.time}`);
    }

    // ✅ If no date and no time, default to today at current time + 3 hours
    if (!dateToUse && !classified.time) {
      dateToUse = 'today';
      const now = new Date();
      const threeHoursLater = new Date(now.getTime() + 3 * 60 * 60 * 1000);
      const hours = String(threeHoursLater.getHours()).padStart(2, '0');
      const minutes = String(threeHoursLater.getMinutes()).padStart(2, '0');
      classified.time = `${hours}:${minutes}`;
      console.log(`📅⏰ No date/time provided, defaulting to "today" at ${classified.time} (current time + 3 hours)`);
    }

    // Parse date and time
    if (dateToUse) {
      startTimeParsed = parseDateTime(dateToUse, classified.time, timezone);
      console.log(`📅 Parsed startTime: ${startTimeParsed ? startTimeParsed.toISOString() : 'null'}`);
      
      if (startTimeParsed) {
        endTime = calculateEndTime(
          startTimeParsed,
          classified.endTime,
          classified.duration,
          timezone
        );
        console.log(`⏱️ Parsed endTime: ${endTime ? endTime.toISOString() : 'null'}`);
      }
    } else {
      console.warn('⚠️ No date or time extracted by AI');
    }

    // Step 4: Extract Email & Detect Client
    const clientEmail = extractEmail(transcript);
    const isClientBooking = detectClientBooking(transcript, classified.person);
    const clientName = isClientBooking ? classified.person : null;
    console.log(`👤 Client: ${clientName || 'none'}, Booking: ${isClientBooking}`);

    // Step 5: Use AI-generated title
    const title = classified.title;
    console.log(`📝 Final title: "${title}"`);

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

    console.log(`📦 Final item data:`, JSON.stringify(itemData, null, 2));

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
      console.log('✅ Video link generated before save');
    }

    // Step 9: Create and Save Item
    const savedItem = await Item.create(itemData);
    invalidateDashboardCache(req.user._id);
    console.log(`✅ Item created: ${savedItem._id} (${Date.now() - startTime}ms)`);

    // Step 10: REMINDER → EVENT AUTO-CREATION
    let linkedEvent = null;
    if (savedItem.type === 'Reminder' && savedItem.startTime) {
      console.log(`🔗 Creating linked Event from Reminder: "${savedItem.title}"`);
      
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
      
      console.log(`✅ Linked Event created: ${linkedEvent._id}`);
      
      await Item.findByIdAndUpdate(savedItem._id, {
        $set: { linkedEventId: linkedEvent._id }
      });
      
      console.log(`🔗 Reminder ${savedItem._id} linked to Event ${linkedEvent._id}`);
    }

    console.log(`✅ Voice processed in ${Date.now() - startTime}ms`);

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
            console.log('✅ Google Calendar synced (background)');
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
            console.log('✅ Linked event synced (background)');
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
      message: 'Failed to process voice input',
      errorCode: 'INTERNAL_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
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