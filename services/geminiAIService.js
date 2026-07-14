import { GoogleGenerativeAI } from '@google/generative-ai';

// ✅ Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ✅ Correct model names for Gemini API
const MODEL_LIST = [
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-2.0-flash-exp',
  'gemini-pro',
];

/**
 * Parse natural language input using Gemini with automatic fallback
 */
export const parseWithGemini = async (transcript, timezone = 'Asia/Karachi') => {
  let lastError = null;
  
  // ✅ Try each model in order
  for (const modelName of MODEL_LIST) {
    try {
      console.log(`🤖 Trying Gemini model for parsing: ${modelName}...`);

      const model = genAI.getGenerativeModel({
        model: modelName,
      });

      const prompt = `You are an intelligent parsing assistant for a note-taking app called SayNotes.
      
      Parse the following user input and extract structured information.
      
      Return ONLY a valid JSON object with these fields:
      - type: "Note" | "Task" | "Reminder" | "Event"
      - title: string (short title, max 8 words)
      - content: string (full description)
      - date: string (YYYY-MM-DD) or null (if a date is mentioned)
      - time: string (HH:MM) or null (if a time is mentioned)
      - priority: "low" | "medium" | "high" or null
      - category: string or null
      
      Rules:
      1. "Task" - Action-oriented: do, complete, finish, buy, send, call, schedule, write, create, make, prepare, organize, plan
      2. "Reminder" - Time-based prompt: remind, remember, don't forget, recall
      3. "Event" - Calendar occurrence: meeting, appointment, lunch, dinner, call with, interview, presentation, webinar
      4. "Note" - Information only: NO action, NO time
      
      Current date/time reference: ${new Date().toISOString()}
      Timezone: ${timezone}
      
      Resolve relative times (tomorrow, next Friday, in 2 hours) to actual dates.
      
      User input: "${transcript}"
      
      Return ONLY valid JSON. No markdown, no commentary.`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text().trim();

      console.log(`✅ Gemini parsing complete with ${modelName}!`);
      console.log('🤖 Raw response:', text);

      // ✅ Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn('⚠️ No JSON found in Gemini response, trying next model...');
        continue;
      }

      const parsed = JSON.parse(jsonMatch[0]);
      console.log('✅ Gemini parsed:', parsed);

      return {
        type: parsed.type || 'Note',
        title: parsed.title || transcript.slice(0, 30),
        content: parsed.content || transcript,
        date: parsed.date || null,
        time: parsed.time || null,
        priority: parsed.priority || 'medium',
        category: parsed.category || 'General',
      };
    } catch (error) {
      console.warn(`⚠️ Model ${modelName} for parsing failed:`, error.message);
      lastError = error;
      // Continue to next model
    }
  }
  
  // ✅ All models failed - use fallback
  console.warn('⚠️ All Gemini models failed, using fallback parsing');
  return getFallbackParse(transcript);
};

/**
 * Fallback parsing when Gemini fails
 */
const getFallbackParse = (transcript) => {
  console.log('📝 Using fallback parse for:', transcript);
  
  const lower = transcript.toLowerCase();
  let type = 'Note';
  
  if (lower.includes('task') || lower.includes('do ') || lower.includes('complete') || 
      lower.includes('finish') || lower.includes('buy') || lower.includes('call')) {
    type = 'Task';
  } else if (lower.includes('remind') || lower.includes('remember') || lower.includes('forget')) {
    type = 'Reminder';
  } else if (lower.includes('meeting') || lower.includes('appointment') || lower.includes('call with') ||
             lower.includes('lunch') || lower.includes('dinner')) {
    type = 'Event';
  }

  return {
    type: type,
    title: transcript.slice(0, 30),
    content: transcript,
    date: null,
    time: null,
    priority: 'medium',
    category: 'General',
  };
};

export default parseWithGemini;