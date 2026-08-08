import express from 'express';
import { chatWithAssistant } from '../controllers/assistantController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// All assistant routes require authentication
router.use(protect);

/**
 * POST /api/v1/assistant/chat
 * Conversational endpoint — send a message (typed or transcribed voice),
 * get back a reply plus updated conversation history.
 * 
 * Request body:
 * {
 *   message: string,
 *   history?: Array<{ role: 'user' | 'assistant', content: string }>,
 *   timezone?: string
 * }
 * 
 * Response:
 * {
 *   success: boolean,
 *   reply: string,
 *   history: Array<{ role: 'user' | 'assistant', content: string }>
 * }
 */
router.post('/chat', chatWithAssistant);

export default router;

