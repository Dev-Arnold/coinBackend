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

// Place bid on a user coin
const placeBid = async (req, res, next) => {
  try {
    const { coinId, paymentMethod } = req.body;
    const userId = req.user.id;

    // Check if auction is active
    const currentAuction = await AuctionSession.findOne({ isActive: true });
    if (!currentAuction || !currentAuction.isCurrentlyActive()) {
      return next(new AppError('No active auction at the moment', 400));
    }

    // Find the user coin
    const userCoin = await UserCoin.findById(coinId);
    if (!userCoin || !userCoin.isInAuction || !userCoin.isApproved) {
      return next(new AppError('Coin is not available for bidding', 400));
    }
    
    if (userCoin.owner.toString() === userId) {
      return next(new AppError('You cannot bid on your own coin', 400));
    }

    // Check if user is blocked
    const user = await User.findById(userId);
    if (user.isBlocked) {
      return next(new AppError('Your account is blocked', 403));
    }

    // Create transaction
    const paymentDeadline = new Date(Date.now() + parseInt(process.env.PAYMENT_TIMEOUT_MINUTES) * 60 * 1000);
    
    const transaction = await Transaction.create({
      buyer: userId,
      userCoin: coinId,
      seller: userCoin.seller || userCoin.owner,
      amount: userCoin.currentPrice,
      plan: userCoin.plan,
      paymentMethod,
      paymentDeadline,
      auctionSession: currentAuction._id
    });

    // Remove coin from auction
    userCoin.isInAuction = false;
    await userCoin.save();

    // Add user to auction participants if not already added
    if (!currentAuction.participants.some(p => p.user.toString() === userId)) {
      currentAuction.participants.push({ user: userId });
    }
    currentAuction.totalBids += 1;
    await currentAuction.save();

    res.status(201).json({
      status: 'success',
      message: 'Bid placed successfully. Please complete payment within 15 minutes.',
      data: {
        transaction,
        paymentDeadline
      }
    });
  } catch (error) {
    next(error);
  }
};

// Cancel bid (returns coin to auction)
const cancelBid = async (req, res, next) => {
  try {
    const { transactionId } = req.params;
    const userId = req.user.id;

    const transaction = await Transaction.findById(transactionId);
    if (!transaction || transaction.buyer.toString() !== userId) {
      return next(new AppError('Transaction not found', 404));
    }

    if (transaction.status !== 'pending_payment') {
      return next(new AppError('Cannot cancel this transaction', 400));
    }

    // Update transaction status
    transaction.status = 'cancelled';
    await transaction.save();

    // Return user coin to auction
    const userCoin = await UserCoin.findById(transaction.userCoin);
    if (userCoin) {
      userCoin.isInAuction = true;
      await userCoin.save();
    }

    // Reduce user's credit score
    const user = await User.findById(userId);
    await user.reduceCreditScore(15);

    res.status(200).json({
      status: 'success',
      message: 'Bid cancelled. Coin returned to auction. Credit score reduced.',
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
  placeBid, 
  cancelBid, 
  getMyBids 
};