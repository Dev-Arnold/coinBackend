import AuctionSession from '../models/AuctionSession.js';
import Coin from '../models/Coin.js';
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

    // Get coins in auction grouped by category
    const coinsByCategory = await Coin.aggregate([
      {
        $match: {
          isInAuction: true,
          isApproved: true
        }
      },
      {
        $group: {
          _id: '$category',
          coins: {
            $push: {
              _id: '$_id',
              basePrice: '$basePrice',
              plan: '$plan',
              profitPercentage: '$profitPercentage',
              auctionStartDate: '$auctionStartDate'
            }
          },
          count: { $sum: 1 },
          minPrice: { $min: '$basePrice' },
          maxPrice: { $max: '$basePrice' }
        }
      }
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        auctionId: currentAuction._id,
        categories: coinsByCategory
      }
    });
  } catch (error) {
    next(error);
  }
};

// Place bid on a coin
const placeBid = async (req, res, next) => {
  try {
    const { coinId, paymentMethod } = req.body;
    const userId = req.user.id;

    // Check if auction is active
    const currentAuction = await AuctionSession.findOne({ isActive: true });
    if (!currentAuction || !currentAuction.isCurrentlyActive()) {
      return next(new AppError('No active auction at the moment', 400));
    }

    // Check if coin exists and is in auction
    const coin = await Coin.findById(coinId);
    if (!coin || !coin.isInAuction || !coin.isApproved) {
      return next(new AppError('Coin is not available for bidding', 400));
    }

    // Check if user has sufficient balance (if required)
    const user = await User.findById(userId);
    if (user.isBlocked) {
      return next(new AppError('Your account is blocked', 403));
    }

    // Create transaction
    const paymentDeadline = new Date(Date.now() + parseInt(process.env.PAYMENT_TIMEOUT_MINUTES) * 60 * 1000);
    
    const transaction = await Transaction.create({
      buyer: userId,
      coin: coinId,
      amount: coin.basePrice,
      plan: coin.plan,
      paymentMethod,
      paymentDeadline,
      auctionSession: currentAuction._id
    });

    // Remove coin from auction
    coin.isInAuction = false;
    await coin.save();

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
        coin,
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

    // Return coin to auction
    const coin = await Coin.findById(transaction.coin);
    coin.isInAuction = true;
    await coin.save();

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
      .populate({
        path: 'userCoin',
        populate: {
          path: 'coin',
          select: 'name description category plan'
        }
      })
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