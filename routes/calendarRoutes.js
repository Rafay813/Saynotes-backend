import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { 
  getCalendarAgenda,
  syncEventToGoogle 
} from '../controllers/calendarController.js';

const router = express.Router();

// ✅ GET /api/calendar/agenda - Get merged calendar (local + Google)
router.get('/agenda', protect, getCalendarAgenda);

// ✅ POST /api/calendar/sync - Sync local event to Google Calendar
router.post('/sync', protect, syncEventToGoogle);

export default router;