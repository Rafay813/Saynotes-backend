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
} from '../controllers/itemController.js';

const router = express.Router();

// ✅ Protected routes
router.use(protect);

// GET /api/items - Get all items with filters
router.get('/', getItems);

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

// POST /api/items/confirm - Confirm item (voice flow)
router.post('/confirm', confirmItem);

// ✅ POST /api/items/:id/send-reminder - Send reminder email to client
router.post('/:id/send-reminder', sendReminder);

export default router;