import { transcribeAudioWithGroq } from '../services/groqTranscriptionService.js';
import Item from '../models/Item.js';

export const processVoice = async (req, res) => {
  const startTime = Date.now();
  
  try {
    if (!req.file) {
      console.error('❌ No file in request');
      return res.status(400).json({
        success: false,
        error: 'No audio file provided',
      });
    }

    const userId = req.user?.id || req.user?._id || req.userId;
    if (!userId) {
      console.error('❌ No user ID in request');
      return res.status(401).json({
        success: false,
        error: 'Unauthorized - User not authenticated',
      });
    }

    console.log('🎤 Processing voice from user:', userId);
    console.log('📁 File:', {
      fieldname: req.file.fieldname,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
    });

    // ✅ ONLY TRANSCRIBE - NO AI CLASSIFICATION
    console.log('🎤 Transcribing with Groq...');
    const transcript = await transcribeAudioWithGroq(req.file.buffer, req.file.mimetype);
    
    if (!transcript || transcript.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No speech detected in recording',
      });
    }

    console.log('📝 Transcript:', transcript);

    // ✅ Save as pending with default type "Note"
    // User will select actual type in ConfirmationCard
    const item = new Item({
      userId,
      type: 'Note',
      title: transcript.slice(0, 30),
      content: transcript,
      category: 'General',
      status: 'pending_confirmation',
    });

    const savedItem = await item.save();
    console.log('✅ Pending item saved:', savedItem._id);

    const processingTime = Date.now() - startTime;

    res.status(200).json({
      success: true,
      transcript: transcript,
      item: {
        _id: savedItem._id,
        type: savedItem.type,
        title: savedItem.title,
        date: savedItem.startTime || null,
        time: null,
        completed: savedItem.status === 'completed',
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