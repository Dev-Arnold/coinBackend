import express from 'express';
import { 
  getMyCoins,
  getAvailableCoins,
  getUserCoin, 
  uploadPaymentProof, 
  makeRecommitmentBid, 
  submitUserCoinForApproval,
  listUserCoinForAuction 
} from '../controllers/coinController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { paymentUpload } from '../cloudinaryConfig.js';

const router = express.Router();

// Public routes
router.get('/available', getAvailableCoins);

// Protected routes
router.use(protect);

router.get('/my-coins', getMyCoins);
router.get('/user-coin/:id', getUserCoin);
router.post('/payment-proof/:transactionId', paymentUpload.single('paymentProof'), uploadPaymentProof);
router.post('/user-coin/:userCoinId/recommit', makeRecommitmentBid);
router.post('/user-coin/:userCoinId/submit-for-approval', submitUserCoinForApproval);
router.post('/user-coin/:userCoinId/list-auction', listUserCoinForAuction);

export default router;