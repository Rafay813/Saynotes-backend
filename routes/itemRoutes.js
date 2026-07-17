import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
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
  toggleSubtask, // ✅ Phase 2: Subtask toggle
} from '../controllers/itemController.js';

const router = express.Router();

// ✅ Protected routes
router.use(protect);

// GET /api/items - Get all items with filters (excludes expired by default)
router.get('/', getItems);

// GET /api/items/expired - Get expired items
router.get('/expired', getExpiredItems);

// GET /api/items/:id - Get single item
router.get('/:id', getItem);

// POST /api/items - Create item
router.post('/', createItem);

// PATCH /api/items/:id - Update item (only if not expired)
router.patch('/:id', updateItem);

// DELETE /api/items/:id - Delete item (hard delete - admin only)
router.delete('/:id', deleteItem);

// PATCH /api/items/:id/status - Update status (only if not expired)
router.patch('/:id/status', updateItemStatus);

// ✅ Phase 2: PATCH /api/items/:id/subtask/:index - Toggle subtask
router.patch('/:id/subtask/:index', toggleSubtask);

// POST /api/items/confirm - Confirm item (voice flow)
router.post('/confirm', confirmItem);

// POST /api/items/:id/send-reminder - Send reminder email to client
router.post('/:id/send-reminder', sendReminder);

export default router;