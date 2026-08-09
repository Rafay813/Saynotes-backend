import Groq from 'groq-sdk';
import { DateTime } from 'luxon';
import Item from '../models/Item.js';
import { parseDateTime, calculateEndTime } from '../utils/dateUtils.js';
import { invalidateDashboardCache } from '../controllers/dashboardController.js';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const ASSISTANT_MODEL = process.env.GROQ_ASSISTANT_MODEL || 'llama-3.3-70b-versatile';

export const isAssistantAvailable = () => Boolean(process.env.GROQ_API_KEY);

// ---------------------------------------------------------------------------
// Tool (function) definitions
// ---------------------------------------------------------------------------
const tools = [
  {
    type: 'function',
    function: {
      name: 'createItem',
      description:
        'Create a new note, task, event, or reminder for the user. Use this once you have enough information (title, and a date/time for events/reminders). If something important is missing (e.g. no time given for a reminder), ask the user first instead of calling this.',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['Note', 'Task', 'Reminder', 'Event'],
            description: 'The kind of item to create.',
          },
          title: { type: 'string', description: 'Short title for the item.' },
          content: { type: 'string', description: 'Optional longer description/body.' },
          date: {
            type: 'string',
            description:
              'Natural language date, e.g. "today", "tomorrow", "next Friday", "2026-08-15". Required for Event/Reminder.',
          },
          time: {
            type: 'string',
            description: 'Natural language time, e.g. "9am", "14:30", "noon". Optional.',
          },
          duration: {
            type: 'string',
            description: 'Optional duration, e.g. "30 minutes", "1 hour". Used for events.',
          },
          location: { type: 'string', description: 'Optional location.' },
          priority: { type: 'string', enum: ['low', 'medium', 'high'] },
          category: { type: 'string', description: 'Optional category/tag.' },
          repeat: { type: 'string', enum: ['none', 'daily', 'weekly', 'monthly'] },
          subtasks: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional checklist items, only for Task type.',
          },
        },
        required: ['type', 'title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listItems',
      description:
        "List the user's existing items. Use the 'when' parameter to filter by date range — this is the reliable way to answer 'what's today', 'what's upcoming', 'what's overdue'. Don't try to filter by date yourself from returned data; always use 'when' instead.",
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['Note', 'Task', 'Reminder', 'Event'] },
          status: {
            type: 'string',
            enum: ['pending_confirmation', 'active', 'completed', 'cancelled', 'expired'],
          },
          when: {
            type: 'string',
            enum: ['today', 'upcoming', 'overdue', 'all'],
            description:
              "'today' = items scheduled for today only. 'upcoming' = items scheduled after today. 'overdue' = active items whose time has already passed. 'all' = no date filter (default).",
          },
          limit: { type: 'number', description: 'Max items to return, default 10.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'updateItem',
      description: "Update an existing item's fields (e.g. reschedule, rename, change status).",
      parameters: {
        type: 'object',
        properties: {
          itemId: { type: 'string', description: 'The _id of the item to update.' },
          title: { type: 'string' },
          date: { type: 'string' },
          time: { type: 'string' },
          status: {
            type: 'string',
            enum: ['pending_confirmation', 'active', 'completed', 'cancelled', 'expired'],
          },
          priority: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
        required: ['itemId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'deleteItem',
      description: 'Delete an item. Only call this after the user has clearly confirmed.',
      parameters: {
        type: 'object',
        properties: {
          itemId: { type: 'string' },
        },
        required: ['itemId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'snoozeItem',
      description: 'Snooze a reminder or event by a certain number of minutes, or until a specific time. Use this when the user says "snooze that for 5 minutes" or "snooze until 3pm".',
      parameters: {
        type: 'object',
        properties: {
          itemId: { type: 'string', description: 'The _id of the item to snooze.' },
          minutes: {
            type: 'number',
            description: 'Number of minutes to snooze. Use this OR until, not both.',
          },
          until: {
            type: 'string',
            description: 'Natural language time to snooze until, e.g. "3pm", "tomorrow 9am". Use this OR minutes, not both.',
          },
        },
        required: ['itemId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'searchItems',
      description: 'Search the user\'s items by title or content text. Use this when the user asks "find my note about..." or "search for..."',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query string to look for in titles and content.',
          },
          limit: {
            type: 'number',
            description: 'Max items to return, default 10.',
          },
        },
        required: ['query'],
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------
async function executeTool(name, args, { userId, timezone }) {
  switch (name) {
    case 'createItem': {
      let startTime = null;
      let endTime = null;

      if (args.date) {
        try {
          startTime = parseDateTime(args.date, args.time || null, timezone);
          if (startTime) {
            endTime = calculateEndTime(startTime, null, args.duration || '30 minutes', timezone);
          }
        } catch (e) {
          console.warn('⚠️ assistant createItem date parse failed:', e.message);
        }
      }

      const itemData = {
        userId,
        type: args.type,
        title: args.title || 'Untitled',
        content: args.content || '',
        startTime,
        endTime,
        status: 'active',
        priority: args.priority || 'medium',
        category: args.category || 'General',
        location: args.location || null,
        repeat: args.repeat || 'none',
      };

      if (args.type === 'Task' && Array.isArray(args.subtasks) && args.subtasks.length > 0) {
        itemData.subtasks = args.subtasks.map((text) => ({ text, done: false }));
      }

      const savedItem = await Item.create(itemData);
      invalidateDashboardCache(userId);

      return {
        ok: true,
        item: {
          id: savedItem._id.toString(),
          type: savedItem.type,
          title: savedItem.title,
          startTime: savedItem.startTime,
          endTime: savedItem.endTime,
        },
      };
    }

    case 'listItems': {
      const query = { userId };
      if (args.type) query.type = args.type;
      if (args.status) query.status = args.status;

      // ✅ DATE RANGE FILTERING
      const now = DateTime.now().setZone(timezone);
      const startOfToday = now.startOf('day').toJSDate();
      const endOfToday = now.endOf('day').toJSDate();
      const nowJs = now.toJSDate();

      if (args.when === 'today') {
        query.startTime = { $gte: startOfToday, $lte: endOfToday };
        if (!args.status) query.status = 'active';
      } else if (args.when === 'upcoming') {
        query.startTime = { $gt: endOfToday };
        if (!args.status) query.status = 'active';
      } else if (args.when === 'overdue') {
        query.startTime = { $lt: nowJs };
        if (!args.status) query.status = 'active';
      }
      // 'all' or no `when` → no date filter

      const items = await Item.find(query)
        .sort({ startTime: 1, createdAt: -1 })
        .limit(args.limit || 10)
        .lean();

      return {
        ok: true,
        items: items.map((it) => ({
          id: it._id.toString(),
          type: it.type,
          title: it.title,
          status: it.status,
          startTime: it.startTime,
        })),
      };
    }

    case 'updateItem': {
      const item = await Item.findOne({ _id: args.itemId, userId });
      if (!item) return { ok: false, error: 'Item not found' };

      if (args.title) item.title = args.title;
      if (args.status) item.status = args.status;
      if (args.priority) item.priority = args.priority;

      if (args.date) {
        try {
          const newStart = parseDateTime(args.date, args.time || null, timezone);
          if (newStart) item.startTime = newStart;
        } catch (e) {
          console.warn('⚠️ assistant updateItem date parse failed:', e.message);
        }
      }

      await item.save();
      invalidateDashboardCache(userId);

      return { ok: true, item: { id: item._id.toString(), title: item.title, status: item.status } };
    }

    case 'deleteItem': {
      const item = await Item.findOneAndDelete({ _id: args.itemId, userId });
      if (!item) return { ok: false, error: 'Item not found' };
      invalidateDashboardCache(userId);
      return { ok: true, deletedId: args.itemId };
    }

    case 'snoozeItem': {
      const item = await Item.findOne({ _id: args.itemId, userId });
      if (!item) return { ok: false, error: 'Item not found' };

      let newStartTime = null;
      const now = DateTime.now().setZone(timezone);

      if (args.minutes) {
        newStartTime = now.plus({ minutes: args.minutes }).toJSDate();
      } else if (args.until) {
        try {
          const parsed = parseDateTime(args.until, null, timezone);
          if (parsed) newStartTime = parsed;
        } catch (e) {
          console.warn('⚠️ assistant snoozeItem until parse failed:', e.message);
        }
      }

      if (!newStartTime) {
        newStartTime = now.plus({ minutes: 5 }).toJSDate();
      }

      item.startTime = newStartTime;
      item.status = 'active';
      await item.save();
      invalidateDashboardCache(userId);

      return {
        ok: true,
        item: {
          id: item._id.toString(),
          title: item.title,
          startTime: item.startTime,
        },
        message: `Snoozed until ${DateTime.fromJSDate(newStartTime).setZone(timezone).toFormat('yyyy-MM-dd HH:mm')}`,
      };
    }

    case 'searchItems': {
      const query = args.query || '';
      const limit = args.limit || 10;

      const results = await Item.find({
        userId,
        $or: [
          { title: { $regex: query, $options: 'i' } },
          { content: { $regex: query, $options: 'i' } },
        ],
      })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

      return {
        ok: true,
        items: results.map((it) => ({
          id: it._id.toString(),
          type: it.type,
          title: it.title,
          status: it.status,
          startTime: it.startTime,
        })),
        count: results.length,
      };
    }

    default:
      return { ok: false, error: `Unknown tool: ${name}` };
  }
}

// ---------------------------------------------------------------------------
// Helper: Trim history to prevent context bloat
// ---------------------------------------------------------------------------
function trimHistory(messages, maxLength = 300) {
  return messages.map((m) => {
    if (m.role === 'tool' && m.content && typeof m.content === 'string' && m.content.length > maxLength) {
      return { ...m, content: m.content.slice(0, maxLength) + '...(truncated)' };
    }
    return m;
  });
}

// ---------------------------------------------------------------------------
// Main entry point with ALL FIXES
// ---------------------------------------------------------------------------
export async function runAssistantTurn({ message, history = [], userId, timezone = 'Asia/Karachi', activeItem = null }) {
  const nowLocal = DateTime.now().setZone(timezone).toFormat('yyyy-MM-dd HH:mm');

  // ✅ ENHANCED SYSTEM PROMPT
  let systemPrompt = `You are the SayNotes assistant. You help the user create and manage notes, tasks, events, and reminders through natural conversation — like a friendly support widget, not a rigid form.

Current date/time for the user (${timezone}): ${nowLocal}.

Guidelines:
- If the user's request is missing key info (e.g. a reminder with no time), ask a short clarifying question instead of guessing.
- Once you have enough info, call the appropriate tool to actually create/update/delete/snooze/search the item.
- After a tool runs, confirm briefly and naturally in plain language (e.g. "Done — reminder set for tomorrow 9am").
- Keep replies short and conversational, not robotic.
- Never call deleteItem without clear confirmation from the user in this conversation.
- For snooze requests, use snoozeItem with either minutes or until.
- For search requests, use searchItems.
- When calling functions, numeric parameters like "limit" must be actual JSON numbers, never quoted strings (correct: {"limit": 10}, wrong: {"limit": "10"}).
- When the user asks about "today", "upcoming", or "overdue" items, always pass the matching 'when' parameter to listItems — never try to filter by date yourself from unfiltered results.`;

  if (activeItem) {
    systemPrompt += `\n\nThe user is currently looking at this item: ${JSON.stringify(activeItem)}. If they say 'that', 'it', or 'this', they mean this item — use its id for snoozeItem/updateItem/deleteItem calls.`;
  }

  systemPrompt += `\n\nCurrent user: ${userId}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: message },
  ];

  for (let turn = 0; turn < 4; turn++) {
    let completion;
    
    try {
      completion = await groq.chat.completions.create({
        model: ASSISTANT_MODEL,
        messages,
        tools,
        tool_choice: 'auto',
        temperature: 0.4,
      });
    } catch (err) {
      console.warn('⚠️ Groq call failed, retrying once:', err.message);
      
      const isToolError = err.message?.includes('tool_use_failed') || 
                          err.message?.includes('invalid') ||
                          err.message?.includes('parse');
      
      if (isToolError) {
        console.warn('🔄 Tool use failed — retrying with lower temperature for cleaner output');
        try {
          completion = await groq.chat.completions.create({
            model: ASSISTANT_MODEL,
            messages,
            tools,
            tool_choice: 'auto',
            temperature: 0.1,
          });
        } catch (retryErr) {
          console.error('❌ Retry also failed:', retryErr.message);
          const trimmed = trimHistory(messages.slice(1));
          return {
            reply: "Sorry, I had trouble understanding that — could you try rephrasing?",
            history: trimmed,
          };
        }
      } else {
        throw err;
      }
    }

    const responseMessage = completion.choices[0].message;
    messages.push(responseMessage);

    const toolCalls = responseMessage.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      const trimmed = trimHistory(messages.slice(1));
      return {
        reply: responseMessage.content || 'I understood your request. How can I help further?',
        history: trimmed,
      };
    }

    for (const call of toolCalls) {
      let args = {};
      try {
        args = JSON.parse(call.function.arguments || '{}');
      } catch (e) {
        console.warn('⚠️ assistant tool arg parse failed:', e.message);
      }

      if (!args || typeof args !== 'object') {
        console.warn('⚠️ assistant received invalid args (null/primitive), using empty object');
        args = {};
      }

      const result = await executeTool(call.function.name, args, { userId, timezone });

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
  }

  const trimmed = trimHistory(messages.slice(1));
  return {
    reply: "Sorry, I got a bit stuck on that one — could you rephrase what you'd like me to do?",
    history: trimmed,
  };
}