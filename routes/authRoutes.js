import express from 'express';
import { signup, login, logout, getMe, updateMe, requestReferralBonus, getReferralStatus, getDashboard } from '../controllers/authController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { validateRequest, schemas } from '../middlewares/validateRequest.js';

const router = express.Router();

// Public routes
router.post('/', validateRequest(schemas.signup), signup);
router.post('/login', validateRequest(schemas.login), login);
router.post('/logout', logout);

// Protected routes
router.use(protect); // All routes after this middleware are protected

router.get('/me', getMe);
router.patch('/updateMe', validateRequest(schemas.updateProfile), updateMe);
router.get('/referral-status', getReferralStatus);
router.post('/request-referral-bonus', requestReferralBonus);
router.get('/dashboard', getDashboard);

export default router;