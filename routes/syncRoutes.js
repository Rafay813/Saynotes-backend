import express from 'express';
const router = express.Router();
import { syncItems } from '../controllers/syncController.js';
import { protect } from '../middleware/authMiddleware.js';

router.post('/', protect, syncItems);

export default router;
