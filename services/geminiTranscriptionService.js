import { GoogleGenerativeAI } from '@google/generative-ai';

// ✅ Initialize Gemini with your API key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ✅ Try ALL possible model names
const MODEL_LIST = [
  'gemini-1.0-pro',        // ✅ Oldest, most compatible
  'gemini-pro',            // ✅ Original name
  'gemini-1.5-flash',      // ✅ Newer
  'gemini-1.5-pro',        // ✅ Newer
  'gemini-2.0-flash-exp',  // ✅ Latest
];

export const transcribeAudioWithGemini = async (audioBuffer, mimeType) => {
  let lastError = null;
  
  // ✅ Try each model in order
  for (const modelName of MODEL_LIST) {
    try {
      console.log(`🎤 Trying Gemini model: ${modelName}...`);
      
      const base64Audio = audioBuffer.toString('base64');

      const model = genAI.getGenerativeModel({ 
        model: modelName 
      });

      const audioPart = {
        inlineData: {
          data: base64Audio,
          mimeType: mimeType || 'audio/mp4',
        },
      };

      const prompt = `Please transcribe the following audio recording accurately. 
      Return ONLY the transcribed text, no additional commentary or formatting.
      
      If the audio contains speech, transcribe it word for word.
      If there is no speech, return "No speech detected".`;

      const result = await model.generateContent([prompt, audioPart]);
      const response = await result.response;
      const transcript = response.text().trim();

      console.log(`✅ Gemini transcription complete with ${modelName}!`);
      console.log('📝 Transcript:', transcript);
      
      return transcript;
    } catch (error) {
      console.warn(`⚠️ Model ${modelName} failed:`, error.message);
      lastError = error;
    }
  }
  
  // ✅ All models failed
  console.error('❌ All Gemini models failed');
  return "Could not transcribe audio. Please try again.";
};

export default transcribeAudioWithGemini;