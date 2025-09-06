import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import { createSendToken } from '../utils/generateToken.js';
import { sendWhatsAppOTP, verifyWhatsAppOTP } from '../utils/termiiService.js';

// Register new user with optional referral
const register = async (req, res, next) => {
  try {
    const { firstName, lastName, email, phone, password, referralCode } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return next(new AppError('User with this email already exists', 400));
    }

    // Create user data
    const userData = { firstName, lastName, email, phone, password };

    // Handle referral if provided
    if (referralCode) {
      const referrer = await User.findOne({ referralCode });
      if (referrer) {
        userData.referredBy = referrer._id;
        // Give referral bonus to referrer
        referrer.referralEarnings += parseInt(process.env.REFERRAL_BONUS);
        await referrer.updateBalance();
        await referrer.save();
      }
    }

    // Create new user
    const newUser = await User.create(userData);

    // Send token
    createSendToken(newUser, 201, res);
  } catch (error) {
    next(error);
  }
};

// Login user
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Check if email and password exist
    if (!email || !password) {
      return next(new AppError('Please provide email and password!', 400));
    }

    // Check if user exists and password is correct
    const user = await User.findOne({ email }).select('+password');

    if (!user || !(await user.correctPassword(password, user.password))) {
      return next(new AppError('Incorrect email or password', 401));
    }

    // Check if user is blocked
    if (user.isBlocked) {
      return next(new AppError('Your account has been blocked due to low credit score', 403));
    }

    // Send token
    createSendToken(user, 200, res);
  } catch (error) {
    next(error);
  }
};

// Logout user
const logout = (req, res) => {
  res.cookie('jwt', 'loggedout', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true
  });
  res.status(200).json({ status: 'success' });
};

// Get current user profile
const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('referredBy', 'firstName lastName email');
    
    // Update daily profits
    const dailyProfitAdded = await user.updateDailyProfits();
    
    // Calculate total balance including coin values
    const totalBalance = await user.calculateTotalBalance();
    
    res.status(200).json({
      status: 'success',
      data: {
        user: {
          ...user.toObject(),
          totalBalance,
          dailyProfitAdded
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// Update user profile
const updateMe = async (req, res, next) => {
  try {
    const { firstName, lastName, phone, bankDetails } = req.body;

    // Create object with allowed fields
    const updateData = {};
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (phone) updateData.phone = phone;
    if (bankDetails) updateData.bankDetails = bankDetails;

    const updatedUser = await User.findByIdAndUpdate(req.user.id, updateData, {
      new: true,
      runValidators: true
    });

    res.status(200).json({
      status: 'success',
      data: {
        user: updatedUser
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get referral earnings and status
const getReferralStatus = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id)
      .select('referralEarnings referralBonusRequests referralCode');

    const canRequest = user.referralEarnings >= 10000;
    const pendingRequest = user.referralBonusRequests.find(req => req.status === 'pending');

    res.status(200).json({
      status: 'success',
      data: {
        referralEarnings: user.referralEarnings,
        referralCode: user.referralCode,
        canRequestBonus: canRequest,
        hasPendingRequest: !!pendingRequest,
        requests: user.referralBonusRequests
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get dashboard with updated balances
const getDashboard = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    
    // Update daily profits
    const dailyProfitAdded = await user.updateDailyProfits();
    
    // Calculate total balance including coin values
    const totalBalance = await user.calculateTotalBalance();
    
    // Get user coins with current values
    const UserCoin = (await import('../models/UserCoin.js')).default;
    const userCoins = await UserCoin.find({ 
      owner: req.user.id, 
      status: { $ne: 'sold' } 
    });
    
    const coinPortfolio = userCoins.map(coin => ({
      ...coin.toObject(),
      currentValue: coin.calculateCurrentValue(),
      profitInfo: coin.getProfitInfo()
    }));
    
    res.status(200).json({
      status: 'success',
      data: {
        cashBalance: user.balance,
        totalBalance,
        dailyProfitAdded,
        coinPortfolio,
        totalCoins: userCoins.length
      }
    });
  } catch (error) {
    next(error);
  }
};

// Request referral bonus conversion
const requestReferralBonus = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (user.referralEarnings < 10000) {
      return next(new AppError('Minimum ₦10,000 referral earnings required', 400));
    }

    // Check if there's already a pending request
    const pendingRequest = user.referralBonusRequests.find(req => req.status === 'pending');
    if (pendingRequest) {
      return next(new AppError('You already have a pending referral bonus request', 400));
    }

    // Add new request
    user.referralBonusRequests.push({
      amount: user.referralEarnings
    });
    await user.save();

    res.status(201).json({
      status: 'success',
      message: 'Referral bonus request submitted successfully',
      data: {
        requestAmount: user.referralEarnings
      }
    });
  } catch (error) {
    next(error);
  }
};

// Send WhatsApp OTP
const sendOTP = async (req, res, next) => {
  try {
    const { phone } = req.body;
    
    if (!phone) {
      return next(new AppError('Phone number is required', 400));
    }

    const result = await sendWhatsAppOTP(phone);
    
    if (!result.success) {
      return next(new AppError('Failed to send OTP', 500));
    }

    // Store pinId for verification
    const user = await User.findOne({ phone });
    if (user) {
      user.otpPinId = result.data.pinId;
      await user.save();
    }

    res.status(200).json({
      status: 'success',
      message: 'OTP sent to WhatsApp',
      data: {
        pinId: result.data.pinId
      }
    });
  } catch (error) {
    next(error);
  }
};

// Verify WhatsApp OTP
const verifyOTP = async (req, res, next) => {
  try {
    const { phone, pin } = req.body;
    
    if (!phone || !pin) {
      return next(new AppError('Phone number and PIN are required', 400));
    }

    const user = await User.findOne({ phone });
    if (!user || !user.otpPinId) {
      return next(new AppError('Invalid phone number or no OTP sent', 400));
    }

    const result = await verifyWhatsAppOTP(user.otpPinId, pin);
    
    if (!result.success || !result.verified) {
      return next(new AppError('Invalid OTP', 400));
    }

    // Mark phone as verified
    user.isPhoneVerified = true;
    user.otpPinId = undefined;
    await user.save();

    res.status(200).json({
      status: 'success',
      message: 'Phone number verified successfully'
    });
  } catch (error) {
    next(error);
  }
};

export { register, login, logout, getMe, updateMe, requestReferralBonus, getReferralStatus, getDashboard, sendOTP, verifyOTP };