import express from 'express';
import { createBackup, restoreFromBackup } from '../controllers/backupController.js';
import { protect, restrictTo } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/create', protect, restrictTo('admin'), createBackup);
router.post('/restore', protect, restrictTo('admin'), restoreFromBackup);

export default router;