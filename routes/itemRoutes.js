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
  getOverdueItems,
  completeOverdueItem,
  rescheduleOverdueItem,
  snoozeItem, // ✅ NEW
} from '../controllers/itemController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// ============================================================
// ✅ MAIN ITEM ROUTES
// ============================================================

// GET /api/v1/items - Get all items (with filtering)
router.get('/', getItems);

// GET /api/v1/items/expired - Get expired items
router.get('/expired', getExpiredItems);

// GET /api/v1/items/overdue - Get all overdue items
router.get('/overdue', getOverdueItems);

// GET /api/v1/items/:id - Get single item
router.get('/:id', getItem);

// POST /api/v1/items - Create item
router.post('/', createItem);

// PATCH /api/v1/items/:id - Update item
router.patch('/:id', updateItem);

// DELETE /api/v1/items/:id - Delete item
router.delete('/:id', deleteItem);

// PATCH /api/v1/items/:id/status - Update status only
router.patch('/:id/status', updateItemStatus);

// POST /api/v1/items/confirm - Confirm pending item (voice flow)
router.post('/confirm', confirmItem);

// POST /api/v1/items/:id/send-reminder - Send reminder notification
router.post('/:id/send-reminder', sendReminder);

// PATCH /api/v1/items/:id/subtask/:index - Toggle subtask
router.patch('/:id/subtask/:index', toggleSubtask);

// ✅ POST /api/v1/items/:id/snooze - Snooze an item
router.post('/:id/snooze', snoozeItem);

// ============================================================
// ✅ OVERDUE ITEM ROUTES (all types)
// ============================================================

// POST /api/v1/items/overdue/:id/complete - Complete overdue item
router.post('/overdue/:id/complete', completeOverdueItem);

// POST /api/v1/items/overdue/:id/reschedule - Reschedule overdue item
router.post('/overdue/:id/reschedule', rescheduleOverdueItem);

export default router;