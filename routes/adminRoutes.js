import express from 'express';
import { 
  getAllUsers, 
  getUser, 
  getAllCoins,
  getPendingCoins,
  assignCoinToUser, 
  getPendingUserCoins, 
  approveUserCoin, 
  toggleUserBlock, 
  getStats,
  releaseCoinsForAuction,
  getAuctionStatistics,
  startAuctionManually,
  endAuctionManually,
  resetCoinsFromAuction,
  getPendingReferralRequests,
  approveReferralBonus
} from '../controllers/adminController.js';
import { protect, isAdmin } from '../middlewares/authMiddleware.js';
import { validateRequest, schemas } from '../middlewares/validateRequest.js';

const router = express.Router();

// All routes are protected and require admin role
router.use(protect, isAdmin);

// User management routes
router.get('/users', getAllUsers);
router.get('/users/:id', getUser);
router.patch('/users/:userId/toggle-block', toggleUserBlock);

// Coin type management routes
router.get('/coins', getAllCoins);
router.get('/pending-coins', getPendingCoins);

// Auction management routes
router.post('/release-coins-auction', releaseCoinsForAuction);
router.get('/auction-stats', getAuctionStatistics);
router.post('/start-auction', startAuctionManually);
router.post('/end-auction', endAuctionManually);
router.post('/reset-coins', resetCoinsFromAuction);

// User coin management routes
router.post('/:userId/assign-coin', validateRequest(schemas.assignCoin), assignCoinToUser);
router.get('/pending-user-coins', getPendingUserCoins);
router.patch('/coins/:userCoinId/approve', approveUserCoin);

// Statistics route
router.get('/stats', getStats);

// Referral bonus routes
router.get('/referral-requests', getPendingReferralRequests);
router.patch('/referral-requests/:userId/:requestId/approve', approveReferralBonus);

export default router;