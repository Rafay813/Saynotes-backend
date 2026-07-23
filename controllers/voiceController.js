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

    // Step 2: AI Classification
    const timezone = req.body.timezone || 'UTC';
    console.log(`🌍 Timezone: ${timezone}`);

    const classified = await aiParsingService(transcript);
    console.log('🤖 Classified:', JSON.stringify(classified, null, 2));

    // Step 3: Parse Date/Time
    let startTime = null;
    let endTime = null;

    console.log(`📅 Date from AI: "${classified.date}"`);
    console.log(`⏰ Time from AI: "${classified.time}"`);

    // If we have time but no date, default to "today"
    let dateToUse = classified.date;
    
    if (!dateToUse && classified.time) {
      dateToUse = 'today';
      console.log('📅 No date provided, defaulting to "today"');
    }

    // Parse date and time
    if (dateToUse) {
      startTime = parseDateTime(dateToUse, classified.time, timezone);
      console.log(`📅 Parsed startTime: ${startTime ? startTime.toISOString() : 'null'}`);
      
      if (startTime) {
        // Calculate end time
        endTime = calculateEndTime(
          startTime,
          classified.endTime,
          classified.duration,
          timezone
        );
        console.log(`⏱️ Parsed endTime: ${endTime ? endTime.toISOString() : 'null'}`);
      }
    } else {
      console.warn('⚠️ No date or time extracted by AI');
    }

    // Step 4: Extract Email
    const clientEmail = extractEmail(transcript);
    console.log(`📧 Email: ${clientEmail || 'none'}`);

    // Step 5: Detect Client Booking
    const isClientBooking = detectClientBooking(transcript, classified.person);
    const clientName = isClientBooking ? classified.person : null;
    console.log(`👤 Client: ${clientName || 'none'}, Booking: ${isClientBooking}`);

    // Step 6: Build Item Data
    const itemData = {
      userId: req.user._id,
      type: classified.type || 'Note',
      title: classified.title || transcript.slice(0, 60),
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

    // Step 7: Add subtasks if Task
    if (classified.type === 'Task' && classified.subtasks?.length > 0) {
      itemData.subtasks = classified.subtasks.map(text => ({ text, done: false }));
    }

    // Step 8: Create and Save Item
    const item = new Item(itemData);
    const savedItem = await item.save();

    console.log(`✅ Item created: ${savedItem._id}`);
    console.log(`📅 StartTime saved: ${savedItem.startTime}`);

    // ✅ Step 9: REMINDER → EVENT AUTO-CREATION
    // If type is "Reminder" AND there's a startTime, ALSO create a linked Event
    let linkedEvent = null;
    if (savedItem.type === 'Reminder' && savedItem.startTime) {
      console.log(`🔗 Creating linked Event from Reminder: "${savedItem.title}"`);
      
      // Calculate end time for the event (default 30 minutes)
      let eventEndTime = new Date(savedItem.startTime);
      eventEndTime.setMinutes(eventEndTime.getMinutes() + 30);
      
      // If we have an endTime from the original, use it
      if (savedItem.endTime) {
        eventEndTime = savedItem.endTime;
      }
      
      // Create the linked Event
      const eventData = {
        userId: req.user._id,
        type: 'Event',
        title: `Event: ${savedItem.title}`,
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
        // Link back to the reminder
        linkedReminderId: savedItem._id,
        isLinkedEvent: true,
      };

      // Add video call link if client booking
      if (eventData.isClientBooking) {
        eventData.videoCallLink = `https://meet.jit.si/SayNote-${savedItem._id}`;
      }

      const eventItem = new Item(eventData);
      linkedEvent = await eventItem.save();
      
      console.log(`✅ Linked Event created: ${linkedEvent._id}`);
      
      // ✅ FIXED: Use $set only, no mixed operators
      await Item.findByIdAndUpdate(savedItem._id, {
        $set: { linkedEventId: linkedEvent._id }
      });
      
      console.log(`🔗 Reminder ${savedItem._id} linked to Event ${linkedEvent._id}`);

      // ✅ FIXED: Sync the linked Event with Google Calendar
      try {
        const syncResult = await syncWithGoogleCalendar(linkedEvent);
        console.log('✅ Linked event synced with Google Calendar:', syncResult);
      } catch (calendarError) {
        console.error('⚠️ Linked event calendar sync error (non-fatal):', calendarError);
      }
    }

    // Step 10: Generate video link if client booking and type is Event
    if (savedItem.type === 'Event' && savedItem.isClientBooking) {
      savedItem.videoCallLink = `https://meet.jit.si/SayNote-${savedItem._id}`;
      await savedItem.save();
      console.log('✅ Video link generated for Event');
    }

    // Step 11: Sync with Google Calendar if connected (skip linked events to avoid duplicates)
    // ✅ FIXED: Check isLinkedEvent flag
    if (savedItem.type === 'Event' && savedItem.startTime && !savedItem.isLinkedEvent) {
      try {
        const syncResult = await syncWithGoogleCalendar(savedItem);
        console.log('✅ Google Calendar sync result:', syncResult);
      } catch (calendarError) {
        console.error('⚠️ Calendar sync error (non-fatal):', calendarError);
        // Don't fail the request if calendar sync fails
      }
    }

    // Step 12: Return Response with both items if linked
    const responseData = {
      success: true,
      message: 'Voice processed successfully',
      transcript,
      item: savedItem,
    };

    // If we created a linked event, include it in the response
    if (linkedEvent) {
      responseData.linkedEvent = linkedEvent;
      responseData.message = 'Voice processed successfully. Linked Event created from Reminder.';
    }

    return res.status(201).json(responseData);

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
 * Parse text with AI
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