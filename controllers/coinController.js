import Coin from '../models/Coin.js';
import UserCoin from '../models/UserCoin.js';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';

// Get user's coin portfolio with current values
const getMyCoins = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const userCoins = await UserCoin.find({ owner: userId })
      .populate('coin', ' category plan basePrice profitPercentage')
      .populate('seller', 'name')
      .sort('-createdAt');

    // Calculate current values for each user coin
    const coinsWithValues = await Promise.all(
      userCoins.map(async (userCoin) => {
        const profitInfo = await userCoin.getProfitInfo();
        
        return {
          ...userCoin.toObject(),
          ...profitInfo
        };
      })
    );

    // Calculate total portfolio value
    const totalInvestment = coinsWithValues.reduce((sum, coin) => sum + coin.currentPrice, 0);
    const totalCurrentValue = coinsWithValues.reduce((sum, coin) => sum + coin.currentValue, 0);
    const totalProfit = totalCurrentValue - totalInvestment;

    res.status(200).json({
      status: 'success',
      results: coinsWithValues.length,
      data: {
        userCoins: coinsWithValues,
        portfolio: {
          totalInvestment,
          totalCurrentValue,
          totalProfit,
          profitPercentage: totalInvestment > 0 ? ((totalProfit / totalInvestment) * 100).toFixed(2) : 0
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get coins in auction for purchase
const getAvailableCoins = async (req, res, next) => {
  try {
    const coins = await Coin.find({ 
      isActive: true, 
      isApproved: true,
      isInAuction: true 
    }).sort('category plan');

    // Group by category
    const coinsByCategory = coins.reduce((acc, coin) => {
      if (!acc[coin.category]) {
        acc[coin.category] = [];
      }
      acc[coin.category].push(coin);
      return acc;
    }, {});

    res.status(200).json({
      status: 'success',
      data: {
        coinsByCategory
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get single user coin details
const getUserCoin = async (req, res, next) => {
  try {
    const userCoin = await UserCoin.findById(req.params.id)
      .populate('coin', ' category plan basePrice profitPercentage')
      .populate('owner', 'name email')
      .populate('seller', 'name email phone bankDetails');

    if (!userCoin) {
      return next(new AppError('User coin not found', 404));
    }

    // Calculate current value and profit
    const profitInfo = await userCoin.getProfitInfo();

    res.status(200).json({
      status: 'success',
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

// Upload payment proof for a transaction
const uploadPaymentProof = async (req, res, next) => {
  try {
    const { transactionId } = req.params;
    const userId = req.user.id;

    // Check if file was uploaded (you'll need to add multer middleware)
    if (!req.file) {
      return next(new AppError('Please upload payment proof', 400));
    }

    const transaction = await Transaction.findById(transactionId);
    if (!transaction || transaction.buyer.toString() !== userId) {
      return next(new AppError('Transaction not found', 404));
    }

    if (transaction.status !== 'pending_payment') {
      return next(new AppError('Cannot upload proof for this transaction', 400));
    }

    // Check if payment deadline has passed
    if (transaction.isPaymentExpired()) {
      // Return coin to auction and reduce credit score
      const coin = await Coin.findById(transaction.coin);
      coin.isInAuction = true;
      await coin.save();

      transaction.status = 'failed';
      await transaction.save();

      const user = await User.findById(userId);
      await user.reduceCreditScore(20);

      return next(new AppError('Payment deadline has passed. Credit score reduced.', 400));
    }

    // Update transaction with payment proof
    transaction.paymentProof = req.file.path;
    transaction.status = 'payment_uploaded';
    await transaction.save();

    // Create UserCoin for the buyer
    const coin = await Coin.findById(transaction.coin);
    const userCoin = await UserCoin.create({
      coin: transaction.coin,
      owner: userId,
      currentPrice: transaction.amount,
      isApproved: true,
      status: 'locked'
    });

    res.status(200).json({
      status: 'success',
      message: 'Payment proof uploaded successfully. Coin added to your portfolio.',
      data: {
        transaction,
        userCoin
      }
    });
  } catch (error) {
    next(error);
  }
};

// Make recommitment bid to unlock user coin for resale
const makeRecommitmentBid = async (req, res, next) => {
  try {
    const { userCoinId } = req.params;
    const userId = req.user.id;

    const userCoin = await UserCoin.findById(userCoinId).populate('coin');
    if (!userCoin || userCoin.owner.toString() !== userId) {
      return next(new AppError('User coin not found or not owned by you', 404));
    }

    if (!userCoin.isLocked) {
      return next(new AppError('User coin is not locked', 400));
    }

    const currentValue = await userCoin.calculateCurrentValue();

    // Create recommitment transaction (100% of current value)
    const transaction = await Transaction.create({
      buyer: userId,
      coin: userCoin.coin._id,
      userCoin: userCoinId,
      amount: currentValue,
      plan: userCoin.coin.plan,
      paymentMethod: 'balance', // Use account balance
      status: 'confirmed',
      completedAt: new Date()
    });

    // Update user balance
    const user = await User.findById(userId);
    if (user.balance < currentValue) {
      return next(new AppError('Insufficient balance for recommitment', 400));
    }

    user.balance -= currentValue;
    await user.save();

    // Unlock user coin
    userCoin.isLocked = false;
    userCoin.lockExpiresAt = undefined;
    userCoin.status = 'available';
    await userCoin.save();

    res.status(200).json({
      status: 'success',
      message: 'Recommitment successful. Coin is now unlocked for resale.',
      data: {
        userCoin,
        transaction,
        newBalance: user.balance
      }
    });
  } catch (error) {
    next(error);
  }
};

// Submit matured user coin for admin approval
const submitUserCoinForApproval = async (req, res, next) => {
  try {
    const { userCoinId } = req.params;
    const userId = req.user.id;

    const userCoin = await UserCoin.findById(userCoinId).populate('coin');
    if (!userCoin || userCoin.owner.toString() !== userId) {
      return next(new AppError('User coin not found or not owned by you', 404));
    }

    // const isMatured = await userCoin.hasMatured();
    // if (!isMatured) {
    //   return next(new AppError('Coin has not matured yet. Cannot submit for approval.', 400));
    // }

    if (userCoin.status === 'pending_approval') {
      return next(new AppError('Coin is already pending approval', 400));
    }

    if (!userCoin.isLocked) {
      return next(new AppError('Coin is already unlocked', 400));
    }

    // Submit for approval
    userCoin.status = 'pending_approval';
    userCoin.isApproved = false;
    await userCoin.save();

    res.status(200).json({
      status: 'success',
      message: 'Matured coin submitted for admin approval successfully',
      data: {
        userCoin
      }
    });
  } catch (error) {
    next(error);
  }
};

// List user coin for auction (only for approved unlocked coins)
const listUserCoinForAuction = async (req, res, next) => {
  try {
    const { userCoinId } = req.params;
    const { newPrice, collectProfit = false } = req.body;
    const userId = req.user.id;

    const userCoin = await UserCoin.findById(userCoinId).populate('coin');
    if (!userCoin || userCoin.owner.toString() !== userId) {
      return next(new AppError('User coin not found or not owned by you', 404));
    }

    if (userCoin.isLocked) {
      return next(new AppError('Coin is locked. Submit for admin approval first.', 400));
    }

    if (!userCoin.isApproved) {
      return next(new AppError('Coin must be approved by admin before listing.', 400));
    }

    if (userCoin.isInAuction) {
      return next(new AppError('User coin is already in auction', 400));
    }

    const isMatured = await userCoin.hasMatured();
    let profitCollected = 0;
    let newBalance = 0;

    // If coin is matured and user wants to collect profit
    if (isMatured && collectProfit) {
      const finalValue = await userCoin.calculateCurrentValue();
      profitCollected = finalValue - userCoin.currentPrice;
      
      // Add profit to user balance
      const user = await User.findById(userId);
      user.balance += profitCollected;
      await user.save();
      newBalance = user.balance;
      
      // Update coin price to matured value
      userCoin.currentPrice = finalValue;
      userCoin.status = 'matured';
    }

    // List coin for auction
    userCoin.currentPrice = newPrice || userCoin.currentPrice;
    userCoin.seller = userId;
    userCoin.isInAuction = true;
    if (!isMatured || !collectProfit) userCoin.status = 'available';
    await userCoin.save();

    const message = profitCollected > 0 
      ? `Profit collected! ₦${profitCollected.toLocaleString()} added to your balance. Coin listed for auction.`
      : 'User coin listed for auction successfully';

    res.status(200).json({
      status: 'success',
      message,
      data: {
        userCoin,
        ...(profitCollected > 0 && { profitCollected, newBalance })
      }
    });
  } catch (error) {
    next(error);
  }
};

export { 
  getMyCoins,
  getAvailableCoins,
  getUserCoin, 
  uploadPaymentProof, 
  makeRecommitmentBid, 
  submitUserCoinForApproval,
  listUserCoinForAuction 
};