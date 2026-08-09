import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  getUpcomingReminders,
  getReminders, // ✅ Added list endpoint
  snoozeReminder,
  completeReminder,
  getCheckInTasks,
  respondToCheckIn,
  hearNow,
  registerToken, // ✅ Fixed: registerToken is now imported
} from '../controllers/reminderController.js';

const router = express.Router();

// All reminder routes are protected
router.use(protect);

// Register push token
router.post('/register-token', registerToken);

// Get reminders list (with pagination/filtering)
router.get('/', getReminders);

// Get upcoming reminders (next hour)
router.get('/upcoming', getUpcomingReminders);

// Get tasks needing check-in
router.get('/checkin', getCheckInTasks);

// Actions on reminders (Items)
router.post('/:id/snooze', snoozeReminder);
router.post('/:id/complete', completeReminder);
router.post('/:id/hear-now', hearNow);
router.post('/:id/checkin-response', respondToCheckIn);

export default router;