import express from 'express';
import {
  getItems,
  getItem,
  createItem,
  updateItem,
  deleteItem,
  updateItemStatus,
  confirmItem,
  sendReminder,
  getExpiredItems,
  toggleSubtask,
  getOverdueItems,      // ✅ Updated
  completeOverdueItem,   // ✅ Updated
  rescheduleOverdueItem, // ✅ Updated
} from '../controllers/itemController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect);

// Existing routes
router.get('/', getItems);
router.get('/expired', getExpiredItems);
router.get('/:id', getItem);
router.post('/', createItem);
router.patch('/:id', updateItem);
router.delete('/:id', deleteItem);
router.patch('/:id/status', updateItemStatus);
router.post('/confirm', confirmItem);
router.post('/:id/send-reminder', sendReminder);
router.patch('/:id/subtask/:index', toggleSubtask);

// ✅ Overdue items routes (all types)
router.get('/overdue', getOverdueItems);
router.post('/overdue/:id/complete', completeOverdueItem);
router.post('/overdue/:id/reschedule', rescheduleOverdueItem);

export default router;