import express from 'express';
import { 
  getAuctionStatus, 
  getAuctionCoins, 
  reserveCoin,
  submitBidWithProof,
  cancelReservation,
  getMyReservations,
  getMyAuctionHistory,
  getMyBids,
  getMySales,
  getPendingSales,
  getSalesSummary,
  getSaleDetails
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
router.post('/submit-bid', paymentUpload.single('paymentProof'), validateRequest(schemas.submitBidWithProof), submitBidWithProof);
router.patch('/cancel-reservation/:coinId', cancelReservation);
router.get('/my-reservations', getMyReservations);
router.get('/my-auction-history', getMyAuctionHistory);
router.get('/my-bids', getMyBids);
router.get('/my-sales', getMySales);
router.get('/pending-sales', getPendingSales);
router.get('/sales-summary', getSalesSummary);
router.get('/sales/:transactionId', getSaleDetails);

export default router;