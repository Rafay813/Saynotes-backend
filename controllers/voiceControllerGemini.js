import { transcribeAudioWithGemini } from '../services/geminiTranscriptionService.js';
import { parseWithGemini } from '../services/geminiAIService.js';
import Item from '../models/Item.js';

export const processVoice = async (req, res) => {
  const startTime = Date.now();
  
  try {
    console.log('📥 Voice request received:');
    console.log('📁 User:', req.user);
    console.log('📁 File:', req.file ? {
      fieldname: req.file.fieldname,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
    } : 'No file');

    // ✅ 1. Validate file exists
    if (!req.file) {
      console.error('❌ No file in request');
      return res.status(400).json({
        success: false,
        error: 'No audio file provided',
      });
    }

    // ✅ 2. Get user ID from authenticated request
    const userId = req.user?.id || req.user?._id || req.userId;
    if (!userId) {
      console.error('❌ No user ID in request');
      return res.status(401).json({
        success: false,
        error: 'Unauthorized - User not authenticated',
      });
    }

    console.log('🎤 Processing voice recording from user:', userId);
    console.log('📁 File info:', {
      fieldname: req.file.fieldname,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
    });

    // ✅ 3. Transcribe with Gemini
    console.log('🎤 Starting Gemini transcription...');
    const transcript = await transcribeAudioWithGemini(req.file.buffer, req.file.mimetype);
    
    if (!transcript || transcript.trim().length === 0 || transcript === 'No speech detected') {
      return res.status(400).json({
        success: false,
        error: 'No speech detected in recording',
      });
    }

    console.log('📝 Transcript:', transcript);

    // ✅ 4. Process with Gemini AI
    console.log('🤖 Processing with Gemini AI...');
    const parsed = await parseWithGemini(transcript, req.body.timezone || 'Asia/Karachi');
    console.log('✅ AI parsed:', parsed);

    // ✅ 5. Create and save item
    const itemData = {
      userId,
      type: parsed.type || 'Note',
      title: parsed.title || transcript.slice(0, 30),
      content: parsed.content || transcript,
      category: parsed.category || 'General',
      completed: false,
    };

    if (parsed.priority) {
      itemData.priority = parsed.priority;
    }

    if (parsed.date) {
      const dateObj = new Date(parsed.date);
      if (!isNaN(dateObj.getTime())) {
        itemData.date = dateObj.toISOString().split('T')[0];
      }
    }

    if (parsed.time) {
      itemData.time = parsed.time;
    }

    console.log('💾 Saving item:', itemData);
    const item = new Item(itemData);
    const savedItem = await item.save();
    console.log('✅ Item saved:', savedItem._id);

    const processingTime = Date.now() - startTime;

    // ✅ 6. Return response
    res.status(200).json({
      success: true,
      transcript: transcript,
      item: {
        _id: savedItem._id,
        type: savedItem.type,
        title: savedItem.title,
        date: savedItem.date || null,
        time: savedItem.time || null,
        completed: savedItem.completed || false,
      },
      processingTime: processingTime,
    });

  } catch (error) {
    console.error('❌ Voice processing error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process voice recording',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

export default processVoice;