import express from 'express';
import { 
  getAuctionStatus, 
  getAuctionCoins, 
  placeBid, 
  cancelBid, 
  getMyBids 
} from '../controllers/auctionController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { validateRequest, schemas } from '../middlewares/validateRequest.js';

const router = express.Router();

// Public routes
router.get('/status', getAuctionStatus);

// Protected routes
router.use(protect);

router.get('/coins', getAuctionCoins);
router.post('/bid', placeBid);
router.patch('/bid/:transactionId/cancel', cancelBid);
router.get('/my-bids', getMyBids);

export default router;