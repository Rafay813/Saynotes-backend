import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const TRANSCRIPTION_MODEL = process.env.GROQ_TRANSCRIPTION_MODEL || 'whisper-large-v3-turbo';

export const transcribeAudioWithGroq = async (audioBuffer, mimeType) => {
  try {
    console.log('🎤 Starting Groq transcription...');
    console.log('📁 Audio size:', audioBuffer.length, 'bytes');
    console.log('📁 MIME type:', mimeType);
    console.log('🤖 Using model:', TRANSCRIPTION_MODEL);

    const file = new File(
      [audioBuffer],
      `recording.${mimeType.split('/')[1] || 'm4a'}`,
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

export default transcribeAudioWithGroq;