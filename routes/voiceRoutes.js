import express from 'express';
import { processVoice } from '../controllers/voiceController.js';
import upload from '../middleware/uploadMiddleware.js'; // ← Default import
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// ✅ Use upload.single('audio') - upload is the multer instance
router.post(
  '/process',
  protect,
  upload.single('audio'),
  processVoice
);

export default router;