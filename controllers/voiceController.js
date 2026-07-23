import mongoose from 'mongoose';
import { transcribeAudioWithGroq, isGroqAvailable } from '../services/groqTranscriptionService.js';
import { aiParsingService } from '../services/aiService.js';
import { syncWithGoogleCalendar } from '../services/calendarService.js';
import { parseDateTime, calculateEndTime, extractEmail, detectClientBooking } from '../utils/dateUtils.js';
import Item from '../models/Item.js';

/**
 * Process voice input with Reminder → Event auto-creation
 */
export const processVoice = async (req, res) => {
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

    console.log('🎤 Processing voice input...');

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
    console.log(`📝 Transcript: "${transcript}"`);

    // Step 2: AI Classification (includes AI-generated title)
    const timezone = req.body.timezone || 'UTC';
    console.log(`🌍 Timezone: ${timezone}`);

    const classified = await aiParsingService(transcript);
    console.log('🤖 Classified:', JSON.stringify(classified, null, 2));

    // Step 3: Parse Date/Time
    let startTime = null;
    let endTime = null;

    console.log(`📅 Date from AI: "${classified.date}"`);
    console.log(`⏰ Time from AI: "${classified.time}"`);

    let dateToUse = classified.date;
    if (!dateToUse && classified.time) {
      dateToUse = 'today';
      console.log('📅 No date provided, defaulting to "today"');
    }

    if (dateToUse) {
      startTime = parseDateTime(dateToUse, classified.time, timezone);
      console.log(`📅 Parsed startTime: ${startTime ? startTime.toISOString() : 'null'}`);
      
      if (startTime) {
        endTime = calculateEndTime(
          startTime,
          classified.endTime,
          classified.duration,
          timezone
        );
        console.log(`⏱️ Parsed endTime: ${endTime ? endTime.toISOString() : 'null'}`);
      }
    }

    // Step 4: Extract Email
    const clientEmail = extractEmail(transcript);
    console.log(`📧 Email: ${clientEmail || 'none'}`);

    // Step 5: Detect Client Booking
    const isClientBooking = detectClientBooking(transcript, classified.person);
    const clientName = isClientBooking ? classified.person : null;
    console.log(`👤 Client: ${clientName || 'none'}, Booking: ${isClientBooking}`);

    // Step 6: Use AI-generated title (already cleaned in aiService)
    const title = classified.title;
    console.log(`📝 Final title: "${title}"`);

    // Step 7: Build Item Data
    const itemData = {
      userId: req.user._id,
      type: classified.type || 'Note',
      title: title,
      content: transcript,
      startTime: startTime || null,
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

    // Step 8: Add items/subtasks
    if (classified.type === 'Task') {
      if (classified.items && classified.items.length > 0) {
        itemData.subtasks = classified.items.map(text => ({ text, done: false }));
      }
      if (classified.subtasks && classified.subtasks.length > 0) {
        itemData.subtasks = classified.subtasks.map(text => ({ text, done: false }));
      }
    }

    // Step 9: Generate video link before save
    let videoCallLink = null;
    if (isClientBooking && (classified.type === 'Event' || classified.type === 'Reminder')) {
      const newId = new mongoose.Types.ObjectId();
      videoCallLink = `https://meet.jit.si/SayNote-${newId}`;
      itemData.videoCallLink = videoCallLink;
      console.log('✅ Video link generated before save:', videoCallLink);
    }

    // Step 10: Create and Save Item
    const savedItem = await Item.create(itemData);

    console.log(`✅ Item created: ${savedItem._id}`);
    console.log(`📝 Title: ${savedItem.title}`);
    console.log(`📝 Content: ${savedItem.content}`);

    // Step 11: REMINDER → EVENT AUTO-CREATION
    let linkedEvent = null;
    if (savedItem.type === 'Reminder' && savedItem.startTime) {
      console.log(`🔗 Creating linked Event from Reminder: "${savedItem.title}"`);
      
      let eventEndTime = new Date(savedItem.startTime);
      eventEndTime.setMinutes(eventEndTime.getMinutes() + 30);
      
      if (savedItem.endTime) {
        eventEndTime = savedItem.endTime;
      }
      
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
      
      console.log(`✅ Linked Event created: ${linkedEvent._id}`);
      
      await Item.findByIdAndUpdate(savedItem._id, {
        $set: { linkedEventId: linkedEvent._id }
      });
      
      console.log(`🔗 Reminder ${savedItem._id} linked to Event ${linkedEvent._id}`);
    }

    // Step 12: Send response
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

    // Step 13: Background tasks - Google Calendar sync
    if (savedItem.type === 'Event' && savedItem.startTime && !savedItem.isLinkedEvent) {
      setImmediate(async () => {
        try {
          const syncResult = await syncWithGoogleCalendar(savedItem);
          if (syncResult && syncResult.googleEventId) {
            savedItem.googleEventId = syncResult.googleEventId;
            savedItem.isSynced = true;
            await savedItem.save();
            console.log('✅ Google Calendar synced (background):', syncResult);
          }
        } catch (gcalError) {
          console.warn('⚠️ Calendar sync error (non-fatal, background):', gcalError.message);
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
            console.log('✅ Linked event synced (background):', syncResult);
          }
        } catch (gcalError) {
          console.warn('⚠️ Linked event sync error (non-fatal, background):', gcalError.message);
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