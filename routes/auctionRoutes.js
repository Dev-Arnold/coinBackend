import express from 'express';
import { 
  getAuctionStatus, 
  getAuctionCoins, 
  reserveCoin,
  submitBidWithProof,
  cancelReservation, 
  getMyBids 
} from '../controllers/auctionController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { validateRequest, schemas } from '../middlewares/validateRequest.js';
import { paymentUpload } from '../cloudinaryConfig.js';

const router = express.Router();

// Public routes
router.get('/status', getAuctionStatus);

// Protected routes
router.use(protect);

router.get('/coins', getAuctionCoins);
router.post('/reserve-coin', validateRequest(schemas.reserveCoin), reserveCoin);
router.post('/submit-bid', paymentUpload.single('paymentProof'), submitBidWithProof);
router.patch('/cancel-reservation/:reservationId', cancelReservation);
router.get('/my-bids', getMyBids);

export default router;