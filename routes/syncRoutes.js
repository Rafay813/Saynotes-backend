import express from 'express';
import {
  syncToGoogle,
  syncAllToGoogle,
  getSyncStatus,
} from '../controllers/syncController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes are protected
router.use(protect);

// Sync a single item to Google
router.post('/sync', syncToGoogle);

// Sync all active items
router.post('/sync-all', syncAllToGoogle);

// Get sync status
router.get('/sync-status', getSyncStatus);

export default router;