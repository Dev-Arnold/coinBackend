import express from 'express';
import {
  submitKyc,
  getKycStatus,
  getPendingKyc,
  reviewKyc,
  approveKyc
} from '../controllers/kycController.js';
import { protect, isAdmin } from '../middlewares/authMiddleware.js';
import { kycUpload } from '../cloudinaryConfig.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// User routes
router.post('/submit', kycUpload.fields([
  { name: 'idCardImage', maxCount: 1 },
  { name: 'proofOfAddress', maxCount: 1 }
]), submitKyc);
router.get('/status', getKycStatus);

// Admin routes
router.use(isAdmin);
router.get('/pending', getPendingKyc);
router.patch('/review/:userId', reviewKyc);
router.patch('/approve/:userId', approveKyc);

export default router;