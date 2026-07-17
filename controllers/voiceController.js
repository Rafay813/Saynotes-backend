import { transcribeAudioWithGroq, isGroqAvailable } from '../services/groqTranscriptionService.js';
import { aiParsingService } from '../services/aiService.js';
import { syncWithGoogleCalendar } from '../services/calendarService.js';
import Item from '../models/Item.js';

/**
 * Process voice input - transcribe and create item
 * @route   POST /api/voice/process
 * @access  Private
 */
export const processVoice = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No audio file provided' });
    }

    if (!isGroqAvailable()) {
      return res.status(503).json({ 
        success: false,
        message: 'Voice service unavailable. Please check GROQ_API_KEY configuration.' 
      });
    }

    console.log('🎤 Processing voice input...');
    console.log('📁 File info:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
    });

    // ✅ Transcribe audio
    const transcript = await transcribeAudioWithGroq(
      req.file.buffer,
      req.file.mimetype
    );

    if (!transcript || transcript.trim().length === 0) {
      return res.status(400).json({ 
        success: false,
        message: 'No speech detected. Please try again.' 
      });
    }

    console.log('📝 Transcript:', transcript);

    // ✅ Get user timezone from request
    const userTimezone = req.body.timezone || 'UTC';
    console.log('🌍 User timezone:', userTimezone);

    // ✅ Parse with AI
    const parsed = await aiParsingService(transcript, {
      timezone: userTimezone,
      now: new Date(),
    });

    console.log('🤖 Parsed result:', parsed);
    console.log('📅 AI startTime (UTC):', parsed.startTime);
    console.log('📌 Client booking detected:', parsed.isClientBooking ? 'YES' : 'NO');
    console.log('📌 Subtasks detected:', parsed.subtasks?.length || 0);

    // ✅ Create item data
    const itemData = {
      userId: req.user._id,
      type: parsed.type || 'Note',
      title: parsed.title || transcript.slice(0, 60),
      content: parsed.content || transcript,
      startTime: parsed.startTime || null,
      endTime: parsed.endTime || null,
      status: 'active',
      priority: req.body.priority || 'medium',
      category: req.body.category || 'General',
      isClientBooking: parsed.isClientBooking || false,
      clientName: parsed.clientName || null,
      clientEmail: parsed.clientEmail || null,
    };

    // ✅ Phase 2: Add subtasks if Task with multiple items
    if (parsed.type === 'Task' && parsed.subtasks?.length > 0) {
      itemData.subtasks = parsed.subtasks.map(text => ({ text, done: false }));
      console.log('✅ Subtasks added:', itemData.subtasks.length);
    }

    const item = new Item(itemData);
    const savedItem = await item.save();

    // ✅ Generate video link if client booking
    if (savedItem.isClientBooking && savedItem.type === 'Event') {
      savedItem.videoCallLink = `https://meet.jit.si/SayNote-${savedItem._id}`;
      await savedItem.save();
      console.log('✅ Video call link generated:', savedItem.videoCallLink);
    }

    // ✅ Phase 1: Auto-create linked Event for Reminders with time
    let linkedItem = null;
    if (savedItem.type === 'Reminder' && savedItem.startTime) {
      const eventEnd = new Date(savedItem.startTime);
      eventEnd.setHours(eventEnd.getHours() + 1);

      linkedItem = new Item({
        userId: req.user._id,
        type: 'Event',
        title: savedItem.title,
        content: savedItem.content,
        startTime: savedItem.startTime,
        endTime: eventEnd,
        status: 'active',
        category: savedItem.category,
        linkedReminderId: savedItem._id,
      });
      await linkedItem.save();

      // ✅ Sync linked Event with Google Calendar
      try {
        const gcalResponse = await syncWithGoogleCalendar(linkedItem);
        linkedItem.googleEventId = gcalResponse.googleEventId;
        linkedItem.isSynced = true;
        await linkedItem.save();
        console.log('✅ Linked event synced with Google Calendar');
      } catch (gcalError) {
        console.warn('⚠️ Google Calendar sync failed for linked event:', gcalError.message);
      }

      savedItem.linkedEventId = linkedItem._id;
      await savedItem.save();

      console.log('✅ Linked calendar event created:', linkedItem._id);
    }

    console.log('✅ Item created from voice:', savedItem._id);
    console.log('📌 Type:', savedItem.type);
    console.log('📌 Client booking:', savedItem.isClientBooking ? 'YES' : 'NO');
    console.log('📌 Subtasks:', savedItem.subtasks?.length || 0);
    console.log('📅 Final startTime (UTC):', savedItem.startTime);

    res.status(201).json({
      success: true,
      message: 'Voice processed successfully',
      transcript,
      parsed: {
        type: parsed.type,
        title: parsed.title,
        startTime: parsed.startTime,
        endTime: parsed.endTime,
        isClientBooking: parsed.isClientBooking,
        clientName: parsed.clientName,
        clientEmail: parsed.clientEmail,
        subtasks: parsed.subtasks || [],
      },
      item: savedItem,
      linkedItem: linkedItem,
    });
  } catch (error) {
    console.error('❌ Voice processing error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to process voice input',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Transcribe audio only (without creating item)
 */
export const transcribeOnly = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No audio file provided' });
    }

    if (!isGroqAvailable()) {
      return res.status(503).json({ 
        success: false,
        message: 'Voice service unavailable. Please check GROQ_API_KEY configuration.' 
      });
    }

    const transcript = await transcribeAudioWithGroq(
      req.file.buffer,
      req.file.mimetype
    );

    if (!transcript || transcript.trim().length === 0) {
      return res.status(400).json({ 
        success: false,
        message: 'No speech detected. Please try again.' 
      });
    }

    res.status(200).json({
      success: true,
      transcript,
    });
  } catch (error) {
    console.error('❌ Transcription error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to transcribe audio',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Parse text with AI (without transcription)
 */
export const parseText = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const { text, timezone } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ 
        success: false,
        message: 'Text is required' 
      });
    }

    const parsed = await aiParsingService(text, {
      timezone: timezone || 'UTC',
      now: new Date(),
    });

    console.log('🤖 Parsed result:', parsed);

    res.status(200).json({
      success: true,
      parsed,
    });
  } catch (error) {
    console.error('❌ Parse error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to parse text',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

export default {
  processVoice,
  transcribeOnly,
  parseText,
};