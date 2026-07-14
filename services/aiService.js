import Groq from 'groq-sdk';

// ✅ Initialize Groq
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const AI_MODEL = process.env.GROQ_AI_MODEL || 'llama-3.3-70b-versatile';

/**
 * Build the system prompt for AI parsing
 */
function buildSystemPrompt(currentDateTimeISO, timezone) {
  return `You are the intent-classification engine for SayNotes.

IMPORTANT: The user wants to organize their life. You MUST classify the transcript correctly.

Classify into exactly one of these types:

1. "Task" - Something the user needs to DO (action-oriented):
   Examples: "Buy groceries", "Call mom", "Send email", "Complete project", 
   "Schedule meeting", "Book appointment", "Pay bills", "Submit assignment",
   "Review proposal", "Clean the house", "Exercise", "Study", "Write blog post",
   "Prepare presentation", "Organize files", "Fix the leak", "Order pizza",
   "Pick up dry cleaning", "Drop off package", "Do laundry", "Cook dinner"

   CRITICAL: If the user says they need to DO something, it's a TASK.
   Look for action verbs: do, complete, finish, buy, send, call, schedule, 
   write, create, make, prepare, organize, plan, set up, arrange, book, 
   order, pay, submit, review, check, update, fix, resolve, help, assist,
   meet, discuss, present, share, deliver, pick up, drop off, clean, wash, 
   cook, exercise, study, read, practice.

2. "Reminder" - A prompt tied to a specific time (memory-oriented):
   Examples: "Remind me to take medicine at 8 PM", "Don't forget to call John",
   "Remember to water plants", "Remind me about the meeting"

3. "Event" - A calendar occurrence with a start time (schedule-oriented):
   Examples: "Team stand-up at 9 AM", "Meeting with client at 2 PM",
   "Lunch with Sarah at 12:30", "Doctor appointment on Friday"

4. "Note" - Information with NO action and NO time (information-only):
   Examples: "Great idea for the project", "Important safety guidelines",
   "Recipe for pasta", "Book recommendation"

CURRENT DATE/TIME: ${currentDateTimeISO}
TIMEZONE: ${timezone}

Resolve relative times ("tomorrow morning", "next Friday", "in an hour") into absolute ISO 8601 datetimes.
If no time is mentioned, leave startTime/endTime as null.
For Events without an end time, assume 30 minutes.

Return ONLY valid JSON matching the schema.`;
}

/**
 * Parse transcript using Groq
 * @param {string} transcript - Raw voice transcript
 * @param {object} opts - Options { timezone, now }
 * @returns {Promise<{type: string, title: string, content: string, startTime: string|null, endTime: string|null}>}
 */
export const aiParsingService = async (transcript, opts = {}) => {
  const timezone = opts.timezone || 'UTC';
  const now = opts.now || new Date();

  // ✅ Check if Groq API key is set
  if (!process.env.GROQ_API_KEY) {
    console.error('❌ GROQ_API_KEY is not set. Falling back to Note.');
    return {
      type: 'Note',
      title: transcript.slice(0, 60),
      content: transcript,
      startTime: null,
      endTime: null,
    };
  }

  console.log('🤖 Using Groq model:', AI_MODEL);
  console.log('📝 Processing:', transcript.substring(0, 50) + '...');

  try {
    const systemPrompt = buildSystemPrompt(now.toISOString(), timezone);
    
    const userPrompt = `Transcript: "${transcript}"

Return ONLY a valid JSON object with these exact fields:
- type: "Note" | "Task" | "Reminder" | "Event"
- title: string (short title, max 8 words)
- startTime: string (ISO 8601 datetime) or null
- endTime: string (ISO 8601 datetime) or null

Rules:
1. If the user needs to DO something → "Task"
2. If it's time-based reminder → "Reminder"  
3. If it's a calendar event with time → "Event"
4. Otherwise → "Note"

Current date/time: ${now.toISOString()}
Timezone: ${timezone}`;

    const response = await groq.chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      temperature: 0.2,
      max_tokens: 300,
    });

    const content = response.choices[0]?.message?.content || '';
    console.log('🤖 Groq raw response:', content);

    // ✅ Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('❌ No JSON found in Groq response');
      return {
        type: 'Note',
        title: transcript.slice(0, 60),
        content: transcript,
        startTime: null,
        endTime: null,
      };
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (err) {
      console.error('❌ Failed to parse JSON:', err.message);
      console.error('❌ Raw content:', content);
      return {
        type: 'Note',
        title: transcript.slice(0, 60),
        content: transcript,
        startTime: null,
        endTime: null,
      };
    }

    console.log('✅ Parsed type:', parsed.type);

    return {
      type: parsed.type || 'Note',
      title: parsed.title || transcript.slice(0, 60),
      content: transcript,
      startTime: parsed.startTime || null,
      endTime: parsed.endTime || null,
    };
  } catch (error) {
    console.error('❌ Groq AI service error:', error.message);
    return {
      type: 'Note',
      title: transcript.slice(0, 60),
      content: transcript,
      startTime: null,
      endTime: null,
    };
  }
};

/**
 * Generate a daily briefing from items
 * @param {Array} items - Array of item objects
 * @returns {Promise<string>} - Natural language briefing
 */
export const generateBriefingTextService = async (items) => {
  if (!items || items.length === 0) {
    return "Good morning! You have no tasks or events scheduled for today. Enjoy your day! 😊";
  }

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
};

export default {
  aiParsingService,
  generateBriefingTextService,
};