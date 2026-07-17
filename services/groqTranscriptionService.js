import Groq from 'groq-sdk';

// ✅ Initialize Groq with better error handling
let groq = null;
let isGroqInitialized = false;

try {
  // ✅ Check if API key exists
  if (!process.env.GROQ_API_KEY) {
    console.warn('⚠️ GROQ_API_KEY is not set in environment variables');
    console.warn('📝 Voice features will not work without GROQ_API_KEY');
  } else {
    // ✅ Validate API key format (gsk_ prefix)
    if (!process.env.GROQ_API_KEY.startsWith('gsk_')) {
      console.warn('⚠️ GROQ_API_KEY format looks incorrect. It should start with "gsk_"');
    }
    
    groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });
    isGroqInitialized = true;
    console.log('✅ Groq transcription service initialized');
  }
} catch (error) {
  console.error('❌ Failed to initialize Groq:', error.message);
  groq = null;
  isGroqInitialized = false;
}

const TRANSCRIPTION_MODEL = process.env.GROQ_TRANSCRIPTION_MODEL || 'whisper-large-v3-turbo';

/**
 * Transcribe audio using Groq's Whisper API
 * @param {Buffer} audioBuffer - Audio file buffer
 * @param {string} mimeType - MIME type of the audio file
 * @returns {Promise<string>} - Transcribed text
 */
export const transcribeAudioWithGroq = async (audioBuffer, mimeType) => {
  try {
    // ✅ Check if Groq is initialized
    if (!isGroqInitialized || !groq) {
      console.error('❌ Groq not initialized. Please check GROQ_API_KEY.');
      throw new Error('Groq service not available. Please check GROQ_API_KEY in .env');
    }

    console.log('🎤 Starting Groq transcription...');
    console.log('📁 Audio size:', audioBuffer.length, 'bytes');
    console.log('📁 MIME type:', mimeType);
    console.log('🤖 Using model:', TRANSCRIPTION_MODEL);

    // ✅ Create File object from buffer
    const fileExtension = mimeType?.split('/')[1] || 'm4a';
    const fileName = `recording.${fileExtension}`;
    
    const file = new File(
      [audioBuffer],
      fileName,
      { type: mimeType || 'audio/mp4' }
    );

    const response = await groq.audio.transcriptions.create({
      file: file,
      model: TRANSCRIPTION_MODEL,
      language: 'en',
      response_format: 'text',
    });

    console.log('✅ Groq transcription complete!');
    console.log('📝 Transcript:', response);
    
    return response;
  } catch (error) {
    console.error('❌ Groq transcription error:', error);
    throw new Error(`Groq transcription failed: ${error.message}`);
  }
};

/**
 * Transcribe audio and parse with AI
 * @param {Buffer} audioBuffer - Audio file buffer
 * @param {string} mimeType - MIME type of the audio file
 * @param {Object} options - Additional options
 * @returns {Promise<{transcript: string, parsed: Object}>}
 */
export const transcribeAndParse = async (audioBuffer, mimeType, options = {}) => {
  try {
    // ✅ First, transcribe
    const transcript = await transcribeAudioWithGroq(audioBuffer, mimeType);
    console.log('📝 Transcript:', transcript);

    // ✅ Then, parse with AI (import dynamically to avoid circular dependency)
    const { aiParsingService } = await import('./aiService.js');
    const parsed = await aiParsingService(transcript, {
      timezone: options.timezone || 'UTC',
      now: options.now || new Date(),
    });

    return {
      transcript,
      parsed,
    };
  } catch (error) {
    console.error('❌ Transcribe and parse error:', error.message);
    throw error;
  }
};

/**
 * Check if Groq service is available
 * @returns {boolean}
 */
export const isGroqAvailable = () => {
  return isGroqInitialized && !!groq && !!process.env.GROQ_API_KEY;
};

export default {
  transcribeAudioWithGroq,
  transcribeAndParse,
  isGroqAvailable,
};