import { runAssistantTurn, isAssistantAvailable } from '../services/assistantService.js';
import Item from '../models/Item.js';
import { DateTime } from 'luxon';

/**
 * POST /api/v1/assistant/chat
 * Body: { message: string, history?: Array<{role, content}>, timezone?: string, activeItem?: {id, title, type, startTime} }
 */
export const chatWithAssistant = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
        errorCode: 'UNAUTHORIZED',
      });
    }

    const { message, history, timezone, activeItem } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Message is required',
        errorCode: 'MISSING_MESSAGE',
      });
    }

    if (!isAssistantAvailable()) {
      return res.status(503).json({
        success: false,
        message: 'Assistant service unavailable. Please check your GROQ_API_KEY.',
        errorCode: 'SERVICE_UNAVAILABLE',
      });
    }

    // Limit history to prevent token overflow
    const safeHistory = Array.isArray(history) ? history.slice(-15) : [];

    const result = await runAssistantTurn({
      message: message.trim(),
      history: safeHistory,
      userId: req.user._id,
      timezone: timezone || req.user.timezone || 'Asia/Karachi',
      activeItem: activeItem || null,
    });

    return res.status(200).json({
      success: true,
      reply: result.reply,
      history: result.history,
    });
  } catch (error) {
    console.error('❌ Assistant chat error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process assistant request',
      errorCode: 'ASSISTANT_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * GET /api/v1/assistant/briefing
 * Returns today's items grouped by type (instant, no LLM call)
 */
export const getDailyBriefing = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
        errorCode: 'UNAUTHORIZED',
      });
    }

    const timezone = req.query.timezone || req.user.timezone || 'Asia/Karachi';
    const now = DateTime.now().setZone(timezone);
    const startOfDay = now.startOf('day').toJSDate();
    const endOfDay = now.endOf('day').toJSDate();

    const items = await Item.find({
      userId: req.user._id,
      $or: [
        { startTime: { $gte: startOfDay, $lte: endOfDay } },
        { createdAt: { $gte: startOfDay, $lte: endOfDay } },
      ],
    }).sort({ startTime: 1, createdAt: -1 }).lean();

    // Group by type
    const grouped = items.reduce((acc, item) => {
      const type = item.type || 'Note';
      if (!acc[type]) acc[type] = [];
      acc[type].push({
        id: item._id.toString(),
        title: item.title,
        status: item.status,
        startTime: item.startTime,
        endTime: item.endTime,
      });
      return acc;
    }, {});

    return res.status(200).json({
      success: true,
      date: now.toFormat('yyyy-MM-dd'),
      timezone,
      summary: {
        total: items.length,
        byType: Object.keys(grouped).map(type => ({
          type,
          count: grouped[type].length,
        })),
      },
      items: grouped,
    });
  } catch (error) {
    console.error('❌ Daily briefing error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get daily briefing',
      errorCode: 'BRIEFING_ERROR',
    });
  }
};

export default { chatWithAssistant, getDailyBriefing };