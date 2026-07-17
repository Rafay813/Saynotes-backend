import Groq from 'groq-sdk';

// ✅ Initialize Groq with better error handling
let groq = null;
let isGroqInitialized = false;

try {
  if (!process.env.GROQ_API_KEY) {
    console.warn('⚠️ GROQ_API_KEY is not set in environment variables');
    console.warn('📝 AI features will not work without GROQ_API_KEY');
  } else {
    if (!process.env.GROQ_API_KEY.startsWith('gsk_')) {
      console.warn('⚠️ GROQ_API_KEY format looks incorrect. It should start with "gsk_"');
    }
    groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });
    isGroqInitialized = true;
    console.log('✅ Groq AI service initialized');
  }
} catch (error) {
  console.error('❌ Failed to initialize Groq AI service:', error.message);
  groq = null;
  isGroqInitialized = false;
}

const AI_MODEL = process.env.GROQ_AI_MODEL || 'llama-3.3-70b-versatile';

// ✅ Email validation helper - more lenient for voice transcripts
const looksLikeEmail = (value) => {
  if (!value || typeof value !== 'string') return false;
  const cleaned = value.trim().toLowerCase();
  // Check for common email patterns
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned) ||
         /[^\s@]+@[^\s@]+\.[^\s@]+/.test(cleaned);
};

// ✅ Extract email from text if present
const extractEmailFromText = (text) => {
  if (!text) return null;
  const emailMatch = text.match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
  return emailMatch ? emailMatch[0] : null;
};

/**
 * Build the system prompt for AI parsing
 */
function buildSystemPrompt(currentDateTimeISO, timezone, now) {
  // ✅ Compute today's weekday name reliably in JS
  const readableNow = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  }).format(now);

  // ✅ Get the UTC offset for the user's timezone
  const utcOffset = -now.getTimezoneOffset();
  const offsetHours = Math.floor(Math.abs(utcOffset) / 60);
  const offsetMinutes = Math.abs(utcOffset) % 60;
  const offsetSign = utcOffset >= 0 ? '+' : '-';
  const offsetString = `${offsetSign}${String(offsetHours).padStart(2, '0')}:${String(offsetMinutes).padStart(2, '0')}`;

  return `You are the intent-classification engine for SayNotes.

⚠️⚠️⚠️ CRITICAL TIMEZONE INSTRUCTION ⚠️⚠️⚠️

The user is in the ${timezone} timezone (UTC${offsetString}).

When the user says a time like "5 PM", they mean 5 PM in ${timezone}, NOT UTC.

You MUST convert their local time to UTC before returning it.

**EXAMPLE:**
If the user says "Friday at 5 PM" and they are in ${timezone} (UTC${offsetString}):
1. User's local time: Friday, July 17, 2026 at 5:00 PM ${timezone}
2. UTC time: Friday, July 17, 2026 at ${17 - offsetHours}:00 UTC

**ALWAYS return the UTC time in ISO 8601 format: YYYY-MM-DDTHH:MM:SS.000Z**

**DO NOT** return the local time as UTC. You MUST subtract the timezone offset.

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

   ✅ TASK SPLITTING: If a Task transcript names multiple distinct, separately-completable
   actions joined by commas or "and" (e.g. "buy milk, eggs and bread", "call the bank and
   pay the invoice"), split them into a subtasks array of short strings, one per action.
   If it's a single action (e.g. "clean the house", "finish the report"), return an empty
   array — do not force a split. Only applies to type "Task".

2. "Reminder" - A prompt tied to a specific time (memory-oriented):
   Examples: "Remind me to take medicine at 8 PM", "Don't forget to call John",
   "Remember to water plants", "Remind me about the meeting"

3. "Event" - A calendar occurrence with a start time (schedule-oriented):
   Examples: "Team stand-up at 9 AM", "Meeting with client at 2 PM",
   "Lunch with Sarah at 12:30", "Doctor appointment on Friday"

4. "Note" - Information with NO action and NO time (information-only):
   Examples: "Great idea for the project", "Important safety guidelines",
   "Recipe for pasta", "Book recommendation"

CURRENT DATE/TIME (ISO): ${currentDateTimeISO}
TODAY IS: ${readableNow}
TIMEZONE: ${timezone} (UTC${offsetString})

DATE/WEEKDAY RESOLUTION RULES (follow these exactly — do not calculate weekdays yourself):
- "Today" is the day and date given above in TODAY IS.
- If the user names a weekday that is THE SAME as today's weekday (e.g. today is Friday and they say "on Friday" or "this Friday"), use TODAY'S date.
- If the user names a DIFFERENT weekday (e.g. today is Friday and they say "on Monday"), use the NEXT calendar occurrence of that weekday — always within the next 1-7 days, NEVER a past date, and NEVER more than 7 days out unless "next [weekday]" is explicitly said.
- If the user explicitly says "next [weekday]" (e.g. "next Friday" while today is already Friday), use the occurrence in the FOLLOWING week (8-14 days out), not the closest one.
- "Tomorrow" always means exactly one calendar day after today.
- All resulting startTime/endTime values MUST be in the future relative to the current date/time above — never in the past.
- Resolve all times as given in the user's local timezone (${timezone}), then return them as correct UTC ISO 8601 timestamps.

For Events without an end time, assume 30 minutes.

⚠️ CLIENT BOOKING DETECTION (only applies when type is "Event"):

If the Event sounds like a meeting/call/appointment WITH A SPECIFIC OTHER PERSON:
- Set isClientBooking: true
- Extract clientName: the person's name if mentioned
- Extract clientEmail: ONLY if explicitly mentioned (e.g., "sarah@gmail.com", "sarah at gmail dot com")

**IMPORTANT RULES:**
1. If the user mentions a person's name but NO email → set clientEmail: null
2. If the user mentions both name AND email → set both
3. NEVER invent or guess an email address
4. The user can always add the email later in the app

Examples:
- "Meeting with Sarah at 2 PM" → isClientBooking: true, clientName: "Sarah", clientEmail: null
- "Meeting with Sarah at sarah@gmail.com 2 PM" → isClientBooking: true, clientName: "Sarah", clientEmail: "sarah@gmail.com"
- "Team standup at 2 PM" → isClientBooking: false, clientName: null, clientEmail: null

For any type other than "Event", always set isClientBooking: false, clientName: null, clientEmail: null.

Return ONLY valid JSON matching the schema.`;
}

/**
 * Parse transcript using Groq
 */
export const aiParsingService = async (transcript, opts = {}) => {
  const timezone = opts.timezone || 'UTC';
  const now = opts.now || new Date();

  const fallback = {
    type: 'Note',
    title: transcript.slice(0, 60),
    content: transcript,
    startTime: null,
    endTime: null,
    isClientBooking: false,
    clientName: null,
    clientEmail: null,
    subtasks: [],
  };

  if (!isGroqInitialized || !groq || !process.env.GROQ_API_KEY) {
    console.warn('⚠️ Groq AI not initialized. Falling back to Note.');
    return fallback;
  }

  console.log('🤖 Using Groq model:', AI_MODEL);
  console.log('📝 Processing:', transcript.substring(0, 50) + '...');
  console.log('🌍 User timezone:', timezone);

  try {
    const systemPrompt = buildSystemPrompt(now.toISOString(), timezone, now);

    const userPrompt = `Transcript: "${transcript}"

Return ONLY a valid JSON object with these exact fields:
- type: "Note" | "Task" | "Reminder" | "Event"
- title: string (short title, max 8 words)
- startTime: string (ISO 8601 datetime in UTC) or null
- endTime: string (ISO 8601 datetime in UTC) or null
- isClientBooking: boolean (only true for Event type, see rules above)
- clientName: string or null (only for Event type)
- clientEmail: string or null (only if explicitly mentioned, NEVER invent)
- subtasks: array of strings (ONLY for Task type, see splitting rules above)

⚠️ REMEMBER: Convert the user's local time to UTC before returning it!
If the user is in ${timezone} and says "5 PM", that's 5 PM LOCAL TIME.

Current UTC time: ${now.toISOString()}
User's local timezone: ${timezone}`;

    const response = await groq.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 400,
    });

    const content = response.choices[0]?.message?.content || '';
    console.log('🤖 Groq raw response:', content);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('❌ No JSON found in Groq response');
      return fallback;
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (err) {
      console.error('❌ Failed to parse JSON:', err.message);
      return fallback;
    }

    console.log('✅ Parsed type:', parsed.type);
    console.log('📅 Parsed startTime (UTC):', parsed.startTime);

    const type = parsed.type || 'Note';
    const isEvent = type === 'Event';
    const isTask = type === 'Task';

    // ✅ Extract client info - only for Events
    let clientName = null;
    let clientEmail = null;
    let isClientBooking = false;

    if (isEvent) {
      // Get name from parsed data
      clientName = parsed.clientName ? String(parsed.clientName).trim() : null;
      
      // Try to get email from parsed data
      if (parsed.clientEmail && looksLikeEmail(parsed.clientEmail)) {
        clientEmail = parsed.clientEmail.trim();
      } else {
        // ✅ Try to extract email from the transcript itself
        const extractedEmail = extractEmailFromText(transcript);
        if (extractedEmail && looksLikeEmail(extractedEmail)) {
          clientEmail = extractedEmail;
          console.log('📧 Extracted email from transcript:', clientEmail);
        }
      }
      
      // ✅ Only set isClientBooking if we have a name (email is optional)
      isClientBooking = Boolean(parsed.isClientBooking) && Boolean(clientName);
      
      // ✅ Log warning if name but no email
      if (clientName && !clientEmail) {
        console.warn(`⚠️ Client name "${clientName}" detected but no email found. User can add email later.`);
      }
    }

    // ✅ Extract subtasks for Task type
    let subtasks = [];
    if (isTask && Array.isArray(parsed.subtasks) && parsed.subtasks.length > 0) {
      subtasks = parsed.subtasks
        .filter(s => s && String(s).trim())
        .map(s => String(s).trim());
    }

    return {
      type,
      title: parsed.title || transcript.slice(0, 60),
      content: transcript,
      startTime: parsed.startTime || null,
      endTime: parsed.endTime || null,
      isClientBooking,
      clientName,
      clientEmail,
      subtasks,
    };
  } catch (error) {
    console.error('❌ Groq AI service error:', error.message);
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

    if (isGroqInitialized && groq && process.env.GROQ_API_KEY) {
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

    // ✅ Fallback: Manual briefing
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
    if (!isGroqInitialized || !groq || !process.env.GROQ_API_KEY) {
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

export const isGroqAvailable = () => {
  return isGroqInitialized && !!groq && !!process.env.GROQ_API_KEY;
};

export default {
  aiParsingService,
  generateBriefingTextService,
  generateTaskSuggestion,
  isGroqAvailable,
};