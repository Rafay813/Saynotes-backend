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
  toggleSubtask,
} from '../controllers/itemController.js';

const router = express.Router();

// ✅ Protected routes
router.use(protect);

// GET /api/items - Get all items with filters (timezone-aware)
router.get('/', getItems);

// GET /api/items/expired - Get expired items
router.get('/expired', getExpiredItems);

// GET /api/items/:id - Get single item
router.get('/:id', getItem);

// POST /api/items - Create item
router.post('/', createItem);

// PATCH /api/items/:id - Update item
router.patch('/:id', updateItem);

// DELETE /api/items/:id - Delete item
router.delete('/:id', deleteItem);

// PATCH /api/items/:id/status - Update status
router.patch('/:id/status', updateItemStatus);

// PATCH /api/items/:id/subtask/:index - Toggle subtask
router.patch('/:id/subtask/:index', toggleSubtask);

// POST /api/items/confirm - Confirm item
router.post('/confirm', confirmItem);

// POST /api/items/:id/send-reminder - Send reminder
router.post('/:id/send-reminder', sendReminder);

export default router;