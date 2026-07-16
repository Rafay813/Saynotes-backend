import { transcribeAudioWithGroq } from '../services/groqTranscriptionService.js';
import { classifyTranscript } from '../services/groqClassificationService.js';
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

    // ✅ Step 1: Transcribe with Groq
    console.log('🎤 Transcribing with Groq...');
    const transcript = await transcribeAudioWithGroq(req.file.buffer, req.file.mimetype);
    
    if (!transcript || transcript.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No speech detected in recording',
      });
    }

    console.log('📝 Transcript:', transcript);

    // ✅ Step 2: Classify the transcript to predict type/title/time/priority
    console.log('🤖 Classifying transcript...');
    const classification = await classifyTranscript(transcript);

    // ✅ Step 3: Save as pending with AI-predicted fields
    // User will confirm/edit in ConfirmationCard
    const item = new Item({
      userId,
      type: classification.type,
      title: classification.title,
      content: transcript,
      category: 'General',
      priority: classification.priority,
      startTime: classification.startTime,
      status: 'pending_confirmation',
    });

    const savedItem = await item.save();
    console.log('✅ Pending item saved:', savedItem._id, 'Predicted type:', savedItem.type);

    const processingTime = Date.now() - startTime;

    // ✅ Step 4: Return response with proper date/time formatting
    let date = null;
    let time = null;
    
    if (savedItem.startTime) {
      const startDate = new Date(savedItem.startTime);
      date = startDate.toISOString().split('T')[0]; // YYYY-MM-DD
      time = startDate.toISOString().split('T')[1]?.slice(0, 5); // HH:MM
    }

    res.status(200).json({
      success: true,
      transcript: transcript,
      item: {
        _id: savedItem._id,
        type: savedItem.type,
        title: savedItem.title,
        date: date,
        time: time,
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