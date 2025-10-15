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

// Debug route to compare database vs calculated values
const getAuctionCoinsDebug = async (req, res, next) => {
  try {
    const userCoins = await UserCoin.find({
      isInAuction: true,
      isApproved: true
    })
    .populate('owner', 'firstName lastName')
    .select('_id currentPrice category plan profitPercentage owner status purchaseDate createdAt isBonusCoin');

    const debugCoins = userCoins.map(userCoin => {
      const profitInfo = userCoin.getProfitInfo();
      return {
        _id: userCoin._id,
        databasePrice: userCoin.currentPrice,
        calculatedValue: profitInfo.currentValue,
        difference: profitInfo.currentValue - userCoin.currentPrice,
        category: userCoin.category,
        plan: userCoin.plan,
        profitPercentage: userCoin.profitPercentage,
        isBonusCoin: userCoin.isBonusCoin,
        purchaseDate: userCoin.purchaseDate,
        owner: userCoin.owner
      };
    });

    res.status(200).json({
      status: 'success',
      data: { debugCoins }
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

    // Check if user can reserve this coin based on last purchase amount
    const lastTransaction = await Transaction.findOne({
      buyer: userId,
      status: 'confirmed'
    }).sort({ createdAt: -1 });

    if (lastTransaction) {
      const profitInfo = userCoin.getProfitInfo();
      if (profitInfo.currentValue < lastTransaction.amount) {
        return next(new AppError(`You can only reserve coins with amount ₦${lastTransaction.amount.toLocaleString()} or higher. This coin is ₦${profitInfo.currentValue.toLocaleString()}`, 400));
      }
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
    // const existingReservation = await UserCoin.findOne({
    //   reservedBy: userId,
    //   reservationExpires: { $gt: new Date() }
    // });
    // if (existingReservation) {
    //   return next(new AppError('You already have an active reservation', 400));
    // }

    // Calculate current value with profit using original plan
    const profitInfo = userCoin.getProfitInfo();

    // Reserve coin
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    userCoin.isInAuction = false;
    userCoin.reservedBy = userId;
    userCoin.reservedAt = new Date();
    userCoin.reservationExpires = expiresAt;
    userCoin.previousPlan = userCoin.plan; // Store original plan
    userCoin.plan = plan; // Change to selected plan
    await userCoin.save();
    
    res.status(200).json({
      status: 'success',
      message: 'Coin reserved successfully. Complete payment within 1 hour or face 2% credit score penalty.',
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
      releaseDeadline: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes for seller to release
      auctionSession: currentAuction?._id
    });
    
    // Log activity
    const { logActivity } = await import('../controllers/activityController.js');
    const buyer = await User.findById(userId).select('firstName lastName');
    await logActivity('coin_bought', `${buyer.firstName} ${buyer.lastName} uploaded payment proof for ₦${transaction.amount.toLocaleString()}`, userId, transaction.amount, userCoin._id);

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
    if (userCoin.previousPlan) {
      userCoin.plan = userCoin.previousPlan; // Restore original plan
      userCoin.previousPlan = undefined; // Clear previousPlan
    }
    await userCoin.save();

    // Reduce user's credit score by 5% for cancellation
    const user = await User.findById(userId);
    const currentScore = user.creditScore || 100;
    user.creditScore = Math.max(0, currentScore - (currentScore * 0.02));
    await user.save();

    res.status(200).json({
      status: 'success',
      message: 'Reservation cancelled. Coin returned to auction. 5% credit score penalty applied.',
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
    .populate('owner', 'firstName lastName phone bankDetails')
    .select('_id category currentPrice plan profitPercentage owner reservedAt reservationExpires purchaseDate createdAt previousPlan')
    .sort('-reservedAt');

    const reservationsWithCalculatedValue = reservations.map(reservation => {
      // Create a copy to avoid modifying the original
      const reservationCopy = { ...reservation.toObject() };
      
      // Use original plan for calculation if it exists
      if (reservation.previousPlan) {
        // Keep the selected plan for display, only use previousPlan for calculation
        // Manually calculate using original plan
        const originalPlan = reservation.previousPlan;
        let profitPercentage;
        switch(originalPlan) {
          case '3mins': profitPercentage = 35; break;
          case '5days': profitPercentage = 35; break;
          case '10days': profitPercentage = 107; break;
          case '30days': profitPercentage = 161; break;
          default: profitPercentage = reservation.profitPercentage;
        }
        
        const startDate = reservation.purchaseDate || reservation.createdAt;
        const now = Date.now();
        let calculatedValue;
        
        if (originalPlan === '3mins') {
          const timeHeld = Math.min(Math.floor((now - startDate.getTime()) / (1000 * 60)), 3);
          const growth = profitPercentage / 3 / 100;
          calculatedValue = Math.floor(reservation.currentPrice * (1 + (growth * timeHeld)));
        } else {
          const timeHeld = Math.min(Math.floor((now - startDate.getTime()) / (1000 * 60 * 60 * 24)), parseInt(originalPlan.replace('days', '')));
          const dailyGrowth = profitPercentage / parseInt(originalPlan.replace('days', '')) / 100;
          calculatedValue = Math.floor(reservation.currentPrice * (1 + (dailyGrowth * timeHeld)));
        }
        
        return {
          ...reservationCopy,
          calculatedValue
        };
      } else {
        const profitInfo = reservation.getProfitInfo();
        return {
          ...reservationCopy,
          calculatedValue: profitInfo.currentValue
        };
      }
    });

    res.status(200).json({
      status: 'success',
      results: reservations.length,
      data: { reservations: reservationsWithCalculatedValue }
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
      releaseDeadline: t.releaseDeadline,
      timeRemaining: t.releaseDeadline ? Math.max(0, Math.floor((t.releaseDeadline - new Date()) / (1000 * 60))) : null,
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

// Handle expired reservations (to be called by a cron job)
const handleExpiredReservations = async () => {
  try {
    const expiredReservations = await UserCoin.find({
      reservedBy: { $exists: true },
      reservationExpires: { $lt: new Date() }
    });

    for (const userCoin of expiredReservations) {
      // Penalize user with 2% credit score reduction
      const user = await User.findById(userCoin.reservedBy);
      if (user) {
        const currentScore = user.creditScore || 100;
        user.creditScore = Math.max(0, currentScore - (currentScore * 0.02));
        await user.save();
      }

      // Return coin to auction
      userCoin.isInAuction = true;
      userCoin.reservedBy = undefined;
      userCoin.reservedAt = undefined;
      userCoin.reservationExpires = undefined;
      if (userCoin.previousPlan) {
        userCoin.plan = userCoin.previousPlan; // Restore original plan
        userCoin.previousPlan = undefined; // Clear previousPlan
      }
      await userCoin.save();
    }

    return { success: true, processedCount: expiredReservations.length };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// Get sales history (coins released to buyers)
const getSalesHistory = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const salesHistory = await Transaction.find({
      seller: userId,
      status: 'confirmed'
    })
    .populate('buyer', 'firstName lastName email')
    .populate('userCoin', 'category plan currentPrice')
    .select('amount completedAt createdAt')
    .sort('-completedAt');

    const formattedHistory = salesHistory.map(sale => ({
      _id: sale._id,
      buyer: {
        name: `${sale.buyer.firstName} ${sale.buyer.lastName}`,
        email: sale.buyer.email
      },
      coin: sale.userCoin,
      amount: sale.amount,
      purchaseDate: sale.createdAt,
      releasedAt: sale.completedAt
    }));

    res.status(200).json({
      status: 'success',
      results: formattedHistory.length,
      data: {
        salesHistory: formattedHistory
      }
    });
  } catch (error) {
    next(error);
  }
};

export { 
  getAuctionStatus, 
  getAuctionCoins,
  getAuctionCoinsDebug,
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
  getSaleDetails,
  getSalesHistory,
  handleExpiredReservations
};