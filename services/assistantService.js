import Groq from 'groq-sdk';
import { DateTime } from 'luxon';
import Item from '../models/Item.js';
import { parseDateTime, calculateEndTime } from '../utils/dateUtils.js';
import { invalidateDashboardCache } from '../controllers/dashboardController.js';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ✅ Use a Groq model that supports tool use
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
        "List the user's existing items, optionally filtered by type and/or status, so you can answer questions like 'what do I have today' or 'show my pending tasks'.",
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['Note', 'Task', 'Reminder', 'Event'] },
          status: {
            type: 'string',
            enum: ['pending_confirmation', 'active', 'completed', 'cancelled', 'expired'],
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
];

// ---------------------------------------------------------------------------
// Tool execution — actually touches the DB
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

    default:
      return { ok: false, error: `Unknown tool: ${name}` };
  }
}

// ---------------------------------------------------------------------------
// Main entry point — one conversational turn
// ---------------------------------------------------------------------------
export async function runAssistantTurn({ message, history = [], userId, timezone = 'Asia/Karachi' }) {
  const nowLocal = DateTime.now().setZone(timezone).toFormat('yyyy-MM-dd HH:mm');

  const systemPrompt = `You are the SayNotes assistant. You help the user create and manage notes, tasks, events, and reminders through natural conversation — like a friendly support widget, not a rigid form.

Current date/time for the user (${timezone}): ${nowLocal}.

Guidelines:
- If the user's request is missing key info (e.g. a reminder with no time), ask a short clarifying question instead of guessing.
- Once you have enough info, call the appropriate tool to actually create/update/delete the item.
- After a tool runs, confirm briefly and naturally in plain language (e.g. "Done — reminder set for tomorrow 9am").
- Keep replies short and conversational, not robotic.
- Never call deleteItem without clear confirmation from the user in this conversation.

Current user: ${userId}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: message },
  ];

  // Allow a couple of tool-call round trips (model may chain calls)
  for (let turn = 0; turn < 4; turn++) {
    const completion = await groq.chat.completions.create({
      model: ASSISTANT_MODEL,
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.4,
    });

    const responseMessage = completion.choices[0].message;
    messages.push(responseMessage);

    const toolCalls = responseMessage.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      // Final conversational reply
      return {
        reply: responseMessage.content || 'I understood your request. How can I help further?',
        history: messages.slice(1), // drop system prompt before returning to client
      };
    }

    // Execute each requested tool call and feed results back to the model
    for (const call of toolCalls) {
      let args = {};
      try {
        args = JSON.parse(call.function.arguments || '{}');
      } catch (e) {
        console.warn('⚠️ assistant tool arg parse failed:', e.message);
      }

      const result = await executeTool(call.function.name, args, { userId, timezone });

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
  }

  // Safety net if the model loops without settling
  return {
    reply: "Sorry, I got a bit stuck on that one — could you rephrase what you'd like me to do?",
    history: messages.slice(1),
  };
}

