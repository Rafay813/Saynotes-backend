import express from 'express';
import { processVoice, transcribeOnly, parseText } from '../controllers/voiceController.js';
import upload from '../middleware/uploadMiddleware.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// ✅ Protected routes
router.use(protect);

// POST /api/voice/process - Process voice and create item
router.post(
  '/process',
  upload.single('audio'),
  processVoice
);

// POST /api/voice/transcribe - Transcribe audio only
router.post(
  '/transcribe',
  upload.single('audio'),
  transcribeOnly
);

// POST /api/voice/parse - Parse text with AI
router.post(
  '/parse',
  parseText
);

export default router;