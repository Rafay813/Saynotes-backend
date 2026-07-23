import Groq from 'groq-sdk';

// ✅ Singleton Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// ✅ Use working model
const AI_MODEL = process.env.GROQ_AI_MODEL || 'llama-3.3-70b-versatile';

export const parseWithGroq = async (transcript, timezone = 'Asia/Karachi') => {
  try {
    console.log('🤖 Parsing with Groq...');
    console.log('📝 Input:', transcript);
    console.log('🤖 Using model:', AI_MODEL);

    const prompt = `You are an intelligent parsing assistant for a note-taking app called SayNotes.
      
      Parse the following user input and extract structured information.
      
      Return ONLY a valid JSON object with these fields:
      - type: "Note" | "Task" | "Reminder" | "Event"
      - title: string (descriptive title, preserve important details)
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

    const response = await groq.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: 'system', content: 'You are a helpful assistant that parses user input into structured JSON. Return ONLY valid JSON.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 300,
    });

    const text = response.choices[0]?.message?.content || '';
    console.log('🤖 Groq raw response:', text);

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('⚠️ No JSON found in Groq response, using fallback');
      return getFallbackParse(transcript);
    }

    const parsed = JSON.parse(jsonMatch[0]);
    console.log('✅ Groq parsed:', parsed);

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
    console.error('❌ Groq parsing error:', error);
    return getFallbackParse(transcript);
  }
};

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

export default parseWithGroq;