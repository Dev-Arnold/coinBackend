import express from 'express';
import { getActivityHistory } from '../controllers/activityController.js';
import { protect, isAdmin } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(protect, isAdmin);
router.get('/history', getActivityHistory);

export default router;