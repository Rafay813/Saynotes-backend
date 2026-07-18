import Groq from 'groq-sdk';

// ✅ Constants
const AI_MODEL = process.env.GROQ_AI_MODEL || 'llama-3.3-70b-versatile';

let groq = null;
let isGroqInitialized = false;

try {
  if (!process.env.GROQ_API_KEY) {
    console.warn('⚠️ GROQ_API_KEY is not set');
  } else {
    if (!process.env.GROQ_API_KEY.startsWith('gsk_')) {
      console.warn('⚠️ GROQ_API_KEY format is invalid. Should start with "gsk_"');
    }
    groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });
    isGroqInitialized = true;
    console.log('✅ Groq AI service initialized');
  }
} catch (error) {
  console.error('❌ Failed to initialize Groq:', error.message);
  groq = null;
  isGroqInitialized = false;
}

/**
 * Check if Groq is available
 */
export const isGroqAvailable = () => isGroqInitialized && !!groq;

/**
 * Build system prompt - with clear date/time extraction instructions
 */
function buildSystemPrompt() {
  return `You are an intent classifier for a voice note app. Extract information from the user's transcript.

CRITICAL: You MUST extract the date and time if mentioned. Pay special attention to phrases like "at 7 pm", "tomorrow at 2 PM", "July 20 at 7pm".

Classify the transcript into exactly one of these types:
- "Note" - Information with NO action and NO time
- "Task" - Something the user needs to DO
- "Reminder" - A prompt tied to a specific time
- "Event" - A calendar occurrence with a start time

Extract these fields:
- title: short title (max 8 words)
- date: the date mentioned (e.g., "today", "tomorrow", "July 20", "20 July 2026", "next Friday") - CRITICAL if date is mentioned
- time: the time mentioned (e.g., "7 PM", "7pm", "2:30 PM", "14:00") - CRITICAL if time is mentioned
- endTime: end time if mentioned (e.g., "5 PM")
- duration: duration if mentioned (e.g., "1 hour", "30 minutes")
- person: name of a person if mentioned
- repeat: if mentioned (e.g., "daily", "weekly")
- location: if mentioned (e.g., "Zoom", "Office")
- subtasks: array of strings if multiple actions (only for Task type)

IMPORTANT RULES:
1. If user says "at 7 pm" → time: "7 PM", date: null (if no date mentioned)
2. If user says "tomorrow at 7 pm" → date: "tomorrow", time: "7 PM"
3. If user says "July 20 at 7pm" → date: "July 20", time: "7 PM"
4. If user says "Call mom at 9 PM" → title: "Call mom", time: "9 PM", date: null
5. If user says "Buy milk and eggs" → type: "Task", subtasks: ["milk", "eggs"], date: null, time: null

Return ONLY valid JSON. No explanations, no markdown.

Examples:
{"type":"Event","title":"Meeting with James","date":"tomorrow","time":"7 PM","person":"James"}
{"type":"Event","title":"Meeting with James","date":"20 July 2026","time":"7 PM","person":"James"}
{"type":"Reminder","title":"Call John","date":"today","time":"2 PM","person":"John"}
{"type":"Reminder","title":"Call mom","date":null,"time":"9 PM","person":"mom"}
{"type":"Task","title":"Buy groceries","date":null,"time":null,"person":null,"subtasks":["milk","eggs","bread"]}
{"type":"Note","title":"AI idea","date":null,"time":null,"person":null}`;
}

/**
 * Extract JSON from response
 */
function extractJSON(content) {
  // Try markdown code block
  const markdownMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
  if (markdownMatch) {
    return markdownMatch[1];
  }

  // Try finding { ... }
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start !== -1 && end !== -1 && start < end) {
    return content.substring(start, end + 1);
  }

  return null;
}

/**
 * Parse transcript using AI
 */
export const aiParsingService = async (transcript) => {
  const fallback = {
    type: 'Note',
    title: transcript.slice(0, 60),
    content: transcript,
    date: null,
    time: null,
    endTime: null,
    duration: null,
    repeat: null,
    location: null,
    person: null,
    subtasks: [],
  };

  if (!isGroqAvailable()) {
    console.warn('⚠️ Groq AI not initialized. Falling back to Note.');
    return fallback;
  }

  console.log('🤖 Classifying transcript:', transcript);

  try {
    const response = await groq.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: `Transcript: "${transcript}"` },
      ],
      temperature: 0.1,
      max_tokens: 250,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content || '';
    console.log('🤖 AI raw response:', content);

    // ✅ Extract JSON
    const jsonString = extractJSON(content);
    if (!jsonString) {
      console.warn('⚠️ No JSON found in AI response');
      return fallback;
    }

    const parsed = JSON.parse(jsonString);
    console.log('✅ Parsed AI result:', JSON.stringify(parsed, null, 2));

    return {
      type: parsed.type || 'Note',
      title: parsed.title || transcript.slice(0, 60),
      content: transcript,
      date: parsed.date || null,
      time: parsed.time || null,
      endTime: parsed.endTime || null,
      duration: parsed.duration || null,
      repeat: parsed.repeat || null,
      location: parsed.location || null,
      person: parsed.person || null,
      subtasks: Array.isArray(parsed.subtasks) ? parsed.subtasks : [],
    };
  } catch (error) {
    console.error('❌ AI parsing error:', error.message);
    return fallback;
  }
};

/**
 * Generate a daily briefing from items
 */
export const generateBriefingTextService = async (items) => {
  try {
    if (!items || items.length === 0) {
      return "Good morning! You have no tasks or events scheduled for today. Enjoy your day! 😊";
    }

    if (isGroqAvailable()) {
      try {
        const itemsText = items.map((item, index) => {
          const time = item.startTime
            ? new Date(item.startTime).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
              })
            : 'No time set';
          return `${index + 1}. ${item.title} (${item.type})${item.startTime ? ` at ${time}` : ''}`;
        }).join('\n');

        const prompt = `You are a friendly personal assistant. Create a brief, warm morning briefing based on today's schedule.

Today's items:
${itemsText}

Provide a concise summary (2-3 sentences) that:
1. Greets the user warmly
2. Mentions the total number of items
3. Highlights the most important or time-sensitive items
4. Has a positive, encouraging tone

Keep it natural and conversational.`;

        const chatCompletion = await groq.chat.completions.create({
          messages: [
            { role: "system", content: "You are a friendly personal assistant providing a brief morning briefing." },
            { role: "user", content: prompt },
          ],
          model: AI_MODEL,
          temperature: 0.7,
          max_tokens: 150,
        });

        const aiSummary = chatCompletion.choices[0]?.message?.content;
        if (aiSummary) return aiSummary;
      } catch (aiError) {
        console.error('❌ AI briefing generation failed:', aiError.message);
      }
    }

    // Fallback
    const events = items.filter(i => i.type === 'Event' && i.status === 'active');
    const tasks = items.filter(i => i.type === 'Task' && i.status === 'active');
    const reminders = items.filter(i => i.type === 'Reminder' && i.status === 'active');
    const notes = items.filter(i => i.type === 'Note' && i.status === 'active');

    let briefing = "🌅 Good morning! Here's your day: ";
    if (events.length > 0) {
      briefing += `You have ${events.length} event${events.length > 1 ? 's' : ''}: `;
      briefing += events.map(e => e.title).join(', ');
      briefing += '. ';
    }
    if (tasks.length > 0) {
      briefing += `You have ${tasks.length} task${tasks.length > 1 ? 's' : ''} to complete. `;
    }
    if (reminders.length > 0) {
      briefing += `Don't forget your ${reminders.length} reminder${reminders.length > 1 ? 's' : ''}. `;
    }
    if (notes.length > 0) {
      briefing += `You have ${notes.length} note${notes.length > 1 ? 's' : ''} saved. `;
    }
    briefing += `Have a productive day! 🚀`;
    return briefing;
  } catch (error) {
    console.error('❌ Briefing generation error:', error);
    return `Good morning! You have ${items.length} items scheduled for today. Have a great day! 🌟`;
  }
};

/**
 * Generate a task suggestion using AI
 */
export const generateTaskSuggestion = async (context) => {
  try {
    if (!isGroqAvailable()) {
      return 'What would you like to accomplish today?';
    }

    const prompt = `Based on the following context, suggest a helpful task or reminder:

Context: ${context}

Provide a brief, actionable suggestion (1 sentence).`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: "You are a helpful assistant that suggests tasks and reminders." },
        { role: "user", content: prompt },
      ],
      model: AI_MODEL,
      temperature: 0.8,
      max_tokens: 100,
    });

    return chatCompletion.choices[0]?.message?.content || 'Consider organizing your tasks for the day.';
  } catch (error) {
    console.error('❌ Task suggestion error:', error);
    return 'What would you like to accomplish today?';
  }
};

export default {
  aiParsingService,
  generateBriefingTextService,
  generateTaskSuggestion,
  isGroqAvailable,
};