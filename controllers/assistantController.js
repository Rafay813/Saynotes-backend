import { runAssistantTurn, isAssistantAvailable } from '../services/assistantService.js';

/**
 * POST /api/v1/assistant/chat
 * Body: { message: string, history?: Array<{role, content}>, timezone?: string }
 *
 * `history` should be the trimmed conversation array returned from the
 * previous call (client just stores and replays it) — keep it to the last
 * ~10-15 entries on the frontend to control token usage.
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

    const { message, history, timezone } = req.body;

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

    // Limit history to last 15 messages to control token usage
    const safeHistory = Array.isArray(history) ? history.slice(-15) : [];

    const result = await runAssistantTurn({
      message: message.trim(),
      history: safeHistory,
      userId: req.user._id,
      timezone: timezone || req.user.timezone || 'Asia/Karachi',
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

export default { chatWithAssistant };
