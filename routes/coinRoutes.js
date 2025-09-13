import express from 'express';
import { 
  getMyCoins,
  getAvailableCoins,
  getUserCoin, 
  uploadPaymentProof, 
  submitUserCoinForApproval,
  getSellerBankDetails,
  releaseCoinToBuyer,
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
router.get('/seller-bank-details/:coinId', getSellerBankDetails);
// router.post('/payment-proof', paymentUpload.single('paymentProof'), uploadPaymentProof);
router.post('/release-coin/:transactionId', releaseCoinToBuyer);
router.post('/user-coin/:userCoinId/submit-for-approval', submitUserCoinForApproval);
router.post('/user-coin/:userCoinId/list-auction', listUserCoinForAuction);

export default router;