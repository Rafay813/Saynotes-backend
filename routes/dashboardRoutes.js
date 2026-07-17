import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { getDashboard } from '../controllers/dashboardController.js';

const router = express.Router();

// GET /api/dashboard - Get dashboard data with AI summary
router.get('/', protect, getDashboard);

export default router;