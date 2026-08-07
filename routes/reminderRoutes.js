import express from 'express';
import { hearNow } from '../controllers/notificationController.js';

const router = express.Router();
import {
  scheduleReminder,
  getReminders,
  getReminder,
  snoozeReminder,
  completeReminder,
  cancelReminder,
  markAsRead,
  processDueReminders,
  createFromVoice,
  registerToken,
} from '../controllers/reminderController.js';

import { protect } from '../middleware/authMiddleware.js';

// All reminder routes are protected
router.use(protect);

// Register push token
router.post('/register-token', registerToken);

// Main routes
router.route('/')
  .get(getReminders)
  .post(scheduleReminder);

// Voice reminder
router.post('/from-voice', createFromVoice);

// Process due reminders (internal)
router.get('/process-due', processDueReminders);

// Individual reminder routes
router.route('/:id')
  .get(getReminder)
  .delete(cancelReminder);

// Actions
router.post('/:id/snooze', snoozeReminder);
router.post('/:id/complete', completeReminder);
router.post('/:id/read', markAsRead);
router.post('/:id/hear-now', hearNow);

export default router;