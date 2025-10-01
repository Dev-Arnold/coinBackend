import express from 'express';
import { 
  getAllUsers, 
  getUser, 
  deleteUser,
  getAllCoins,
  getCoin,
  getPendingCoins,
  assignCoinToUser, 
  getPendingUserCoins, 
  approveUserCoin, 
  deleteUserCoin,
  autoApprovePendingCoins,
  triggerAutoApprove,
  toggleUserBlock, 
  getStats,
  releaseCoinsForAuction,
  getAuctionStatistics,
  getAllAuctionSessions,
  getAuctionSessionDetails,
  startAuctionManually,
  endAuctionManually,
  resetCoinsFromAuction,
  getActiveTransactions,
  getPendingReferralRequests,
  approveReferralBonus,
  updateDailyProfits,
  getUsersWithReferrals,
  getApprovedCoins
} from '../controllers/adminController.js';
import { protect, isAdmin } from '../middlewares/authMiddleware.js';
import { validateRequest, schemas } from '../middlewares/validateRequest.js';

const router = express.Router();

// All routes are protected and require admin role
router.use(protect, isAdmin);

// User management routes
router.get('/users', getAllUsers);
router.get('/users/:id', getUser);
router.delete('/users/:userId', deleteUser);
router.get('/users-with-referrals', getUsersWithReferrals);
router.patch('/users/:userId/toggle-block', toggleUserBlock);

// Coin type management routes
router.get('/coins', getAllCoins);
router.get('/coins/:coinId', getCoin);
router.get('/pending-coins', getPendingCoins);

// Auction management routes
router.post('/release-coins-auction', releaseCoinsForAuction);
router.get('/auction-stats', getAuctionStatistics);
router.get('/auction-sessions', getAllAuctionSessions);
router.get('/auction-sessions/:auctionId', getAuctionSessionDetails);
router.post('/start-auction', startAuctionManually);
router.post('/end-auction', endAuctionManually);
router.post('/reset-coins', resetCoinsFromAuction);
router.get('/active-transactions', getActiveTransactions);

// User coin management routes
router.post('/:userId/assign-coin', validateRequest(schemas.assignCoin), assignCoinToUser);
router.get('/pending-user-coins', getPendingUserCoins);
router.get('/approved-user-coins', getApprovedCoins);
router.patch('/coins/:userCoinId/approve', approveUserCoin);
router.delete('/coins/:userCoinId', deleteUserCoin);
router.post('/auto-approve-coins', triggerAutoApprove);

// Statistics route
router.get('/stats', getStats);

// Referral bonus routes
router.get('/referral-requests', getPendingReferralRequests);
router.patch('/referral-requests/:userId/:requestId/approve', approveReferralBonus);

// Profit update route
router.post('/update-daily-profits', updateDailyProfits);

export default router;