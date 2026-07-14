import express from 'express';
const router = express.Router();
import { scheduleNotification } from '../controllers/notificationController.js';
import { protect } from '../middleware/authMiddleware.js';

router.post('/schedule', protect, scheduleNotification);

export default router;
