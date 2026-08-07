import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure temp directory exists
const tempDir = path.join(__dirname, '../temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

/**
 * Generate speech using VoiceRSS (FREE, 350 requests/day)
 */
export const generateSpeechVoiceRSS = async (text) => {
  try {
    if (!process.env.VOICERSS_API_KEY) {
      console.log('⚠️ VoiceRSS API key not found, using device TTS');
      return {
        success: true,
        text: text,
        useDeviceTTS: true,
        provider: 'device',
        message: 'Using device TTS',
      };
    }

    const url = `https://api.voicerss.org/?key=${process.env.VOICERSS_API_KEY}&hl=en-us&src=${encodeURIComponent(text)}&c=mp3`;
    console.log('🎤 Using VoiceRSS...');
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`VoiceRSS API error: ${response.status}`);
    }

    const audioBuffer = await response.arrayBuffer();
    
    if (!audioBuffer || audioBuffer.byteLength === 0) {
      throw new Error('No audio data received');
    }

    const audioBase64 = Buffer.from(audioBuffer).toString('base64');

    return {
      success: true,
      audioBase64,
      format: 'mp3',
      provider: 'voicerss',
    };
  } catch (error) {
    console.error('❌ VoiceRSS error:', error.message);
    return {
      success: true,
      text: text,
      useDeviceTTS: true,
      provider: 'device',
      message: `Using device TTS (VoiceRSS error: ${error.message})`,
    };
  }
};

/**
 * Main TTS function - uses VoiceRSS
 */
export const textToSpeech = async (text) => {
  console.log(`🎤 Generating TTS for: "${text.substring(0, 50)}..."`);
  
  // Use VoiceRSS (working!)
  const result = await generateSpeechVoiceRSS(text);
  
  if (result.success && result.audioBase64) {
    return result;
  }

  // Final fallback: device TTS
  return {
    success: true,
    text: text,
    useDeviceTTS: true,
    provider: 'device',
    message: 'Using device TTS (final fallback)',
  };
};

export default textToSpeech;