import User from '../models/User.js';
import Coin from '../models/Coin.js';
import UserCoin from '../models/UserCoin.js';
import Transaction from '../models/Transaction.js';
import AuctionSession from '../models/AuctionSession.js';
import AppError from '../utils/AppError.js';
import { releaseCoinsToAuction, getAuctionStats } from '../services/auctionService.js';
import { updateAllUserProfits } from '../services/profitService.js';

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
    const userCoins = await UserCoin.find({ owner: user._id });
    const transactions = await Transaction.find({ buyer: user._id })
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

// Manually assign coin to user
const assignCoinToUser = async (req, res, next) => {
  try {
    const { currentPrice } = req.body;

    let {userId} = req.params; 
    console.log(userId)

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return next(new AppError('User not found', 404));
    }


    // Create user coin
    const userCoin = await UserCoin.create({
      owner: userId,
      currentPrice,
      isApproved: true,
      isBonusCoin: true,
      status: 'available',
      isLocked: false
    });

    const message = 'Bonus coin assigned and ready for auction';

    res.status(201).json({
      status: 'success',
      message,
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
    const coins = await UserCoin.find().sort('-createdAt');

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

// Get single coin by ID
const getCoin = async (req, res, next) => {
  try {
    const coin = await UserCoin.findById(req.params.coinId)
      .populate('owner', 'firstName lastName email')
      .populate('seller', 'firstName lastName email')
      .populate('boughtFrom', 'firstName lastName email');

    if (!coin) {
      return next(new AppError('Coin not found', 404));
    }

    // Get profit info
    const profitInfo = coin.getProfitInfo();

    res.status(200).json({
      status: 'success',
      data: {
        coin: {
          ...coin.toObject(),
          ...profitInfo
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get pending coins for approval
const getPendingCoins = async (req, res, next) => {
  try {
    const pendingCoins = await UserCoin.find({ isApproved: false })
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

const getApprovedCoins = async (req, res, next) => {
  try {
    const approvedCoins = await UserCoin.find({ isApproved: true })
      .populate('owner', 'firstName lastName')
      .sort('-createdAt');

    const coinsWithCalculatedValue = approvedCoins.map(coin => {
      const profitInfo = coin.getProfitInfo();
      return {
        ...coin.toObject(),
        calculatedValue: profitInfo.currentValue
      };
    });

    res.status(200).json({
      status: 'success',
      results: approvedCoins.length,
      data: {
        coins: coinsWithCalculatedValue
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
    const { durationMinutes = 60 } = req.body;
    
    // Check if there's already an active auction
    const activeAuction = await AuctionSession.findOne({ isActive: true });
    console.log(activeAuction);
    if (activeAuction) {
      return next(new AppError('Auction is already running.', 400));
    }

    // Release coins to auction
    const releaseResult = await releaseCoinsToAuction();
    console.log(releaseResult);
    
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

    // Set timeout to automatically end auction
    setTimeout(async () => {
      try {
        const auctionToEnd = await AuctionSession.findById(auction._id);
        if (auctionToEnd && auctionToEnd.isActive) {
          auctionToEnd.isActive = false;
          auctionToEnd.endTime = new Date();
          await auctionToEnd.save();
          
          await UserCoin.updateMany(
            { isInAuction: true },
            { isInAuction: false, auctionStartDate: null }
          );
          
          console.log(`Manual auction ${auction._id} ended automatically after ${durationMinutes} minutes`);
        }
      } catch (error) {
        console.error('Error auto-ending manual auction:', error);
      }
    }, durationMinutes * 60 * 1000);

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
      return next(new AppError('No active auction', 404));
    }

    activeAuction.isActive = false;
    activeAuction.endTime = new Date(); // Set actual end time
    // activeAuction.coins = []; // Clear coins array
    await activeAuction.save();

    // Reset coins from auction
    await UserCoin.updateMany(
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
    const result = await UserCoin.updateMany(
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

// Get active transactions for admin dashboard
const getActiveTransactions = async (req, res, next) => {
  try {
    const transactions = await Transaction.find({
      status: { $in: ['pending_payment', 'payment_uploaded'] }
    })
    .populate('buyer', 'firstName lastName')
    .sort('-createdAt');

    const formattedTransactions = transactions.map(t => ({
      id: t._id,
      buyer: `${t.buyer.firstName} ${t.buyer.lastName}`,
      coin: t.userCoin ? `UC${t.userCoin.toString().slice(-3)}` : `C${t.coin.toString().slice(-3)}`,
      amount: t.amount,
      status: t.status === 'pending_payment' ? 'Pending Payment' : 'Payment Uploaded',
      deadline: t.status === 'pending_payment' ? getTimeRemaining(t.paymentDeadline) : '-'
    }));

    res.status(200).json({
      status: 'success',
      data: { transactions: formattedTransactions }
    });
  } catch (error) {
    next(error);
  }
};

// Get last 10 auction sessions
const getAllAuctionSessions = async (req, res, next) => {
  try {
    const auctionSessions = await AuctionSession.find()
      .sort('-createdAt')
      .limit(10);

    res.status(200).json({
      status: 'success',
      results: auctionSessions.length,
      data: {
        auctionSessions
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get details of a specific auction session
const getAuctionSessionDetails = async (req, res, next) => {
  try {
    const { auctionId } = req.params;

    const auctionSession = await AuctionSession.findById(auctionId);
    if (!auctionSession) {
      return next(new AppError('Auction session not found', 404));
    }

    // Get transactions from this auction session with populated data
    const transactions = await Transaction.find({ auctionSession: auctionId })
      .populate('buyer', 'firstName lastName email')
      .populate('seller', 'firstName lastName email')
      .populate('userCoin', 'category currentPrice plan')
      .sort('-createdAt');

    // Get unique participants (buyers and sellers)
    const participantIds = new Set();
    transactions.forEach(t => {
      if (t.buyer) participantIds.add(t.buyer._id.toString());
      if (t.seller) participantIds.add(t.seller._id.toString());
    });

    const participants = await User.find({ 
      _id: { $in: Array.from(participantIds) } 
    }).select('firstName lastName email');

    res.status(200).json({
      status: 'success',
      data: {
        auctionSession,
        transactions,
        participants,
        totalTransactions: transactions.length,
        totalParticipants: participants.length
      }
    });
  } catch (error) {
    next(error);
  }
};

// Helper function to get time remaining
const getTimeRemaining = (deadline) => {
  const now = new Date();
  const timeLeft = deadline - now;
  if (timeLeft <= 0) return 'Expired';
  
  const minutes = Math.floor(timeLeft / (1000 * 60));
  return `${minutes} mins left`;
};

// Get all user coins pending approval
const getPendingUserCoins = async (req, res, next) => {
  try {
    const pendingUserCoins = await UserCoin.find({ status: 'pending_approval' })
      .populate('owner', 'firstName lastName')
      .sort('-createdAt');

    // Calculate current values for each user coin
    const coinsWithValues = pendingUserCoins.map((userCoin) => {
      const profitInfo = userCoin.getProfitInfo();
      
      return {
        ...userCoin.toObject(),
        ...profitInfo
      };
    });

    res.status(200).json({
      status: 'success',
      results: coinsWithValues.length,
      data: {
        userCoins: coinsWithValues
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
    userCoin.isLocked = false;
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

// Delete user
const deleteUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.userId);
    
    if (!user) {
      return next(new AppError('User not found', 404));
    }

    await User.findByIdAndDelete(req.params.userId);

    res.status(200).json({
      status: 'success',
      message: 'User deleted successfully'
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
    const totalUserCoins = await UserCoin.countDocuments();
    const totalTransactions = await Transaction.countDocuments();
    const activeAuctions = await UserCoin.countDocuments({ isInAuction: true });
    
    const recentTransactions = await Transaction.find()
      .populate('buyer', 'name email')
      .sort('-createdAt')
      .limit(10);

    res.status(200).json({
      status: 'success',
      data: {
        stats: {
          totalUsers,
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

// Get pending referral bonus requests
const getPendingReferralRequests = async (req, res, next) => {
  try {
    const users = await User.find({
      'referralBonusRequests.status': 'pending'
    }).select('firstName lastName email referralBonusRequests');

    const pendingRequests = [];
    users.forEach(user => {
      user.referralBonusRequests.forEach(request => {
        if (request.status === 'pending') {
          pendingRequests.push({
            _id: request._id,
            user: {
              _id: user._id,
              name: `${user.firstName} ${user.lastName}`,
              email: user.email
            },
            amount: request.amount,
            requestedAt: request.requestedAt
          });
        }
      });
    });

    res.status(200).json({
      status: 'success',
      results: pendingRequests.length,
      data: {
        requests: pendingRequests
      }
    });
  } catch (error) {
    next(error);
  }
};

// Approve referral bonus request and create bonus coin
const approveReferralBonus = async (req, res, next) => {
  try {
    const { userId, requestId } = req.params;
    const adminId = req.user.id;

    const user = await User.findById(userId);
    if (!user) {
      return next(new AppError('User not found', 404));
    }

    const request = user.referralBonusRequests.id(requestId);
    if (!request || request.status !== 'pending') {
      return next(new AppError('Request not found or already processed', 404));
    }

    // Determine category based on request amount
    let category;
    if (request.amount >= 10000 && request.amount <= 100000) {
      category = 'Category A';
    } else if (request.amount > 100000 && request.amount <= 250000) {
      category = 'Category B';
    } else if (request.amount > 250000 && request.amount <= 500000) {
      category = 'Category C';
    } else if (request.amount > 500000 && request.amount <= 1000000) {
      category = 'Category D';
    } else {
      category = 'Category A'; // Default fallback
    }

    // Create bonus coin with referral earnings as price
    const bonusCoin = await UserCoin.create({
      category,
      plan: '5days',
      profitPercentage: 35,
      owner: userId,
      currentPrice: request.amount,
      isApproved: true,
      isBonusCoin: true,
      status: 'available',
      isLocked: false
    });

    // Update request status
    request.status = 'approved';
    request.processedAt = new Date();
    request.processedBy = adminId;

    // Reset referral earnings
    user.referralEarnings = 0;
    await user.save();

    res.status(200).json({
      status: 'success',
      message: 'Referral bonus approved and bonus coin created',
      data: {
        bonusCoin,
        request
      }
    });
  } catch (error) {
    next(error);
  }
};

// Reject referral bonus request
const rejectReferralBonus = async (req, res, next) => {
  try {
    const { userId, requestId } = req.params;
    const adminId = req.user.id;

    const user = await User.findById(userId);
    if (!user) {
      return next(new AppError('User not found', 404));
    }

    const request = user.referralBonusRequests.id(requestId);
    if (!request || request.status !== 'pending') {
      return next(new AppError('Request not found or already processed', 404));
    }

    // Update request status to rejected
    request.status = 'rejected';
    request.processedAt = new Date();
    request.processedBy = adminId;
    await user.save();

    res.status(200).json({
      status: 'success',
      message: 'Referral bonus request rejected',
      data: {
        request
      }
    });
  } catch (error) {
    next(error);
  }
};

// Delete all referral bonus requests
const deleteAllReferralRequests = async (req, res, next) => {
  try {
    const result = await User.updateMany(
      { 'referralBonusRequests.0': { $exists: true } },
      { $set: { referralBonusRequests: [] } }
    );

    res.status(200).json({
      status: 'success',
      message: `All referral requests deleted from ${result.modifiedCount} users`,
      data: {
        usersModified: result.modifiedCount
      }
    });
  } catch (error) {
    next(error);
  }
};

// Manually update daily profits for all users
const updateDailyProfits = async (req, res, next) => {
  try {
    const result = await updateAllUserProfits();
    
    res.status(200).json({
      status: 'success',
      message: `Daily profits updated for ${result.usersUpdated} users`,
      data: {
        usersUpdated: result.usersUpdated,
        totalProfitAdded: result.totalProfitAdded
      }
    });
  } catch (error) {
    next(error);
  }
};

// Auto-approve pending coins 5 minutes before next auction
const autoApprovePendingCoins = async () => {
  try {
    const nextAuctionTime = AuctionSession.getNextAuctionTime();
    const fiveMinutesBefore = new Date(nextAuctionTime.getTime() - 5 * 60 * 1000);
    const now = new Date();
    
    // Check if we're within 5 minutes of next auction
    if (now >= fiveMinutesBefore && now < nextAuctionTime) {
      const pendingCoins = await UserCoin.find({ status: 'pending_approval' });
      
      for (const coin of pendingCoins) {
        const currentValue = coin.calculateCurrentValue();
        
        // Auto-approve if current value is 2,000,000 or less
        if (currentValue <= 2000000) {
          coin.isApproved = true;
          coin.isLocked = false;
          coin.status = 'available';
          await coin.save();
        }
      }
      
      return { success: true, message: 'Pending coins auto-approved' };
    }
    
    return { success: false, message: 'Not within auto-approval window' };
  } catch (error) {
    console.error('Auto-approve error:', error);
    return { success: false, error: error.message };
  }
};

// Manual trigger for auto-approve (for testing)
const triggerAutoApprove = async (req, res, next) => {
  try {
    const result = await autoApprovePendingCoins();
    
    res.status(200).json({
      status: 'success',
      message: result.message,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

// Delete user coin
const deleteUserCoin = async (req, res, next) => {
  try {
    const userCoin = await UserCoin.findById(req.params.userCoinId);
    
    if (!userCoin) {
      return next(new AppError('User coin not found', 404));
    }

    await UserCoin.findByIdAndDelete(req.params.userCoinId);

    res.status(200).json({
      status: 'success',
      message: 'User coin deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// Get users who have referred others
const getUsersWithReferrals = async (req, res, next) => {
  try {
    const usersWithReferrals = await User.aggregate([
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: 'referredBy',
          as: 'referrals'
        }
      },
      {
        $match: {
          'referrals.0': { $exists: true }
        }
      },
      {
        $project: {
          firstName: 1,
          lastName: 1,
          email: 1,
          referralCode: 1,
          referralEarnings: 1,
          totalReferrals: { $size: '$referrals' },
          referrals: {
            $map: {
              input: '$referrals',
              as: 'referral',
              in: {
                _id: '$$referral._id',
                firstName: '$$referral.firstName',
                lastName: '$$referral.lastName',
                email: '$$referral.email',
                createdAt: '$$referral.createdAt'
              }
            }
          }
        }
      },
      {
        $sort: { totalReferrals: -1 }
      }
    ]);

    res.status(200).json({
      status: 'success',
      results: usersWithReferrals.length,
      data: {
        users: usersWithReferrals
      }
    });
  } catch (error) {
    next(error);
  }
};

// Assign auction-ready coin to user
const assignAuctionReadyCoin = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { currentPrice, plan, purchaseDate } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return next(new AppError('User not found', 404));
    }

    const planDays = parseInt(plan.replace('days', ''));
    const maturedPurchaseDate = purchaseDate ? 
      new Date(purchaseDate) : 
      new Date(Date.now() - planDays * 24 * 60 * 60 * 1000);

    const userCoin = await UserCoin.create({
      owner: userId,
      currentPrice,
      plan,
      purchaseDate: maturedPurchaseDate,
      isApproved: false,
      status: 'matured',
      isLocked: false
    });

    const profitInfo = userCoin.getProfitInfo();

    res.status(201).json({
      status: 'success',
      message: 'Matured auction-ready coin assigned successfully',
      data: {
        userCoin: {
          ...userCoin.toObject(),
          ...profitInfo
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

export { 
  getAllUsers, 
  getUser, 
  deleteUser,
  getAllCoins,
  getCoin,
  getPendingCoins,
  assignCoinToUser,
  assignAuctionReadyCoin,
  getPendingUserCoins, 
  getApprovedCoins,
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
  rejectReferralBonus,
  deleteAllReferralRequests,
  updateDailyProfits,
  getUsersWithReferrals
};