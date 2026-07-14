import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Transcribe audio file using OpenAI Speech-to-Text
 * @param {Buffer} audioBuffer - Audio file buffer
 * @param {string} mimeType - Audio MIME type
 * @returns {Promise<string>} - Transcribed text
 */
export const transcribeAudio = async (audioBuffer, mimeType) => {
  try {
    console.log('🎤 Starting OpenAI transcription...');
    console.log('📁 Audio size:', audioBuffer.length, 'bytes');
    console.log('📁 MIME type:', mimeType);

    // ✅ Create a File object from buffer
    const file = new File(
      [audioBuffer],
      `recording.${mimeType.split('/')[1] || 'm4a'}`,
      { type: mimeType }
    );

    // ✅ Call OpenAI Whisper API
    const response = await openai.audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
      language: 'en',
      response_format: 'text',
    });

    console.log('✅ OpenAI transcription complete!');
    console.log('📝 Transcript:', response);
    
    return response;
  } catch (error) {
    console.error('❌ OpenAI transcription error:', error);
    throw new Error(`Transcription failed: ${error.message}`);
  }
};

export default transcribeAudio;