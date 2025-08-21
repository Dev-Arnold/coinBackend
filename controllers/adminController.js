import User from '../models/User.js';
import Coin from '../models/Coin.js';
import UserCoin from '../models/UserCoin.js';
import Transaction from '../models/Transaction.js';
import AuctionSession from '../models/AuctionSession.js';
import AppError from '../utils/AppError.js';
import { releaseCoinsToAuction, getAuctionStats } from '../services/auctionService.js';

// Get all users for admin management
const getAllUsers = async (req, res, next) => {
  try {
    const users = await User.find({ role: 'user' })
      .select('-password')
      .sort('-createdAt');

    res.status(200).json({
      status: 'success',
      results: users.length,
      data: {
        users
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get single user details
const getUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id)
      .populate('referredBy', 'name email')
      .select('-password');

    if (!user) {
      return next(new AppError('No user found with that ID', 404));
    }

    // Get user's coins and transactions
    const userCoins = await UserCoin.find({ owner: user._id })
      .populate('coin', 'name category plan basePrice profitPercentage');
    const transactions = await Transaction.find({ buyer: user._id })
      .populate('coin', 'name basePrice')
      .sort('-createdAt');

    res.status(200).json({
      status: 'success',
      data: {
        user,
        userCoins,
        transactions
      }
    });
  } catch (error) {
    next(error);
  }
};

// Create new coin type (admin only)
const createCoin = async (req, res, next) => {
  try {
    const { plan, basePrice } = req.body;

    // Create new coin type
    const coin = await Coin.create({
      plan,
      basePrice
    });

    res.status(201).json({
      status: 'success',
      message: 'Coin type created successfully',
      data: {
        coin
      }
    });
  } catch (error) {
    next(error);
  }
};

// Manually assign coin to user
const assignCoinToUser = async (req, res, next) => {
  try {
    const { userId, coinId, currentPrice } = req.body;

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return next(new AppError('User not found', 404));
    }

    // Check if coin type exists
    const coin = await Coin.findById(coinId);
    if (!coin) {
      return next(new AppError('Coin type not found', 404));
    }

    // Create user coin
    const userCoin = await UserCoin.create({
      coin: coinId,
      owner: userId,
      currentPrice: currentPrice || coin.basePrice,
      isApproved: true,
      status: 'locked'
    });

    res.status(201).json({
      status: 'success',
      message: 'Coin assigned to user successfully',
      data: {
        userCoin
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get all coins (admin-defined coin types)
const getAllCoins = async (req, res, next) => {
  try {
    const coins = await Coin.find().sort('-createdAt');

    res.status(200).json({
      status: 'success',
      results: coins.length,
      data: {
        coins
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get pending coins for approval
const getPendingCoins = async (req, res, next) => {
  try {
    const pendingCoins = await Coin.find({ isApproved: false })
      .sort('-createdAt');

    res.status(200).json({
      status: 'success',
      results: pendingCoins.length,
      data: {
        coins: pendingCoins
      }
    });
  } catch (error) {
    next(error);
  }
};

// Approve coin
const approveCoin = async (req, res, next) => {
  try {
    const coin = await Coin.findById(req.params.coinId);
    
    if (!coin) {
      return next(new AppError('Coin not found', 404));
    }

    coin.isApproved = true;
    await coin.save();

    res.status(200).json({
      status: 'success',
      message: 'Coin approved successfully',
      data: {
        coin
      }
    });
  } catch (error) {
    next(error);
  }
};

// Release coins to auction
const releaseCoinsForAuction = async (req, res, next) => {
  try {
    const result = await releaseCoinsToAuction();

    if (!result.success) {
      return next(new AppError(result.message, 400));
    }

    // If there's an active auction, add coins to it
    const activeAuction = await AuctionSession.findOne({ isActive: true });
    if (activeAuction && result.coinIds.length > 0) {
      activeAuction.coins.push(...result.coinIds);
      await activeAuction.save();
    }

    res.status(200).json({
      status: 'success',
      message: result.message,
      data: {
        releasedCoins: result.results,
        totalCoinsReleased: result.coinIds.length
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get auction statistics
const getAuctionStatistics = async (req, res, next) => {
  try {
    const stats = await getAuctionStats();

    res.status(200).json({
      status: 'success',
      data: {
        auctionStats: stats
      }
    });
  } catch (error) {
    next(error);
  }
};

// Manually start auction for testing
const startAuctionManually = async (req, res, next) => {
  try {
    const { durationMinutes = 30 } = req.body;
    
    // Check if there's already an active auction
    const activeAuction = await AuctionSession.findOne({ isActive: true });
    if (activeAuction) {
      return next(new AppError('An auction is already active', 400));
    }

    // Release coins to auction
    const releaseResult = await releaseCoinsToAuction();
    
    if (!releaseResult.success) {
      return next(new AppError(releaseResult.message, 400));
    }

    // Create auction session with coins
    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);
    
    const auction = await AuctionSession.create({
      startTime,
      endTime,
      isActive: true,
      coins: releaseResult.coinIds
    });

    const totalReleased = Object.values(releaseResult.results).reduce((sum, count) => sum + count, 0);

    res.status(201).json({
      status: 'success',
      message: `Auction started successfully with ${totalReleased} coins`,
      data: {
        auction: {
          id: auction._id,
          startTime: auction.startTime,
          endTime: auction.endTime,
          isActive: auction.isActive,
          durationMinutes,
          totalCoins: releaseResult.coinIds.length
        },
        releasedCoins: releaseResult.results,
        totalCoinsInAuction: totalReleased
      }
    });
  } catch (error) {
    next(error);
  }
};

// Manually end auction for testing
const endAuctionManually = async (req, res, next) => {
  try {
    const activeAuction = await AuctionSession.findOne({ isActive: true });
    
    if (!activeAuction) {
      return next(new AppError('No active auction found', 404));
    }

    activeAuction.isActive = false;
    activeAuction.endTime = new Date(); // Set actual end time
    activeAuction.coins = []; // Clear coins array
    await activeAuction.save();

    // Reset coins from auction
    await Coin.updateMany(
      { isInAuction: true },
      { isInAuction: false, auctionStartDate: null }
    );

    res.status(200).json({
      status: 'success',
      message: 'Auction ended successfully and coins reset',
      data: {
        auction: {
          id: activeAuction._id,
          startTime: activeAuction.startTime,
          endTime: activeAuction.endTime,
          isActive: activeAuction.isActive
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// Reset all coins from auction (for testing)
const resetCoinsFromAuction = async (req, res, next) => {
  try {
    const result = await Coin.updateMany(
      { isInAuction: true },
      { isInAuction: false, auctionStartDate: null }
    );

    res.status(200).json({
      status: 'success',
      message: `Reset ${result.modifiedCount} coins from auction`,
      data: {
        coinsReset: result.modifiedCount
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get all user coins pending approval
const getPendingUserCoins = async (req, res, next) => {
  try {
    const pendingUserCoins = await UserCoin.find({ isApproved: false })
      .populate('owner', 'name email')
      .populate('coin', 'name category plan')
      .sort('-createdAt');

    res.status(200).json({
      status: 'success',
      results: pendingUserCoins.length,
      data: {
        userCoins: pendingUserCoins
      }
    });
  } catch (error) {
    next(error);
  }
};

// Approve user coin
const approveUserCoin = async (req, res, next) => {
  try {
    const userCoin = await UserCoin.findById(req.params.userCoinId);
    
    if (!userCoin) {
      return next(new AppError('User coin not found', 404));
    }

    userCoin.isApproved = true;
    userCoin.status = 'available';
    await userCoin.save();

    res.status(200).json({
      status: 'success',
      message: 'User coin approved successfully',
      data: {
        userCoin
      }
    });
  } catch (error) {
    next(error);
  }
};

// Block/unblock user
const toggleUserBlock = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.userId);
    
    if (!user) {
      return next(new AppError('User not found', 404));
    }

    user.isBlocked = !user.isBlocked;
    await user.save();

    res.status(200).json({
      status: 'success',
      message: `User ${user.isBlocked ? 'blocked' : 'unblocked'} successfully`,
      data: {
        user
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get platform statistics
const getStats = async (req, res, next) => {
  try {
    const totalUsers = await User.countDocuments({ role: 'user' });
    const totalCoinTypes = await Coin.countDocuments();
    const totalUserCoins = await UserCoin.countDocuments();
    const totalTransactions = await Transaction.countDocuments();
    const activeAuctions = await UserCoin.countDocuments({ isInAuction: true });
    
    const recentTransactions = await Transaction.find()
      .populate('buyer', 'name email')
      .populate('coin', 'name basePrice')
      .sort('-createdAt')
      .limit(10);

    res.status(200).json({
      status: 'success',
      data: {
        stats: {
          totalUsers,
          totalCoinTypes,
          totalUserCoins,
          totalTransactions,
          activeAuctions
        },
        recentTransactions
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get users with KYC information
const getUsersWithKyc = async (req, res, next) => {
  try {
    const users = await User.find({ role: 'user' })
      .select('-password +kycStatus +kycDocuments')
      .sort('-createdAt');

    res.status(200).json({
      status: 'success',
      results: users.length,
      data: {
        users
      }
    });
  } catch (error) {
    next(error);
  }
};

export { 
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
};