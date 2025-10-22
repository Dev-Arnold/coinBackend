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
      .populate('seller', 'name')
      .populate('boughtFrom', 'name')
      .sort('-createdAt');

    // Calculate current values for each user coin
    const coinsWithValues = userCoins.map((userCoin) => {
      const profitInfo = userCoin.getProfitInfo();
      
      return {
        ...userCoin.toObject(),
        ...profitInfo
      };
    });

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

    if(!coins || coins.length === 0){
      return res.status(400).json({message:"No coins available for auction"})
    }

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
      .populate('owner', 'name email')
      .populate('seller', 'name email phone bankDetails');

    if (!userCoin) {
      return next(new AppError('User coin not found', 404));
    }

    // Calculate current value and profit
    const profitInfo = userCoin.getProfitInfo();

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

    // Update transaction with payment proof - wait for seller confirmation
    transaction.paymentProof = req.file.path;
    transaction.status = 'payment_uploaded';
    await transaction.save();

    res.status(200).json({
      status: 'success',
      message: 'Payment proof uploaded successfully. Waiting for seller to release coin.',
      data: {
        transaction
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

    const userCoin = await UserCoin.findById(userCoinId);
    if (!userCoin || userCoin.owner.toString() !== userId) {
      return next(new AppError('User coin not found or not owned by you', 404));
    }

    const isMatured = userCoin.hasMatured();
    if (!isMatured) {
      return next(new AppError('Coin has not matured yet. Cannot submit for approval.', 400));
    }

    // Check if this is the user's last bought coin (should remain locked)
    const lastBoughtCoin = await UserCoin.findOne({
      owner: userId,
      boughtFrom: { $exists: true }
    }).sort({ createdAt: -1 });

    if (lastBoughtCoin && lastBoughtCoin._id.toString() === userCoinId) {
      return next(new AppError('Cannot submit your most recent coin for approval. Buy another coin first.', 400));
    }

    // Check if coin is locked (last bought coins should remain locked)
    if (userCoin.isLocked) {
      return next(new AppError('This coin is locked and cannot be submitted for approval yet.', 400));
    }

    // Check if user has at least one coin that hasn't been submitted or approved (excluding the one being submitted)
    const availableCoins = await UserCoin.find({ 
      owner: userId, 
      _id: { $ne: userCoinId },
      status: { $nin: ['pending_approval', 'sold'] },
      isApproved: false
    });
    
    if (availableCoins.length === 0) {
      return next(new AppError('Before you can submit a coin for auction, you must have an extra coin that has not been submitted or approved', 400));
    }


    // Check recommitment policy - compare with last bought coin
    // const lastBoughtCoin = await UserCoin.findOne({ 
    //   owner: userId, 
    //   boughtFrom: { $exists: true } 
    // }).sort('-createdAt');

    // if (lastBoughtCoin && userCoin.currentPrice < lastBoughtCoin.currentPrice) {
    //   return next(new AppError('Follow the recommitment policy', 400));
    // }

    if (userCoin.status === 'pending_approval') {
      return next(new AppError('Coin is already pending approval', 400));
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

// Get seller bank details for a coin
const getSellerBankDetails = async (req, res, next) => {
  try {
    const { coinId } = req.params;

    // For user coins, get the seller's bank details
    const userCoin = await UserCoin.findById(coinId).populate('owner', 'firstName lastName bankDetails');
    console.log(userCoin)
    if (!userCoin) {
      return next(new AppError('User coin not found', 404));
    }
    let seller = userCoin.owner;

    if (!seller || !seller.bankDetails) {
      return next(new AppError('Seller bank details not available', 404));
    }

    res.status(200).json({
      status: 'success',
      data: {
        seller: {
          name: seller.firstName + ' ' + seller.lastName,
          bankDetails: seller.bankDetails
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// Release coin to buyer (seller confirms payment)
const releaseCoinToBuyer = async (req, res, next) => {
  try {
    console.log("🔥 Partial purchase logic triggered 🔥");
    const { transactionId } = req.params;
    const userId = req.user.id;

    const transaction = await Transaction.findById(transactionId)
      .populate('buyer', 'name');

      console.log(transaction);
    
    if (!transaction) {
      return next(new AppError('Transaction not found', 404));
    }

    if (transaction.status !== 'payment_uploaded') {
      return next(new AppError('Payment proof must be uploaded first', 400));
    }
    
    // Get original user coin to copy properties
    const originalUserCoin = await UserCoin.findById(transaction.userCoin);
    if (!originalUserCoin) {
      return next(new AppError('Original coin not found', 404));
    }

    // Check if user is authorized to release (either seller or owner)
    const sellerId = transaction.seller || originalUserCoin.owner;
    if (sellerId.toString() !== userId) {
      return next(new AppError('You are not authorized to release this coin', 403));
    }
    
    // Check if release deadline has passed and penalize seller
    if (transaction.releaseDeadline && new Date() > transaction.releaseDeadline) {
      const seller = await User.findById(sellerId);
      const currentScore = seller.creditScore || 100;
      seller.creditScore = Math.max(0, currentScore - (currentScore * 0.02)); // Reduce by 2%
      await seller.save();
    }
    
    // Create UserCoin for the buyer
    const newUserCoin = await UserCoin.create({
      category: originalUserCoin.category,
      plan: transaction.plan,
      profitPercentage: originalUserCoin.profitPercentage,
      owner: transaction.buyer._id,
      currentPrice: transaction.amount,
      boughtFrom: originalUserCoin.owner,
      isApproved: false,
      status: 'locked'
    });

    // Update buyer's balance to reflect new coin
    const buyer = await User.findById(transaction.buyer._id);
    await buyer.updateBalance();

    // Unlock buyer's previous last purchased coin (the one before this new purchase)
    const previousLastCoin = await UserCoin.findOne({
      owner: transaction.buyer._id,
      boughtFrom: { $exists: true },
      _id: { $ne: newUserCoin._id }
    }).sort({ createdAt: -1 });

    if (previousLastCoin) {
      previousLastCoin.isLocked = false;
      previousLastCoin.status = previousLastCoin.hasMatured() ? 'matured' : 'unlocked';
      await previousLastCoin.save();
    }

    // Check if this is buyer's first purchase and add referral bonus
    const existingTransaction = await Transaction.findOne({ 
      buyer: transaction.buyer._id, 
      status: 'confirmed',
      _id: { $ne: transaction._id }
    });
    
    if (!existingTransaction) {
      const buyer = await User.findById(transaction.buyer._id);
      if (buyer.referredBy) {
        const referrer = await User.findById(buyer.referredBy);
        if (referrer) {
          referrer.referralEarnings = Number(referrer.referralEarnings || 0) + Math.floor(transaction.amount * 0.1);
          await referrer.save();
        }
      }
    }

    // Handle partial purchase - subtract amount from original coin
    const currentValue = originalUserCoin.calculateCurrentValue();
    const transactionAmount = Number(transaction.amount);
    console.log('Current Value:', currentValue);
    console.log('Transaction Amount:', transactionAmount);
    const remainingValue = currentValue - transactionAmount;
    console.log('Remaining Value:', remainingValue);
    
    if (remainingValue <= 0) {
      // Delete original coin if no value remains
      await UserCoin.findByIdAndDelete(transaction.userCoin);
    } else {
      // Calculate proportional base price for remaining value
      const ratio = remainingValue / currentValue;
      const newCurrentPrice = Math.floor(originalUserCoin.currentPrice * ratio);
      console.log('New Current Price:', newCurrentPrice);
      originalUserCoin.currentPrice = newCurrentPrice;
      await originalUserCoin.save();
    }

    // Update transaction status
    transaction.status = 'confirmed';
    transaction.completedAt = new Date();
    await transaction.save();

    // Log activity
    const { logActivity } = await import('../controllers/activityController.js');
    const buyerDetails = await User.findById(transaction.buyer._id).select('firstName lastName');
    await logActivity('coin_released', `Coin released to ${buyerDetails.firstName} ${buyerDetails.lastName}`, sellerId, transaction.amount, transaction.userCoin);

    res.status(200).json({
      status: 'success',
      message: 'Coin released to buyer successfully',
      data: {
        transaction,
        newUserCoin
      }
    });
  } catch (error) {
    next(error);
  }
};

// List user coin for auction (only for matured coins)
const listUserCoinForAuction = async (req, res, next) => {
  try {
    const { userCoinId } = req.params;
    const { newPrice, collectProfit = false } = req.body;
    const userId = req.user.id;

    const userCoin = await UserCoin.findById(userCoinId);
    if (!userCoin || userCoin.owner.toString() !== userId) {
      return next(new AppError('User coin not found or not owned by you', 404));
    }

    const isMatured = userCoin.hasMatured();
    if (!isMatured) {
      return next(new AppError('Only matured coins can be listed for auction', 400));
    }

    if (userCoin.isInAuction) {
      return next(new AppError('User coin is already in auction', 400));
    }

    let profitCollected = 0;
    let newBalance = 0;

    // If user wants to collect profit
    if (collectProfit) {
      const finalValue = userCoin.calculateCurrentValue();
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
    userCoin.isLocked = false;
    userCoin.status = 'available';
    await userCoin.save();

    const message = profitCollected > 0 
      ? `Profit collected! ₦${profitCollected.toLocaleString()} added to your balance. Coin listed for auction.`
      : 'Matured coin listed for auction successfully';

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
  submitUserCoinForApproval,
  getSellerBankDetails,
  releaseCoinToBuyer,
  listUserCoinForAuction 
};