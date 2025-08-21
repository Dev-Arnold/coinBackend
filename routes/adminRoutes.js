import express from 'express';
import { 
  getAllUsers, 
  getUser, 
  createCoin,
  getAllCoins,
  getPendingCoins,
  approveCoin,
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
  getUsersWithKyc
} from '../controllers/adminController.js';
import { protect, isAdmin } from '../middlewares/authMiddleware.js';

const router = express.Router();

// All routes are protected and require admin role
router.use(protect, isAdmin);

// User management routes
router.get('/users', getAllUsers);
router.get('/users-kyc', getUsersWithKyc);
router.get('/users/:id', getUser);
router.patch('/users/:userId/toggle-block', toggleUserBlock);

// Coin type management routes
router.post('/create', createCoin);
router.get('/coins', getAllCoins);
router.get('/pending-coins', getPendingCoins);
router.patch('/coins/:coinId/approve', approveCoin);

// Auction management routes
router.post('/release-coins-auction', releaseCoinsForAuction);
router.get('/auction-stats', getAuctionStatistics);
router.post('/start-auction', startAuctionManually);
router.post('/end-auction', endAuctionManually);
router.post('/reset-coins', resetCoinsFromAuction);

// User coin management routes
router.post('/assign-coin', assignCoinToUser);
router.get('/pending-user-coins', getPendingUserCoins);
router.patch('/user-coins/:userCoinId/approve', approveUserCoin);

// Statistics route
router.get('/stats', getStats);

export default router;