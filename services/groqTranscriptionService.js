import Groq from 'groq-sdk';
import { toFile } from 'groq-sdk';

// ✅ Constants
const TRANSCRIPTION_MODEL = process.env.GROQ_TRANSCRIPTION_MODEL || 'whisper-large-v3-turbo';
const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25MB
const TIMEOUT_MS = 30000; // 30 seconds

// ✅ Supported MIME types
const SUPPORTED_MIME_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/m4a',
  'audio/wav',
  'audio/webm',
  'audio/ogg',
  'audio/aac',
  'audio/flac',
];

// ✅ Renamed variable to avoid conflict with function name
let groqClient = null;
let groqReady = false;

try {
  if (!process.env.GROQ_API_KEY) {
    console.warn('⚠️ GROQ_API_KEY is not set');
  } else if (!process.env.GROQ_API_KEY.startsWith('gsk_')) {
    console.warn('⚠️ GROQ_API_KEY format is invalid. Should start with "gsk_"');
  } else {
    groqClient = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });
    groqReady = true;
    console.log('✅ Groq transcription service initialized');
  }
} catch (error) {
  console.error('❌ Failed to initialize Groq:', error.message);
}

/**
 * Check if Groq is available
 */
export const isGroqAvailable = () => groqReady && !!groqClient;

/**
 * Validate audio file
 */
function validateAudio(audioBuffer, mimeType) {
  if (!audioBuffer || audioBuffer.length === 0) {
    return { valid: false, error: 'EMPTY_AUDIO', message: 'Audio file is empty' };
  }

  if (audioBuffer.length > MAX_AUDIO_SIZE) {
    return { valid: false, error: 'FILE_TOO_LARGE', message: `Audio exceeds ${MAX_AUDIO_SIZE / 1024 / 1024}MB limit` };
  }

  if (!mimeType || !SUPPORTED_MIME_TYPES.includes(mimeType)) {
    return { 
      valid: false, 
      error: 'UNSUPPORTED_MIME_TYPE', 
      message: `Unsupported file type: ${mimeType}. Supported: ${SUPPORTED_MIME_TYPES.join(', ')}` 
    };
  }

  return { valid: true };
}

/**
 * Transcribe audio using Groq's Whisper API
 */
export const transcribeAudioWithGroq = async (audioBuffer, mimeType) => {
  // Check availability
  if (!isGroqAvailable()) {
    return {
      success: false,
      error: 'SERVICE_UNAVAILABLE',
      message: 'Groq transcription service is not available. Please check GROQ_API_KEY configuration.',
    };
  }

  // Validate audio
  const validation = validateAudio(audioBuffer, mimeType);
  if (!validation.valid) {
    return { success: false, ...validation };
  }

  console.log('🎤 Starting transcription...');
  console.log(`📁 Size: ${(audioBuffer.length / 1024).toFixed(0)}KB, Type: ${mimeType}`);

  try {
    // Prepare file using toFile (Groq SDK official method)
    const fileExtension = mimeType?.split('/')[1] || 'm4a';
    const fileName = `recording-${Date.now()}.${fileExtension}`;
    const file = await toFile(audioBuffer, fileName, { type: mimeType });

    // Transcribe with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await groqClient.audio.transcriptions.create({
      file,
      model: TRANSCRIPTION_MODEL,
      language: 'en',
      response_format: 'text',
    }, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const transcript = response.trim();

    if (!transcript) {
      return {
        success: false,
        error: 'NO_SPEECH_DETECTED',
        message: 'No speech detected in the audio. Please try again.',
      };
    }

    console.log(`✅ Transcription complete (${transcript.length} chars)`);
    return { success: true, transcript };

  } catch (error) {
    // Handle specific errors
    if (error.name === 'AbortError') {
      return {
        success: false,
        error: 'TIMEOUT',
        message: 'Transcription timed out. Please try again with a shorter recording.',
      };
    }

    if (error.status === 429) {
      return {
        success: false,
        error: 'RATE_LIMITED',
        message: 'Too many requests. Please wait a moment and try again.',
      };
    }

    if (error.status === 401 || error.status === 403) {
      return {
        success: false,
        error: 'AUTH_FAILED',
        message: 'Invalid Groq API key. Please check your configuration.',
      };
    }

    console.error('❌ Transcription error:', error.message);
    return {
      success: false,
      error: 'TRANSCRIPTION_FAILED',
      message: `Failed to transcribe audio: ${error.message}`,
    };
  }
};

export default {
  transcribeAudioWithGroq,
  isGroqAvailable,
};