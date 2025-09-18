import mongoose from 'mongoose';
import AuctionSession from '../models/AuctionSession.js';
import UserCoin from '../models/UserCoin.js';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';

// Get current auction status and next auction time
const getAuctionStatus = async (req, res, next) => {
  try {
    const currentAuction = await AuctionSession.findOne({ isActive: true });

    if (!currentAuction || !currentAuction.isCurrentlyActive()) {
      const nextAuctionTime = AuctionSession.getNextAuctionTime();
      return next(new AppError({message: 'No active auction at the moment', nextAuctionTime}, 400));
    }

    // Get actual coins in auction
    const coinsInAuction = await UserCoin.find({
      isInAuction: true,
      isApproved: true
    })
    .populate('owner', 'firstName lastName')
    .select('_id category currentPrice plan profitPercentage owner purchaseDate createdAt');

    const nextAuctionTime = AuctionSession.getNextAuctionTime();

    res.status(200).json({
      status: 'success',
      data: {
        currentAuction: {
          ...currentAuction.toObject(),
          coins: coinsInAuction
        },
        nextAuctionTime,
        isActive: currentAuction.isCurrentlyActive()
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get coins available in current auction grouped by category
const getAuctionCoins = async (req, res, next) => {
  try {
    const currentAuction = await AuctionSession.findOne({ isActive: true });
    
    if (!currentAuction || !currentAuction.isCurrentlyActive()) {
      return next(new AppError('No active auction at the moment', 400));
    }

    // Get user coins in auction
    const userCoins = await UserCoin.find({
      isInAuction: true,
      isApproved: true
    })
    .populate('owner', 'firstName lastName')
    .select('_id currentPrice category plan profitPercentage owner status purchaseDate createdAt');

    // Group by category
    const coinsByCategory = {};

    userCoins.forEach(userCoin => {
      const profitInfo = userCoin.getProfitInfo();
      
      if (!coinsByCategory[userCoin.category]) {
        coinsByCategory[userCoin.category] = { coins: [], count: 0, minPrice: Infinity, maxPrice: 0 };
      }
      coinsByCategory[userCoin.category].coins.push({
        _id: userCoin._id,
        price: profitInfo.currentValue,
        plan: userCoin.plan,
        profitPercentage: userCoin.profitPercentage,
        owner: userCoin.owner,
        status: userCoin.status
      });
      coinsByCategory[userCoin.category].count++;
      coinsByCategory[userCoin.category].minPrice = Math.min(coinsByCategory[userCoin.category].minPrice, profitInfo.currentValue);
      coinsByCategory[userCoin.category].maxPrice = Math.max(coinsByCategory[userCoin.category].maxPrice, profitInfo.currentValue);
    });

    res.status(200).json({
      status: 'success',
      data: {
        auctionId: currentAuction._id,
        categories: coinsByCategory,
        totalCoins: userCoins.length
      }
    });
  } catch (error) {
    next(error);
  }
};

// Reserve coin for purchase (step 1)
const reserveCoin = async (req, res, next) => {
  try {
    const { coinId, plan } = req.body;
    const userId = req.user.id;

    // Check if auction is active
    const currentAuction = await AuctionSession.findOne({ isActive: true });
    if (!currentAuction || !currentAuction.isCurrentlyActive()) {
      return next(new AppError('No active auction at the moment', 400));
    }

    // Find the user coin
    const userCoin = await UserCoin.findById(coinId).populate('owner', 'firstName lastName bankDetails phone');
    if (!userCoin || !userCoin.isInAuction || !userCoin.isApproved) {
      return next(new AppError('Coin is not available', 400));
    }
    
    if (userCoin.owner._id.toString() === userId) {
      return next(new AppError('You cannot buy your own coin', 400));
    }

    // Check if user is blocked
    const user = await User.findById(userId);
    if (user.isBlocked) {
      return next(new AppError('Your account is blocked', 403));
    }

    // Check spending limit for current auction session
    const userSpentInAuction = await Transaction.aggregate([
      {
        $match: {
          buyer: new mongoose.Types.ObjectId(userId),
          auctionSession: currentAuction._id,
          status: { $in: ['payment_uploaded', 'confirmed'] }
        }
      },
      {
        $group: {
          _id: null,
          totalSpent: { $sum: '$amount' }
        }
      }
    ]);

    const totalSpent = userSpentInAuction[0]?.totalSpent || 0;
    const spendingLimit = 1500000; // 1.5 million
    
    if (totalSpent + userCoin.currentPrice > spendingLimit) {
      return next(new AppError(`Spending limit exceeded. You can only spend ₦${spendingLimit.toLocaleString()} per auction session. Current spent: ₦${totalSpent.toLocaleString()}`, 400));
    }

    // Check if user already has an active reservation
    const existingReservation = await UserCoin.findOne({
      reservedBy: userId,
      reservationExpires: { $gt: new Date() }
    });
    if (existingReservation) {
      return next(new AppError('You already have an active reservation', 400));
    }

    // Reserve coin
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    userCoin.isInAuction = false;
    userCoin.reservedBy = userId;
    userCoin.reservedAt = new Date();
    userCoin.reservationExpires = expiresAt;
    await userCoin.save();

    // Calculate current value with profit
    const profitInfo = userCoin.getProfitInfo();
    
    res.status(200).json({
      status: 'success',
      message: 'Coin reserved successfully. Complete payment within 15 minutes or face 20 credit score penalty.',
      data: {
        coinId,
        plan,
        amount: profitInfo.currentValue,
        seller: {
          name: `${userCoin.owner.firstName} ${userCoin.owner.lastName}`,
          bankDetails: userCoin.owner.bankDetails,
          phone: userCoin.owner.phone
        },
        expiresAt
      }
    });
  } catch (error) {
    next(error);
  }
};

// Submit bid with payment proof (step 2)
const submitBidWithProof = async (req, res, next) => {
  try {
    const { coinId, plan, paymentMethod } = req.body;
    const userId = req.user.id;

    // Check if file was uploaded
    if (!req.file) {
      return next(new AppError('Please upload payment proof', 400));
    }

    // Find reserved coin
    const userCoin = await UserCoin.findOne({
      _id: coinId,
      reservedBy: userId,
      reservationExpires: { $gt: new Date() }
    });
    
    if (!userCoin) {
      return next(new AppError('Coin reservation not found or expired', 404));
    }

    // Get current auction session
    const currentAuction = await AuctionSession.findOne({ isActive: true });
    
    // Calculate current value with profit
    const profitInfo = userCoin.getProfitInfo();
    console.log('profitInfo', profitInfo);
    
    // Create transaction
    const transaction = await Transaction.create({
      buyer: userId,
      userCoin: coinId,
      seller: userCoin.owner,
      amount: profitInfo.currentValue,
      plan,
      paymentMethod,
      paymentProof: req.file.path,
      status: 'payment_uploaded',
      paymentDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
      auctionSession: currentAuction?._id
    });

    // Clear reservation
    userCoin.reservedBy = undefined;
    userCoin.reservedAt = undefined;
    userCoin.reservationExpires = undefined;
    await userCoin.save();

    res.status(201).json({
      status: 'success',
      message: 'Payment proof submitted successfully. Waiting for seller to release coin.',
      data: {
        transaction
      }
    });
  } catch (error) {
    next(error);
  }
};

// Cancel reservation (returns coin to auction)
const cancelReservation = async (req, res, next) => {
  try {
    const { coinId } = req.params;
    const userId = req.user.id;

    // Find reserved coin
    const userCoin = await UserCoin.findOne({
      _id: coinId,
      reservedBy: userId
    });

    if (!userCoin) {
      return next(new AppError('Reservation not found', 404));
    }

    // Return coin to auction and clear reservation
    userCoin.isInAuction = true;
    userCoin.reservedBy = undefined;
    userCoin.reservedAt = undefined;
    userCoin.reservationExpires = undefined;
    await userCoin.save();

    // Reduce user's credit score for cancellation
    const user = await User.findById(userId);
    await user.reduceCreditScore(5);

    res.status(200).json({
      status: 'success',
      message: 'Reservation cancelled. Coin returned to auction. 5 credit score points deducted.',
      data: {
        newCreditScore: user.creditScore
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get user's active reservations
const getMyReservations = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const reservations = await UserCoin.find({ 
      reservedBy: userId,
      reservationExpires: { $gt: new Date() }
    })
    .select('_id category currentPrice reservedAt reservationExpires')
    .sort('-reservedAt');

    res.status(200).json({
      status: 'success',
      results: reservations.length,
      data: { reservations }
    });
  } catch (error) {
    next(error);
  }
};

// Get user's auction purchase history
const getMyAuctionHistory = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const transactions = await Transaction.find({ buyer: userId })
      .populate('seller', 'firstName lastName')
      .select('amount plan paymentMethod status createdAt completedAt')
      .sort('-createdAt');

    const history = transactions.map(t => ({
      _id: t._id,
      amount: t.amount,
      plan: t.plan,
      paymentMethod: t.paymentMethod,
      status: t.status,
      seller: t.seller ? `${t.seller.firstName} ${t.seller.lastName}` : 'Unknown',
      purchaseDate: t.createdAt,
      completedDate: t.completedAt
    }));

    res.status(200).json({
      status: 'success',
      results: history.length,
      data: { history }
    });
  } catch (error) {
    next(error);
  }
};

// Get user's spending in current auction session
const getMyAuctionSpending = async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    // Get current auction
    const currentAuction = await AuctionSession.findOne({ isActive: true });
    if (!currentAuction) {
      return res.status(200).json({
        status: 'success',
        data: {
          totalSpent: 0,
          spendingLimit: 1500000,
          remainingLimit: 1500000,
          transactionCount: 0
        }
      });
    }

    // Calculate total spending in current auction
    const spendingData = await Transaction.aggregate([
      {
        $match: {
          buyer: new mongoose.Types.ObjectId(userId),
          auctionSession: currentAuction._id,
          status: { $in: ['payment_uploaded', 'confirmed'] }
        }
      },
      {
        $group: {
          _id: null,
          totalSpent: { $sum: '$amount' },
          transactionCount: { $sum: 1 }
        }
      }
    ]);

    const totalSpent = spendingData[0]?.totalSpent || 0;
    const transactionCount = spendingData[0]?.transactionCount || 0;
    const spendingLimit = 1500000;
    const remainingLimit = Math.max(0, spendingLimit - totalSpent);

    res.status(200).json({
      status: 'success',
      data: {
        totalSpent,
        spendingLimit,
        remainingLimit,
        transactionCount,
        isLimitReached: remainingLimit === 0
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get user's active bids
const getMyBids = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const transactions = await Transaction.find({ buyer: userId })
      .populate('userCoin')
      .populate('seller', 'name phone bankDetails')
      .sort('-createdAt');

    res.status(200).json({
      status: 'success',
      results: transactions.length,
      data: {
        transactions
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get all sales transactions for seller
const getMySales = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { status } = req.query;

    const filter = { seller: userId };
    if (status) filter.status = status;

    const transactions = await Transaction.find(filter)
      .populate('buyer', 'firstName lastName email phone')
      .populate('userCoin', 'category plan currentPrice')
      .sort('-createdAt');

    res.status(200).json({
      status: 'success',
      results: transactions.length,
      data: { transactions }
    });
  } catch (error) {
    next(error);
  }
};

// Get pending sales (payment uploaded, waiting for release)
const getPendingSales = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const transactions = await Transaction.find({
      seller: userId,
      status: 'payment_uploaded'
    })
    .populate('buyer', 'firstName lastName email phone')
    .populate('userCoin', 'category plan currentPrice')
    .sort('-createdAt');

    const pendingSales = transactions.map(t => ({
      _id: t._id,
      buyer: {
        name: `${t.buyer.firstName} ${t.buyer.lastName}`,
        email: t.buyer.email,
        phone: t.buyer.phone
      },
      coin: t.userCoin,
      amount: t.amount,
      paymentProof: t.paymentProof,
      paymentDeadline: t.paymentDeadline,
      timeRemaining: Math.max(0, Math.floor((t.paymentDeadline - new Date()) / (1000 * 60))),
      createdAt: t.createdAt
    }));

    res.status(200).json({
      status: 'success',
      results: pendingSales.length,
      data: { pendingSales }
    });
  } catch (error) {
    next(error);
  }
};

// Get sales summary/statistics
const getSalesSummary = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const transactions = await Transaction.find({ seller: userId });

    const summary = {
      totalSales: transactions.length,
      pendingPayment: transactions.filter(t => t.status === 'payment_uploaded').length,
      completed: transactions.filter(t => t.status === 'confirmed').length,
      cancelled: transactions.filter(t => t.status === 'cancelled').length,
      totalRevenue: transactions
        .filter(t => t.status === 'confirmed')
        .reduce((sum, t) => sum + t.amount, 0),
      pendingRevenue: transactions
        .filter(t => t.status === 'payment_uploaded')
        .reduce((sum, t) => sum + t.amount, 0)
    };

    res.status(200).json({
      status: 'success',
      data: { summary }
    });
  } catch (error) {
    next(error);
  }
};

// Get single sale details with payment proof
const getSaleDetails = async (req, res, next) => {
  try {
    const { transactionId } = req.params;
    const userId = req.user.id;

    const transaction = await Transaction.findOne({
      _id: transactionId,
      seller: userId
    })
    .populate('buyer', 'firstName lastName email phone')
    .populate('userCoin', 'category plan currentPrice profitPercentage');

    if (!transaction) {
      return next(new AppError('Transaction not found', 404));
    }

    const saleDetails = {
      ...transaction.toObject(),
      buyer: {
        name: `${transaction.buyer.firstName} ${transaction.buyer.lastName}`,
        email: transaction.buyer.email,
        phone: transaction.buyer.phone
      },
      timeRemaining: transaction.paymentDeadline ? 
        Math.max(0, Math.floor((transaction.paymentDeadline - new Date()) / (1000 * 60))) : null,
      canRelease: transaction.status === 'payment_uploaded'
    };

    res.status(200).json({
      status: 'success',
      data: { sale: saleDetails }
    });
  } catch (error) {
    next(error);
  }
};

export { 
  getAuctionStatus, 
  getAuctionCoins, 
  reserveCoin,
  submitBidWithProof, 
  cancelReservation,
  getMyReservations,
  getMyAuctionHistory,
  getMyAuctionSpending,
  getMyBids,
  getMySales,
  getPendingSales,
  getSalesSummary,
  getSaleDetails
};