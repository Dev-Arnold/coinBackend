import AuctionSession from '../models/AuctionSession.js';
import UserCoin from '../models/UserCoin.js';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';

// Get current auction status and next auction time
const getAuctionStatus = async (req, res, next) => {
  try {
    const currentAuction = await AuctionSession.findOne({ isActive: true })
      .populate('coins');

    if (!currentAuction || !currentAuction.isCurrentlyActive()) {
      return next(new AppError('No active auction at the moment', 400));
    }

    const nextAuctionTime = AuctionSession.getNextAuctionTime();

    res.status(200).json({
      status: 'success',
      data: {
        currentAuction,
        nextAuctionTime,
        isActive: currentAuction ? currentAuction.isCurrentlyActive() : false
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
    .populate('seller', 'name')
    .select('_id currentPrice category plan profitPercentage seller status');

    // Group by category
    const coinsByCategory = {};

    userCoins.forEach(userCoin => {
      if (!coinsByCategory[userCoin.category]) {
        coinsByCategory[userCoin.category] = { coins: [], count: 0, minPrice: Infinity, maxPrice: 0 };
      }
      coinsByCategory[userCoin.category].coins.push({
        _id: userCoin._id,
        price: userCoin.currentPrice,
        plan: userCoin.plan,
        profitPercentage: userCoin.profitPercentage,
        seller: userCoin.seller,
        status: userCoin.status
      });
      coinsByCategory[userCoin.category].count++;
      coinsByCategory[userCoin.category].minPrice = Math.min(coinsByCategory[userCoin.category].minPrice, userCoin.currentPrice);
      coinsByCategory[userCoin.category].maxPrice = Math.max(coinsByCategory[userCoin.category].maxPrice, userCoin.currentPrice);
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
    const userCoin = await UserCoin.findById(coinId).populate('owner', 'firstName lastName bankDetails');
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

    // Temporarily remove from auction
    userCoin.isInAuction = false;
    await userCoin.save();

    res.status(200).json({
      status: 'success',
      message: 'Coin reserved successfully. Complete payment within 15 minutes.',
      data: {
        coinId,
        plan,
        amount: userCoin.currentPrice,
        seller: {
          name: `${userCoin.owner.firstName} ${userCoin.owner.lastName}`,
          bankDetails: userCoin.owner.bankDetails
        },
        expiresAt: new Date(Date.now() + 15 * 60 * 1000)
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
    console.log(req.body)
    const userId = req.user.id;

    // Check if file was uploaded
    if (!req.file) {
      return next(new AppError('Please upload payment proof', 400));
    }

    // Get coin details
    const userCoin = await UserCoin.findById(coinId);
    if (!userCoin) {
      return next(new AppError('User coin not found', 404));
    }

    // Create transaction
    const transaction = await Transaction.create({
      buyer: userId,
      userCoin: coinId,
      seller: userCoin.owner,
      amount: userCoin.currentPrice,
      plan,
      paymentMethod,
      paymentProof: req.file.path,
      status: 'payment_uploaded',
      paymentDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });

    res.status(201).json({
      status: 'success',
      message: 'Bid submitted successfully. Waiting for seller to release coin.',
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
    const { reservationId } = req.params;
    const { coinId } = req.body;
    const userId = req.user.id;

    // Return coin to auction
    const userCoin = await UserCoin.findById(coinId);
    if (userCoin) {
      userCoin.isInAuction = true;
      await userCoin.save();
    }

    // Reduce user's credit score for cancellation
    const user = await User.findById(userId);
    await user.reduceCreditScore(5);

    res.status(200).json({
      status: 'success',
      message: 'Reservation cancelled. Coin returned to auction.',
      data: {
        newCreditScore: user.creditScore
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

export { 
  getAuctionStatus, 
  getAuctionCoins, 
  reserveCoin,
  submitBidWithProof, 
  cancelReservation, 
  getMyBids 
};