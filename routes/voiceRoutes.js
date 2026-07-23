import express from 'express';
import { processVoice, transcribeOnly, parseText } from '../controllers/voiceController.js';
import upload from '../middleware/uploadMiddleware.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// ✅ All voice routes are protected (require authentication)
router.use(protect);

/**
 * POST /api/v1/voice/process
 * Process voice recording: transcribe + AI classify + create item
 * Expects: multipart/form-data with 'audio' file
 */
router.post('/process', upload.single('audio'), processVoice);

/**
 * POST /api/v1/voice/transcribe
 * Transcribe audio only (no AI classification or item creation)
 * Expects: multipart/form-data with 'audio' file
 */
router.post('/transcribe', upload.single('audio'), transcribeOnly);

/**
 * POST /api/v1/voice/parse
 * Parse text with AI (no audio required)
 * Expects: JSON with { text, timezone }
 */
router.post('/parse', parseText);

export default router;