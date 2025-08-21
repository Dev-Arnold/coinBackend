import express from 'express';
import { register, login, logout, getMe, updateMe } from '../controllers/authController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { validateRequest, schemas } from '../middlewares/validateRequest.js';

const router = express.Router();

// Public routes
router.post('/', validateRequest(schemas.register), register);
router.post('/login', validateRequest(schemas.login), login);
router.post('/logout', logout);

// Protected routes
router.use(protect); // All routes after this middleware are protected

router.get('/me', getMe);
router.patch('/updateMe', validateRequest(schemas.updateProfile), updateMe);

export default router;