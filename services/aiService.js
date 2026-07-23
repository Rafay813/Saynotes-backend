import Groq from 'groq-sdk';

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

// ✅ SYSTEM_PROMPT - AI extracts ONLY metadata, NO title generation
const SYSTEM_PROMPT = `You are NOT a chatbot. You are an information extractor.

Return ONLY valid JSON. No explanations. No markdown. Never apologize. Never add extra text.

Extract these fields from the user's transcript:
- type: "Note", "Task", "Reminder", or "Event"
- date: the date mentioned (e.g., "today", "tomorrow", "July 20", "next Friday") or null
- time: the time mentioned (e.g., "7 PM", "2:30 PM", "14:00") or null
- endTime: end time if mentioned (e.g., "5 PM") or null
- duration: duration if mentioned (e.g., "1 hour", "30 minutes") or null
- person: name of a person if mentioned or null
- repeat: if mentioned (e.g., "daily", "weekly") or null
- location: if mentioned (e.g., "Zoom", "Office") or null
- items: array of items (for shopping/task lists) or empty array
- subtasks: array of subtasks (for tasks) or empty array

DO NOT generate a title. The title will be created by the system.

Classification rules:
- "Event": meetings, appointments, calls with a specific time and another person
- "Reminder": something to be reminded of at a specific time, often personal
- "Task": something to get done, may or may not have a deadline
- "Note": general thoughts, ideas, or information with no action/time

Date/time rules:
- "at 7 pm" → time: "7 PM"
- "tomorrow at 7 pm" → date: "tomorrow", time: "7 PM"
- "July 20 at 7pm" → date: "July 20", time: "7 PM"
- "Call mom at 9 PM" → time: "9 PM", person: "mom"
- "Buy milk and eggs" → items: ["milk", "eggs"]

Examples:
{"type":"Event","person":"James","date":"tomorrow","time":"7 PM"}
{"type":"Event","person":"James","date":"20 July 2026","time":"7 PM","location":"Zoom"}
{"type":"Reminder","person":"John","date":"today","time":"2 PM"}
{"type":"Reminder","person":"mom","time":"9 PM"}
{"type":"Task","items":["milk","eggs","bread"]}
{"type":"Task","subtasks":["research","write","submit"]}
{"type":"Note"}`;

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
 * ✅ Format date for title display
 */
function formatDateForTitle(dateStr) {
  if (!dateStr) return null;
  
  // Check if it's a relative date
  const relativeMap = {
    'today': 'Today',
    'tomorrow': 'Tomorrow',
    'yesterday': 'Yesterday',
  };
  
  if (relativeMap[dateStr.toLowerCase()]) {
    return relativeMap[dateStr.toLowerCase()];
  }
  
  // Clean ordinal suffixes for display
  const cleanDate = dateStr.replace(/(\d+)(st|nd|rd|th)/, '$1');
  
  // Format: "27 July 2026" -> keep as is
  // If it has a year, keep it, otherwise just the date
  return cleanDate;
}

/**
 * ✅ Generate deterministic title from parsed data
 * Includes date in title ONLY when a specific date with year is mentioned
 */
function generateTitle(parsed, transcript) {
  const { type, person, items, subtasks, date, location } = parsed;
  
  // Remove filler words from transcript for fallback
  const fillerWords = ['um', 'uh', 'actually', 'basically', 'like', 'please', 'you know', 'i mean'];
  const cleanTranscript = transcript
    .split(/\s+/)
    .filter(w => w.length > 0 && !fillerWords.includes(w.toLowerCase()))
    .join(' ');
  
  let title = '';
  
  switch (type) {
    case 'Event':
      if (person) title = `Meeting with ${person}`;
      else if (location) title = `Event at ${location}`;
      else title = 'Meeting';
      break;

    case 'Reminder':
      if (person) title = `Call ${person}`;
      else if (location) title = `Reminder at ${location}`;
      else title = 'Reminder';
      break;

    case 'Task':
      if (items && items.length > 0) {
        const first = items[0];
        const count = items.length;
        title = count === 1 ? `Buy ${first}` : `Buy ${first} + ${count - 1} more`;
      } else if (subtasks && subtasks.length > 0) {
        const first = subtasks[0];
        const count = subtasks.length;
        title = count === 1 ? `Complete ${first}` : `Complete ${first} + ${count - 1} more`;
      } else {
        title = 'Task';
      }
      break;

    case 'Note':
    default: {
      const words = cleanTranscript.split(/\s+/).filter(w => w.length > 0);
      if (words.length === 0) return 'Note';
      
      const titleWords = words.slice(0, 5);
      title = titleWords.join(' ');
      title = title.charAt(0).toUpperCase() + title.slice(1);
      
      if (words.length > 5) {
        title += '...';
      }
      return title || 'Note';
    }
  }
  
  // ✅ Add date to title ONLY if it's a specific date with year
  if (date) {
    // Check if date contains a year (4-digit number)
    const hasYear = /\b(19|20)\d{2}\b/.test(date);
    
    // Only add date if it has a year (specific date)
    if (hasYear) {
      const formattedDate = formatDateForTitle(date);
      if (formattedDate) {
        // Clean ordinal suffixes for display
        const cleanDate = formattedDate.replace(/(\d+)(st|nd|rd|th)/, '$1');
        title += ` (${cleanDate})`;
      }
    }
  }
  
  return title;
}

/**
 * ✅ Clean title - safety net for any date/time that might slip through
 */
function cleanTitle(title) {
  if (!title) return 'Note';
  
  let cleaned = title.trim();
  
  // Remove time patterns only (keep date if present)
  cleaned = cleaned.replace(/\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b/gi, '');
  cleaned = cleaned.replace(/\bat\s+\d{1,2}\s*(?:am|pm)?/gi, '');
  
  // Clean up extra spaces
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  // Capitalize first letter
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  
  return cleaned || 'Note';
}

export const aiParsingService = async (transcript) => {
  const trimmedTranscript = transcript.trim();
  
  // ✅ Fallback - no AI, just metadata extraction
  const fallback = {
    type: 'Note',
    title: generateTitle({ type: 'Note' }, trimmedTranscript),
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
      temperature: 0,
      top_p: 1,
      max_tokens: 200,
      response_format: { type: 'json_object' },
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

    // ✅ Generate deterministic title from parsed data
    const title = generateTitle(parsed, trimmedTranscript);
    const cleanTitleStr = cleanTitle(title);
    console.log('📝 Generated title:', cleanTitleStr);

    return {
      type: parsed.type || 'Note',
      title: cleanTitleStr,
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