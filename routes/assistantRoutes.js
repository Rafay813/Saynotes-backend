import express from 'express';
import { chatWithAssistant, getDailyBriefing } from '../controllers/assistantController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// All assistant routes require authentication
router.use(protect);

/**
 * POST /api/v1/assistant/chat
 * Conversational endpoint — send a message, get back a reply plus updated conversation history.
 */
router.post('/chat', chatWithAssistant);

/**
 * GET /api/v1/assistant/briefing
 * Get today's items grouped by type (instant, no LLM call)
 */
router.get('/briefing', getDailyBriefing);

export default router;