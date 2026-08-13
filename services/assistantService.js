import Groq from 'groq-sdk';
import { DateTime } from 'luxon';
import Item from '../models/Item.js';
import { parseDateTime, calculateEndTime } from '../utils/dateUtils.js';
import { invalidateDashboardCache } from '../controllers/dashboardController.js';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const ASSISTANT_MODEL = process.env.GROQ_ASSISTANT_MODEL || 'openai/gpt-oss-120b';
const FALLBACK_MODEL = process.env.GROQ_FALLBACK_MODEL || 'openai/gpt-oss-20b';

export const isAssistantAvailable = () => Boolean(process.env.GROQ_API_KEY);

// ============================================
// SESSION STATE
// ============================================

const sessions = new Map();

function getSessionState(userId) {
  const key = userId?.toString?.() || userId;
  if (!sessions.has(key)) {
    sessions.set(key, {
      pendingDelete: null,
      lastAction: null,
    });
  }
  return sessions.get(key);
}

// ============================================
// HISTORY CLEANING
// ============================================

function getSafeHistory(history, limit = 6) {
  if (!Array.isArray(history)) {
    return [];
  }

  const cleaned = [];

  for (const msg of history) {
    if (!msg || typeof msg !== 'object') {
      continue;
    }

    const role = msg.role;

    // Never send internal tool messages
    if (role === 'tool') {
      continue;
    }

    // Never send assistant tool calls - this causes [Array] in logs
    if (role === 'assistant' && msg.tool_calls) {
      continue;
    }

    // Only user / assistant messages
    if (role !== 'user' && role !== 'assistant') {
      continue;
    }

    // Content must be a real string
    if (typeof msg.content !== 'string' || !msg.content.trim()) {
      continue;
    }

    cleaned.push({
      role,
      content: msg.content.trim(),
    });
  }

  return cleaned.slice(-limit);
}

function trimHistory(history, max = 10) {
  if (!Array.isArray(history)) return [];
  return history.slice(-max);
}

// ============================================
// PARSE CONFIRMATION
// ============================================

function parseConfirmation(text) {
  const lower = text.toLowerCase().trim();
  const yesWords = ['yes', 'yeah', 'yep', 'sure', 'ok', 'okay', 'confirm', 'proceed', 'delete', 'go ahead'];
  const noWords = ['no', 'nah', 'nope', 'cancel', 'stop', 'abort', 'never mind', 'dont delete', "don't delete"];

  const confirmed = yesWords.some(word => lower === word || lower.includes(word) || lower.startsWith(word));
  const cancelled = noWords.some(word => lower === word || lower.includes(word) || lower.startsWith(word));

  return { confirmed: confirmed && !cancelled, cancelled };
}

function containsReference(text) {
  const refs = /\b(this|that|it|the|my|first|second|last|previous|above|below|current|selected|highlighted)\b/i;
  return refs.test(text);
}

// ============================================
// VALIDATION - FIXED: time is now optional
// ============================================

function validateCreateItem(args) {
  if (!args.type) {
    return {
      valid: false,
      message: 'What type of item should I create? Task, Event, Reminder, or Note?',
    };
  }

  if (!args.title?.trim()) {
    return {
      valid: false,
      message: 'What should I call it?',
    };
  }

  if (args.type === 'Event' || args.type === 'Reminder') {
    if (!args.date) {
      return {
        valid: false,
        message: `What date should I set the ${args.type.toLowerCase()} for?`,
      };
    }
    // ✅ time is optional now — parseDateTime will default it to "now + 2h" (today) or 9 AM (future date)
  }

  return {
    valid: true,
    args,
  };
}

// ============================================
// TOOL DEFINITIONS - FIXED: LLM passes raw phrases
// ============================================

const tools = [
  {
    type: 'function',
    function: {
      name: 'createItem',
      description: 'Create a new task, event, reminder, or note',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['Task', 'Event', 'Reminder', 'Note'],
            description: 'Type of item to create',
          },
          title: {
            type: 'string',
            description: 'Title or short description of the item',
          },
          content: {
            type: 'string',
            description: 'Additional details or description',
          },
          date: {
            type: 'string',
            description: 'The date exactly as the user said it — e.g. "today", "tomorrow", "next Friday", "July 20". Do NOT compute or convert it yourself; pass the natural-language phrase through as-is.',
          },
          time: {
            type: 'string',
            description: 'The time exactly as the user said it — e.g. "7 PM", "7:30pm", "19:00". Do NOT convert AM/PM yourself; pass the phrase through as-is.',
          },
          duration: {
            type: 'number',
            description: 'Duration in minutes (for events)',
          },
          priority: {
            type: 'string',
            enum: ['low', 'medium', 'high'],
            description: 'Priority level',
          },
          category: {
            type: 'string',
            description: 'Category like Work, Personal, Shopping, etc.',
          },
          location: {
            type: 'string',
            description: 'Location (for events)',
          },
          repeat: {
            type: 'string',
            enum: ['none', 'daily', 'weekly', 'monthly'],
            description: 'Repeat pattern',
          },
          subtasks: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of subtasks (for tasks)',
          },
        },
        required: ['type', 'title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'updateItem',
      description: 'Update an existing item',
      parameters: {
        type: 'object',
        properties: {
          itemId: {
            type: 'string',
            description: 'The ID of the item to update',
          },
          title: {
            type: 'string',
            description: 'New title',
          },
          content: {
            type: 'string',
            description: 'New content',
          },
          date: {
            type: 'string',
            description: 'The date exactly as the user said it — e.g. "today", "tomorrow", "next Friday". Do NOT compute or convert it yourself; pass the natural-language phrase through as-is.',
          },
          time: {
            type: 'string',
            description: 'The time exactly as the user said it — e.g. "7 PM", "7:30pm". Do NOT convert AM/PM yourself; pass the phrase through as-is.',
          },
          status: {
            type: 'string',
            enum: ['active', 'completed', 'archived'],
            description: 'New status',
          },
          priority: {
            type: 'string',
            enum: ['low', 'medium', 'high'],
            description: 'New priority',
          },
          category: {
            type: 'string',
            description: 'New category',
          },
        },
        required: ['itemId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'deleteItem',
      description: 'Delete an item (requires confirmation)',
      parameters: {
        type: 'object',
        properties: {
          itemId: {
            type: 'string',
            description: 'The ID of the item to delete',
          },
        },
        required: ['itemId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'snoozeItem',
      description: 'Snooze a reminder or event to a new time',
      parameters: {
        type: 'object',
        properties: {
          itemId: {
            type: 'string',
            description: 'The ID of the item to snooze',
          },
          date: {
            type: 'string',
            description: 'The date exactly as the user said it — e.g. "tomorrow", "next Monday". Do NOT compute or convert it yourself; pass the natural-language phrase through as-is.',
          },
          time: {
            type: 'string',
            description: 'The time exactly as the user said it — e.g. "9 AM", "2:30pm". Do NOT convert AM/PM yourself; pass the phrase through as-is.',
          },
        },
        required: ['itemId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listItems',
      description: 'List items based on filters',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['Task', 'Event', 'Reminder', 'Note'],
            description: 'Filter by item type',
          },
          status: {
            type: 'string',
            enum: ['active', 'completed', 'archived'],
            description: 'Filter by status',
          },
          when: {
            type: 'string',
            enum: ['today', 'upcoming', 'overdue'],
            description: 'Time filter for items with startTime',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of items to return',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'searchItems',
      description: 'Search for items by text',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search text',
          },
          type: {
            type: 'string',
            enum: ['Task', 'Event', 'Reminder', 'Note'],
            description: 'Filter by item type',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of items to return',
          },
        },
        required: ['query'],
      },
    },
  },
];

// ============================================
// ITEM RESOLUTION
// ============================================

async function resolveItemReference(userId, text, lastAction) {
  const words = text.toLowerCase().split(/\s+/);
  
  // Try to find by last action first
  if (lastAction?.itemId) {
    const item = await Item.findById(lastAction.itemId);
    if (item && item.userId.toString() === userId.toString()) {
      const itemWords = item.title.toLowerCase().split(/\s+/);
      const overlap = words.filter(w => itemWords.includes(w) && w.length > 3);
      if (overlap.length > 0 || words.some(w => w === 'this' || w === 'it')) {
        return { status: 'found', item };
      }
    }
  }

  // Search for items with matching words
  const query = { userId };
  const allItems = await Item.find(query).limit(20).lean();

  // Score each item
  const scored = allItems.map(item => {
    const titleWords = item.title.toLowerCase().split(/\s+/);
    let score = 0;
    for (const word of words) {
      if (word.length < 3) continue;
      if (titleWords.some(tw => tw.includes(word) || word.includes(tw))) {
        score++;
      }
    }
    return { ...item, score };
  });

  const sorted = scored.filter(i => i.score > 0).sort((a, b) => b.score - a.score);

  if (sorted.length === 0) {
    return { status: 'not_found' };
  }

  if (sorted.length === 1) {
    return { status: 'found', item: sorted[0] };
  }

  if (sorted[0].score > sorted[1].score + 1) {
    return { status: 'found', item: sorted[0] };
  }

  return { status: 'ambiguous', items: sorted.slice(0, 3) };
}

// ============================================
// DELETE CONFIRMATION
// ============================================

async function confirmDelete(userId, itemId, timezone) {
  const item = await Item.findById(itemId);
  if (!item) {
    return { ok: false, error: 'Item not found.' };
  }

  if (item.userId.toString() !== userId.toString()) {
    return { ok: false, error: 'Unauthorized.' };
  }

  await Item.findByIdAndDelete(itemId);
  invalidateDashboardCache(userId);

  const formattedTime = item.startTime
    ? DateTime.fromJSDate(item.startTime)
        .setZone(timezone)
        .toFormat('h:mm a')
    : '';

  return {
    ok: true,
    message: `🗑️ Deleted "${item.title}"${formattedTime ? ` (${formattedTime})` : ''}`,
  };
}

// ============================================
// TOOL EXECUTION - FIXED: uses shared parseDateTime
// ============================================

async function executeTool(toolName, args, context) {
  const { userId, timezone } = context;

  switch (toolName) {
    case 'createItem': {
      // ✅ FIXED: Default missing date to "today", matching voice-button pipeline
      if (!args.date && (args.type === 'Event' || args.type === 'Reminder')) {
        args.date = 'today';
      }

      const validation = validateCreateItem(args);

      if (!validation.valid) {
        return {
          ok: false,
          error: validation.message,
        };
      }

      let startTime = null;
      let endTime = null;

      // ✅ Use shared parseDateTime from dateUtils.js
      if (args.date) {
        startTime = parseDateTime(args.date, args.time, timezone);

        if (!startTime) {
          return {
            ok: false,
            error: `I couldn't understand the date/time. Please provide a clear date like "tomorrow" or "next Friday" and time like "7 PM".`,
          };
        }

        if (args.duration) {
          try {
            endTime = calculateEndTime(startTime, null, args.duration, timezone);
          } catch (error) {
            console.warn('⚠️ calculateEndTime failed:', error.message);
          }
        }
      }

      const itemData = {
        userId,
        type: args.type,
        title: args.title.trim(),
        content: args.content || '',
        startTime,
        endTime,
        status: 'active',
        priority: args.priority || 'medium',
        category: args.category || 'General',
        location: args.location || null,
        repeat: args.repeat || 'none',
      };

      // ✅ Handle subtasks if provided
      if (args.type === 'Task' && Array.isArray(args.subtasks) && args.subtasks.length > 0) {
        itemData.subtasks = args.subtasks.map((text) => ({
          text,
          done: false,
        }));
      }

      const savedItem = await Item.create(itemData);

      invalidateDashboardCache(userId);

      const session = getSessionState(userId);
      session.lastAction = {
        itemId: savedItem._id.toString(),
        type: savedItem.type,
        title: savedItem.title,
      };

      const formattedTime = startTime
        ? DateTime.fromJSDate(startTime)
            .setZone(timezone)
            .toFormat('h:mm a')
        : '';

      return {
        ok: true,
        item: {
          id: savedItem._id.toString(),
          type: savedItem.type,
          title: savedItem.title,
          startTime: savedItem.startTime,
          endTime: savedItem.endTime,
        },
        message: formattedTime
          ? `✅ Created ${savedItem.type}: "${savedItem.title}" for ${formattedTime}`
          : `✅ Created ${savedItem.type}: "${savedItem.title}"`,
      };
    }

    case 'updateItem': {
      if (!args.itemId) {
        return { ok: false, error: 'Item ID is required.' };
      }

      const item = await Item.findById(args.itemId);
      if (!item) {
        return { ok: false, error: 'Item not found.' };
      }

      if (item.userId.toString() !== userId.toString()) {
        return { ok: false, error: 'Unauthorized.' };
      }

      const updates = {};

      if (args.title) updates.title = args.title.trim();
      if (args.content) updates.content = args.content;

      // ✅ Use shared parseDateTime from dateUtils.js
      if (args.date) {
        const startTime = parseDateTime(args.date, args.time, timezone);
        if (startTime) {
          updates.startTime = startTime;
        } else {
          return {
            ok: false,
            error: `I couldn't understand the date/time. Please provide a clear date like "tomorrow" or "next Friday" and time like "7 PM".`,
          };
        }
      }

      if (args.status) updates.status = args.status;
      if (args.priority) updates.priority = args.priority;
      if (args.category) updates.category = args.category;

      const updatedItem = await Item.findByIdAndUpdate(
        args.itemId,
        updates,
        { new: true }
      );

      invalidateDashboardCache(userId);

      const session = getSessionState(userId);
      session.lastAction = {
        itemId: updatedItem._id.toString(),
        type: updatedItem.type,
        title: updatedItem.title,
      };

      const formattedTime = updatedItem.startTime
        ? DateTime.fromJSDate(updatedItem.startTime)
            .setZone(timezone)
            .toFormat('h:mm a')
        : '';

      return {
        ok: true,
        item: {
          id: updatedItem._id.toString(),
          type: updatedItem.type,
          title: updatedItem.title,
          startTime: updatedItem.startTime,
        },
        message: formattedTime
          ? `✅ Updated "${updatedItem.title}" for ${formattedTime}`
          : `✅ Updated "${updatedItem.title}"`,
      };
    }

    case 'deleteItem': {
      if (!args.itemId) {
        return { ok: false, error: 'Item ID is required.' };
      }

      const item = await Item.findById(args.itemId);
      if (!item) {
        return { ok: false, error: 'Item not found.' };
      }

      if (item.userId.toString() !== userId.toString()) {
        return { ok: false, error: 'Unauthorized.' };
      }

      const session = getSessionState(userId);
      session.pendingDelete = {
        itemId: args.itemId,
        title: item.title,
      };

      return {
        ok: true,
        needsConfirmation: true,
        message: `⚠️ Are you sure you want to delete "${item.title}"? (Say "yes" to confirm)`,
      };
    }

    case 'snoozeItem': {
      if (!args.itemId) {
        return { ok: false, error: 'Item ID is required.' };
      }

      const item = await Item.findById(args.itemId);
      if (!item) {
        return { ok: false, error: 'Item not found.' };
      }

      if (item.userId.toString() !== userId.toString()) {
        return { ok: false, error: 'Unauthorized.' };
      }

      if (!args.date) {
        return { ok: false, error: 'Please provide a new date to snooze to.' };
      }

      // ✅ Use shared parseDateTime from dateUtils.js
      const startTime = parseDateTime(args.date, args.time, timezone);
      if (!startTime) {
        return {
          ok: false,
          error: `I couldn't understand the date/time. Please provide a clear date like "tomorrow" or "next Monday".`,
        };
      }

      const updatedItem = await Item.findByIdAndUpdate(
        args.itemId,
        { startTime },
        { new: true }
      );

      invalidateDashboardCache(userId);

      const session = getSessionState(userId);
      session.lastAction = {
        itemId: updatedItem._id.toString(),
        type: updatedItem.type,
        title: updatedItem.title,
      };

      const formattedTime = DateTime.fromJSDate(startTime)
        .setZone(timezone)
        .toFormat('h:mm a');

      return {
        ok: true,
        message: `⏰ Snoozed "${updatedItem.title}" to ${formattedTime}`,
      };
    }

    case 'listItems': {
      const query = { userId };

      if (args.type) {
        query.type = args.type;
      }

      if (args.status) {
        query.status = args.status;
      }

      const now = DateTime.now().setZone(timezone);

      if (args.when === 'today') {
        query.startTime = {
          $gte: now.startOf('day').toUTC().toJSDate(),
          $lte: now.endOf('day').toUTC().toJSDate(),
        };

        if (!args.status) {
          query.status = 'active';
        }
      }

      if (args.when === 'upcoming') {
        query.startTime = {
          $gt: now.endOf('day').toUTC().toJSDate(),
        };

        if (!args.status) {
          query.status = 'active';
        }
      }

      if (args.when === 'overdue') {
        query.startTime = {
          $lt: now.toJSDate(),
        };

        if (!args.status) {
          query.status = 'active';
        }
      }

      const items = await Item.find(query)
        .sort({ startTime: 1, createdAt: -1 })
        .limit(args.limit || 10)
        .lean();

      if (!items.length) {
        return {
          ok: true,
          items: [],
          count: 0,
          message: 'No items found matching your criteria.',
        };
      }

      const formattedItems = items.map((item) => ({
        id: item._id.toString(),
        type: item.type,
        title: item.title,
        status: item.status,
        startTime: item.startTime,
        formattedTime: item.startTime
          ? DateTime.fromJSDate(item.startTime)
              .setZone(timezone)
              .toFormat('h:mm a')
          : null,
      }));

      const summary = formattedItems
        .map((item) => `• ${item.type}: "${item.title}"${item.formattedTime ? ` at ${item.formattedTime}` : ''}`)
        .join('\n');

      return {
        ok: true,
        items: formattedItems,
        count: items.length,
        message: `📋 Found ${items.length} item(s):\n${summary}`,
      };
    }

    case 'searchItems': {
      if (!args.query) {
        return { ok: false, error: 'Search query is required.' };
      }

      const query = {
        userId,
        $or: [
          { title: { $regex: args.query, $options: 'i' } },
          { content: { $regex: args.query, $options: 'i' } },
        ],
      };

      if (args.type) {
        query.type = args.type;
      }

      const items = await Item.find(query)
        .limit(args.limit || 10)
        .lean();

      if (!items.length) {
        return {
          ok: true,
          items: [],
          count: 0,
          message: `No items found matching "${args.query}".`,
        };
      }

      return {
        ok: true,
        items: items.map((item) => ({
          id: item._id.toString(),
          type: item.type,
          title: item.title,
          status: item.status,
          startTime: item.startTime,
        })),
        count: items.length,
        message: `🔍 Found ${items.length} item(s) matching "${args.query}"`,
      };
    }

    default: {
      return { ok: false, error: `Unknown tool: ${toolName}` };
    }
  }
}

// ============================================
// GROQ CALL WITH RETRIES
// ============================================

async function callGroqWithRetries(model, messages, tools, temperature = 0.15, maxRetries = 2) {
  let lastError = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`🤖 Groq request using ${model}, attempt ${attempt + 1}`);

      return await groq.chat.completions.create({
        model,
        messages,
        tools,
        tool_choice: 'auto',
        temperature,
        max_tokens: 1024,
        parallel_tool_calls: false,
        reasoning_effort: 'low',
      });
    } catch (err) {
      lastError = err;

      // Log the FULL error details
      console.error(`❌ Groq attempt ${attempt + 1} failed`);
      console.error('Status:', err?.status);
      console.error('Message:', err?.message);
      console.error('Code:', err?.code);
      console.error('Type:', err?.type);
      console.error('Response data:', JSON.stringify(err?.response?.data, null, 2));
      
      // Log the messages that caused the error (helpful for debugging)
      console.error('Messages sent to Groq:', JSON.stringify(
        messages.map(m => ({
          role: m.role,
          content: typeof m.content === 'string' ? m.content.substring(0, 100) : (m.content ? 'present' : 'empty'),
          tool_calls: m.tool_calls ? 'present' : undefined,
        })),
        null,
        2
      ));

      // Rate limit
      if (err?.status === 429) {
        const retryAfter = err?.headers?.['retry-after'];
        const waitMs = retryAfter ? Number(retryAfter) * 1000 : 2000;
        console.log(`⏳ Rate limited. Waiting ${waitMs}ms`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }

      // Fallback model
      if (attempt === 0 && model !== FALLBACK_MODEL) {
        console.warn(`🔄 Trying fallback model: ${FALLBACK_MODEL}`);

        try {
          return await groq.chat.completions.create({
            model: FALLBACK_MODEL,
            messages,
            tools,
            tool_choice: 'auto',
            temperature: 0.2,
            max_tokens: 1024,
            parallel_tool_calls: false,
            reasoning_effort: 'low',
          });
        } catch (fallbackError) {
          console.error('❌ Fallback model failed:', fallbackError?.message);
          console.error('Fallback response:', fallbackError?.response?.data);
          lastError = fallbackError;
        }
      }

      if (attempt < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  throw lastError || new Error('All Groq attempts failed');
}

// ============================================
// MAIN ASSISTANT TURN
// ============================================

export async function runAssistantTurn({
  message,
  history = [],
  userId,
  timezone = 'Asia/Karachi',
  activeItem = null,
}) {
  try {
    const now = DateTime.now().setZone(timezone);
    const todayDate = now.toFormat('yyyy-MM-dd');
    const nowLocal = now.toFormat('yyyy-MM-dd HH:mm');

    const session = getSessionState(userId);

    console.log('🤖 Assistant turn');
    console.log('Message:', message);
    console.log('Timezone:', timezone);
    console.log('Today:', todayDate);
    console.log('History received:', history?.length || 0);

    // --------------------------------------------------
    // DELETE CONFIRMATION
    // --------------------------------------------------

    if (session.pendingDelete) {
      const { confirmed, cancelled } = parseConfirmation(message);

      if (cancelled) {
        session.pendingDelete = null;

        return {
          reply: '✅ Cancelled deletion.',
          history: [
            ...getSafeHistory(history),
            { role: 'user', content: message },
            { role: 'assistant', content: 'Cancelled deletion.' },
          ],
        };
      }

      if (confirmed) {
        try {
          const result = await confirmDelete(userId, session.pendingDelete.itemId, timezone);
          session.pendingDelete = null;

          return {
            reply: result.ok ? result.message : `❌ ${result.error}`,
            history: [
              ...getSafeHistory(history),
              { role: 'user', content: message },
              { role: 'assistant', content: result.ok ? result.message : `❌ ${result.error}` },
            ],
          };
        } catch (error) {
          console.error('❌ Delete confirmation error:', error);
          session.pendingDelete = null;

          return {
            reply: "❌ I couldn't delete that item right now. Please try again.",
            history: getSafeHistory(history),
          };
        }
      }
    }

    // --------------------------------------------------
    // ITEM RESOLUTION
    // --------------------------------------------------

    const actionWords = /\b(update|change|edit|modify|delete|remove|complete|finish|snooze|move|show|get|find|search)\b/i;
    let resolvedItemId = null;

    if (actionWords.test(message)) {
      try {
        const resolution = await resolveItemReference(userId, message, session.lastAction);

        if (resolution.status === 'found') {
          resolvedItemId = resolution.item._id.toString();
          console.log(`🔎 Resolved item: ${resolution.item.title}`);
        }

        if (resolution.status === 'ambiguous') {
          const titles = resolution.items.map((item) => `"${item.title}"`).join(', ');

          return {
            reply: `I found multiple matching items: ${titles}. Which one do you mean?`,
            history: getSafeHistory(history),
          };
        }

        if (resolution.status === 'not_found' && containsReference(message)) {
          return {
            reply: "I couldn't find the item you're referring to. Could you be more specific?",
            history: getSafeHistory(history),
          };
        }
      } catch (error) {
        console.error('❌ Item resolution failed:', error);
      }
    }

    // --------------------------------------------------
    // SYSTEM PROMPT - FIXED: Tell LLM to pass raw date/time
    // --------------------------------------------------

    const systemPrompt = `
You are the SayNotes assistant.

You manage:
- Notes
- Tasks
- Reminders
- Events

Current date/time:
${nowLocal}

Today's date:
${todayDate}

Timezone:
${timezone}

IMPORTANT RULES:

CREATE:
- Always use the createItem tool when the user asks to create something.
- For Event and Reminder, date is required. Time is optional.
- Pass date and time through exactly as the user said them (e.g. "next Friday", "7 PM"). The server will resolve them — do NOT compute dates or convert times yourself.
- If user says "today", pass "today" as the date.

TASK:
- If user says "task of buying milk and go to market at 7 pm", create a Task.
- Preserve the user's intended title/content.
- If the user lists multiple distinct things to do (separated by commas, "and", "then"), put each one as a separate string in the "subtasks" array so they show up as individual checklist items — do not collapse them into one title only. Example: "buy milk, do assignments and go to market" → subtasks: ["Buy milk", "Do assignments", "Go to market"].

UPDATE:
- Use updateItem.
- Never invent itemId.
- If an itemId was resolved by the server, use it.

DELETE:
- Never delete immediately.
- deleteItem will ask for confirmation.

SNOOZE:
- Use snoozeItem.

LIST:
- Use listItems.

SEARCH:
- Use searchItems.

RESPONSE:
- Be short and natural.
- Do not claim success unless the tool result says ok=true.
`;

    const cleanHistory = getSafeHistory(history, 6);

    const messages = [
      { role: 'system', content: systemPrompt },
      ...cleanHistory,
      { role: 'user', content: message },
    ];

    // Add active item context
    if (activeItem) {
      messages[0].content += `\n\nCurrently selected item:\n${JSON.stringify(activeItem)}`;
    }

    if (session.lastAction) {
      messages[0].content += `\n\nLast successful action:\nID: ${session.lastAction.itemId}\nType: ${session.lastAction.type}\nTitle: ${session.lastAction.title}`;
    }

    console.log('📤 Sending clean messages to Groq:', JSON.stringify(
      messages.map((m) => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content.substring(0, 150) : typeof m.content,
        tool_calls: m.tool_calls ? 'present' : undefined,
      })),
      null,
      2
    ));

    // --------------------------------------------------
    // FIRST GROQ CALL
    // --------------------------------------------------

    let completion = await callGroqWithRetries(ASSISTANT_MODEL, messages, tools, 0.15);
    let responseMessage = completion?.choices?.[0]?.message;

    if (!responseMessage) {
      throw new Error('Groq returned no response message');
    }

    // --------------------------------------------------
    // TOOL LOOP
    // --------------------------------------------------

    const maxIterations = 3;

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const toolCalls = responseMessage.tool_calls;

      // NO TOOL CALL - return natural response
      if (!toolCalls || !Array.isArray(toolCalls) || toolCalls.length === 0) {
        const reply = responseMessage.content?.trim() || 'I understood your request.';

        const newHistory = [
          ...cleanHistory,
          { role: 'user', content: message },
          { role: 'assistant', content: reply },
        ];

        return {
          reply,
          history: trimHistory(getSafeHistory(newHistory, 8)),
        };
      }

      console.log(`🔧 Groq requested ${toolCalls.length} tool(s)`);

      // ADD ASSISTANT TOOL CALL TO INTERNAL MESSAGES
      messages.push(responseMessage);

      let confirmationMessage = null;
      let successfulResults = [];
      let failedResults = [];

      // EXECUTE TOOLS
      for (const call of toolCalls) {
        let args = {};

        try {
          args = JSON.parse(call.function.arguments || '{}');
        } catch (error) {
          console.error('❌ Invalid tool JSON:', call.function.arguments);

          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            name: call.function.name,
            content: JSON.stringify({ ok: false, error: 'Invalid tool arguments.' }),
          });

          continue;
        }

        // SERVER-SIDE ITEM ID RESOLUTION
        if (!args.itemId && resolvedItemId && ['updateItem', 'deleteItem', 'snoozeItem', 'getItem'].includes(call.function.name)) {
          args.itemId = resolvedItemId;
          console.log(`🔗 Injected resolved itemId: ${resolvedItemId}`);
        }

        console.log(`🔧 Executing ${call.function.name}:`, JSON.stringify(args, null, 2));

        let result;

        try {
          result = await executeTool(call.function.name, args, {
            userId,
            timezone,
          });
        } catch (error) {
          console.error(`❌ Tool ${call.function.name} crashed:`, error);

          result = {
            ok: false,
            error: 'The action could not be completed.',
          };
        }

        console.log(`📥 Tool result ${call.function.name}:`, JSON.stringify(result, null, 2));

        if (result.ok === true) {
          successfulResults.push(result);
        } else {
          failedResults.push(result);
        }

        if (result.needsConfirmation) {
          confirmationMessage = result.message;
        }

        // ADD TOOL RESULT TO MESSAGES (CRITICAL FOR SECOND GROQ CALL)
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          name: call.function.name,
          content: JSON.stringify(result),
        });
      }

      // DELETE CONFIRMATION - return early
      if (confirmationMessage) {
        const newHistory = [
          ...cleanHistory,
          { role: 'user', content: message },
          { role: 'assistant', content: confirmationMessage },
        ];

        return {
          reply: confirmationMessage,
          history: trimHistory(getSafeHistory(newHistory, 8)),
        };
      }

      // IF TOOL FAILED - return error
      if (failedResults.length > 0 && successfulResults.length === 0) {
        const reply = failedResults
          .map((r) => `❌ ${r.error || 'The action failed.'}`)
          .join('\n');

        const newHistory = [
          ...cleanHistory,
          { role: 'user', content: message },
          { role: 'assistant', content: reply },
        ];

        return {
          reply,
          history: trimHistory(getSafeHistory(newHistory, 8)),
        };
      }

      // --------------------------------------------------
      // SECOND GROQ CALL
      // Send tool results back to Groq for final response
      // --------------------------------------------------

      console.log('🤖 Sending tool result back to Groq for final response...');

      completion = await callGroqWithRetries(
        ASSISTANT_MODEL,
        messages, // Now includes tool results
        tools,
        0.15
      );

      responseMessage = completion?.choices?.[0]?.message;

      if (!responseMessage) {
        throw new Error('Groq returned no response after tool execution');
      }

      // Continue loop to check if more tool calls are needed
      // or if we have a final natural response
    }

    // --------------------------------------------------
    // MAX ITERATIONS REACHED
    // --------------------------------------------------

    return {
      reply: "✅ I completed the requested action.",
      history: getSafeHistory(history),
    };

  } catch (err) {
    // --------------------------------------------------
    // COMPREHENSIVE ERROR LOGGING
    // --------------------------------------------------

    console.error('========================================');
    console.error('❌ ASSISTANT TURN FAILED');
    console.error('Message:', message);
    console.error('Error message:', err?.message);
    console.error('Error status:', err?.status);
    console.error('Error code:', err?.code);
    console.error('Error type:', err?.type);
    console.error('Error response:', JSON.stringify(err?.response?.data, null, 2));
    console.error('Full error:', err);
    console.error('========================================');

    return {
      reply: "I couldn't process that request right now. Please try again in a moment.",
      history: getSafeHistory(history),
    };
  }
}