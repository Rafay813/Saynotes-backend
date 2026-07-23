import { transcribeAudioWithGroq, isGroqAvailable } from '../services/groqTranscriptionService.js';

/**
 * Transcribe audio only (no AI parsing)
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

export default {
  transcribeOnly,
};