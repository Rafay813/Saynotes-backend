import Groq from 'groq-sdk';
import { DateTime } from 'luxon';

// Constants
const AI_MODEL = process.env.GROQ_AI_MODEL || 'llama-3.3-70b-versatile';

// ✅ Singleton Groq client
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

export const isGroqAvailable = () => isGroqInitialized && !!groq;

// ✅ ENHANCED SYSTEM_PROMPT with clearer classification rules and few-shot examples
const SYSTEM_PROMPT = `You are a classifier for a voice productivity app. Given a spoken transcript, determine the type, title, and extract any metadata mentioned.

CRITICAL: You MUST extract the date and time if mentioned. Pay special attention to phrases like "at 7 pm", "tomorrow at 2 PM", "July 20 at 7pm".

CLASSIFICATION RULES — check in this order:
1. Does it mention meeting/calling/seeing another specific person AT a specific time? → "Event"
2. Does it say "remind me" or imply a time-based nudge for something personal (call someone, take medicine, leave somewhere)? → "Reminder"
3. Does it describe something to complete/finish/do, with or without a deadline (buy, finish, submit, clean, write)? → "Task"
4. Otherwise — general thought, idea, information, no clear action or time → "Note"

TITLE GENERATION (most important field):
Generate a specific, natural title that a person could scan at a glance and immediately
understand what it is and when it's happening. Never return the transcript verbatim word-for-word,
and never collapse to a generic 2-3 word summary either — the goal is the shortest phrasing that
loses zero useful information.

Title rules:
- Max 12 words.
- ALWAYS strip connecting filler that adds no information: "Schedule a", "Book a", "Please",
  "Can you", "I need to", "I have to", "Set up a", "Meet him with", "Remind me to" (when
  followed by more descriptive content — e.g. "Remind me to call John" -> "Call John").
- ALWAYS keep: names of people, places/organizations, and any date, day, or time the user
  actually said (e.g. "tomorrow", "next week", "Friday", "7 PM", "9pm"). If the user mentioned
  a date/day/time, it should appear in the title — this helps someone scan their list without
  opening each item.
- Rephrase awkward spoken phrasing into a clean label — e.g. "Meet him with Sir Ousman at
  Udilhavr on 9pm tomorrow" -> "Meeting with Sir Ousman at Udilhavr, 9 PM tomorrow" (dropped
  "Meet him", fixed grammar, kept every concrete detail).
- If the transcript already IS a clean, minimal phrase with no filler to strip, keep it close
  to as-is rather than forcing a change.
- Do NOT invent details that weren't said. If no name/place/time was mentioned, don't add one.
- Every title should be distinct enough that two different voice notes don't produce the same
  generic title (e.g. avoid collapsing different meetings down to just "Meeting with client").

FEW-SHOT EXAMPLES (study these for classification and title patterns):
Transcript: "remind me to call mom tomorrow at 9am" → {"type": "Reminder", "title": "Call mom at 9 AM tomorrow", "date": "tomorrow", "time": "9 AM", "person": "mom"}
Transcript: "meeting with Sarah at 3pm about the budget" → {"type": "Event", "title": "Meeting with Sarah about budget at 3 PM", "date": "today", "time": "3 PM", "person": "Sarah"}
Transcript: "buy milk and eggs" → {"type": "Task", "title": "Buy milk and eggs", "items": ["milk", "eggs"]}
Transcript: "idea for the app: add dark mode" → {"type": "Note", "title": "Idea: add dark mode"}
Transcript: "finish the report by Friday" → {"type": "Task", "title": "Finish the report by Friday", "date": "Friday"}
Transcript: "urgent, call the client back today" → {"type": "Reminder", "title": "Call client back today", "date": "today", "person": "client"}

Extract these fields:
- type: one of "Note", "Task", "Reminder", "Event"
- title: string, per the rules above
- date: the date mentioned (e.g., "today", "tomorrow", "July 20", "next Friday")
- time: the time mentioned (e.g., "7 PM", "2:30 PM") - ONLY if explicitly mentioned
- endTime: end time if mentioned (e.g., "5 PM")
- duration: duration if mentioned (e.g., "1 hour", "30 minutes")
- person: name of a person if mentioned
- repeat: if mentioned (e.g., "daily", "weekly")
- location: if mentioned (e.g., "Zoom", "Office")
- items: array of items (for shopping/task lists)
- subtasks: array of subtasks (for task lists)

IMPORTANT: Only extract time if the user explicitly mentions it. Do NOT add a default time.

Date/time rules:
- "at 7 pm" → time: "7 PM"
- "tomorrow at 7 pm" → date: "tomorrow", time: "7 PM"
- "July 20 at 7pm" → date: "July 20", time: "7 PM"
- "Call mom at 9 PM" → time: "9 PM", person: "mom"
- "Buy milk and eggs" → items: ["milk", "eggs"]
- "Meeting tomorrow" → date: "tomorrow", time: null (no time mentioned)

Return ONLY valid JSON. No explanations, no markdown.`;

function extractJSON(content) {
  const markdownMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
  if (markdownMatch) {
    return markdownMatch[1];
  }

  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start !== -1 && end !== -1 && start < end) {
    return content.substring(start, end + 1);
  }

  return null;
}

/**
 * ✅ Generate descriptive title from parsed data - PRESERVES ALL DETAILS
 * This serves as a fallback if the AI doesn't return a title
 */
function generateTitle(parsed, transcript) {
  const { type, person, items, subtasks, date, location, time } = parsed;
  
  const cleanTranscript = transcript.trim();
  let title = '';
  
  switch (type) {
    case 'Event':
      if (person && location) {
        title = `Meeting with ${person} at ${location}`;
      } else if (person) {
        title = `Meeting with ${person}`;
      } else if (location) {
        title = `Event at ${location}`;
      } else {
        const words = cleanTranscript.split(' ').slice(0, 6);
        title = words.join(' ');
        title = title.charAt(0).toUpperCase() + title.slice(1);
      }
      break;

    case 'Reminder':
      if (person) {
        title = `Call ${person}`;
      } else if (location) {
        title = `Reminder at ${location}`;
      } else {
        const words = cleanTranscript.split(' ').slice(0, 5);
        title = words.join(' ');
        title = title.charAt(0).toUpperCase() + title.slice(1);
      }
      break;

    case 'Task':
      if (items && items.length > 0) {
        const itemList = items.join(', ');
        title = `Buy ${itemList}`;
      } else if (subtasks && subtasks.length > 0) {
        const taskList = subtasks.join(', ');
        title = `Complete ${taskList}`;
      } else {
        const words = cleanTranscript.split(' ').slice(0, 5);
        title = words.join(' ');
        title = title.charAt(0).toUpperCase() + title.slice(1);
      }
      break;

    case 'Note':
    default: {
      const words = cleanTranscript.split(' ').slice(0, 6);
      title = words.join(' ');
      title = title.charAt(0).toUpperCase() + title.slice(1);
      if (words.length === 6) {
        title += '...';
      }
      return title || 'Note';
    }
  }
  
  // Add date if present (with year) and not already in title
  if (date) {
    const hasYear = /\b(19|20)\d{2}\b/.test(date);
    if (hasYear) {
      const cleanDate = date.replace(/(\d+)(st|nd|rd|th)/, '$1');
      if (!title.includes(cleanDate)) {
        title += ` (${cleanDate})`;
      }
    }
  }
  
  // Add time ONLY if present and not already in title
  if (time && !title.includes(time)) {
    if (title.length < 30) {
      title += ` at ${time}`;
    }
  }
  
  return title;
}

// ✅ POST-PROCESSING: Validate and fix classification
// Parameter renamed from 'startTime' to 'time' for clarity
function validateClassification(type, time, parsed) {
  // If type is Event but no time and no person mentioned, downgrade to Task
  if (type === 'Event') {
    const hasPerson = parsed.person && parsed.person.trim().length > 0;
    const hasLocation = parsed.location && parsed.location.trim().length > 0;
    
    // An Event without time, person, or location is probably not an event
    if (!time && !hasPerson && !hasLocation) {
      console.warn('⚠️ Event classified without time/person/location, downgrading to Task');
      return 'Task';
    }
  }
  
  return type;
}

export const aiParsingService = async (transcript) => {
  const trimmedTranscript = transcript.trim();
  
  const fallback = {
    type: 'Note',
    title: trimmedTranscript.slice(0, 60) + (trimmedTranscript.length > 60 ? '...' : ''),
    date: null,
    time: null,
    endTime: null,
    duration: null,
    repeat: null,
    location: null,
    person: null,
    items: [],
    subtasks: [],
  };

  if (!isGroqAvailable()) {
    console.warn('⚠️ Groq AI not initialized. Falling back to Note.');
    return fallback;
  }

  console.log('🤖 Extracting metadata from:', trimmedTranscript);

  try {
    const response = await groq.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Transcript: "${trimmedTranscript}"` },
      ],
      temperature: 0.2,
      top_p: 1,
      max_tokens: 300,
    });

    const content = response.choices[0]?.message?.content || '';
    console.log('🤖 AI raw response:', content);

    const jsonString = extractJSON(content);
    if (!jsonString) {
      console.warn('⚠️ No JSON found in AI response');
      return fallback;
    }

    const parsed = JSON.parse(jsonString);
    console.log('✅ Parsed AI result:', JSON.stringify(parsed, null, 2));

    // ✅ Validate and fix classification
    // Pass parsed.time (string like "9 PM") to the validation function
    const type = validateClassification(parsed.type || 'Note', parsed.time, parsed);
    
    // ✅ Prefer the AI's own detail-preserving title
    const title = parsed.title?.trim() || generateTitle(parsed, trimmedTranscript);
    console.log('📝 Generated title:', title);

    return {
      type: type,
      title: title,
      date: parsed.date || null,
      time: parsed.time || null,
      endTime: parsed.endTime || null,
      duration: parsed.duration || null,
      repeat: parsed.repeat || null,
      location: parsed.location || null,
      person: parsed.person || null,
      items: Array.isArray(parsed.items) ? parsed.items : [],
      subtasks: Array.isArray(parsed.subtasks) ? parsed.subtasks : [],
    };
  } catch (error) {
    console.error('❌ AI parsing error:', error.message);
    return fallback;
  }
};

export const generateBriefingTextService = async (items) => {
  try {
    if (!items || items.length === 0) {
      return "Good morning! You have no tasks or events scheduled for today. Enjoy your day! 😊";
    }

    const limitedItems = items.slice(0, 10);

    if (isGroqAvailable()) {
      try {
        const itemsText = limitedItems.map((item, index) => {
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

export default {
  aiParsingService,
  generateBriefingTextService,
  isGroqAvailable,
};