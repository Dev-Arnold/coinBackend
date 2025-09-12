import express from "express";
import { 
  sendMessage, 
  getMyMessages,
  getUserMessages, 
  getAllMessages, 
  replyMessage,
  getMessageStats
} from "../controllers/messageController.js";
import { protect, restrictTo } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(protect);

// User routes
router.post("/", sendMessage);
router.get("/my-messages", getMyMessages);

// Admin routes
router.use(restrictTo('admin'));
router.get("/", getAllMessages);
router.get("/stats", getMessageStats);
router.get("/user/:userId", getUserMessages);
router.post("/reply/:id", replyMessage);

export default router;
