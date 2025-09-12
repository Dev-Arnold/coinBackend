import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import { createSendToken } from '../utils/generateToken.js';
import { sendWhatsAppOTP } from '../utils/termii.js';
import { generateOTP, hashOTP, verifyOTP, normalizePhoneNumber } from '../utils/otp.js';

// Signup new user and send OTP
const signup = async (req, res, next) => {
  try {
    const { firstName, lastName, email, phone, password, referralCode } = req.body;

    // Normalize phone number
    const normalizedPhone = normalizePhoneNumber(phone);

    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [{ phone: normalizedPhone }, { email }]
    });
    if (existingUser) {
      return next(new AppError('User with this phone number or email already exists', 400));
    }

    // Handle referral code if provided
    let referrer = null;
    if (referralCode) {
      referrer = await User.findOne({ referralCode });
      if (!referrer) {
        return next(new AppError('Invalid referral code', 400));
      }
    }

    // Generate OTP
    const otp = generateOTP();
    const hashedOTP = await hashOTP(otp);
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Create new user
    const newUser = await User.create({
      firstName,
      lastName,
      email,
      phone: normalizedPhone,
      password,
      referredBy: referrer?._id,
      otpHash: hashedOTP,
      otpExpiry
    });

    // Add referral bonus to referrer
    if (referrer) {
      referrer.referralEarnings += process.env.REFERRAL_BONUS || 2000;
      await referrer.save();
    }

    // Send OTP via WhatsApp
    const otpResult = await sendWhatsAppOTP(normalizedPhone, otp);
    if (!otpResult.success) {
      await User.findByIdAndDelete(newUser._id);
      return next(new AppError('Failed to send OTP. Please try again.', 500));
    }



    res.status(201).json({
      status: 'success',
      message: 'User created successfully. OTP sent to WhatsApp.'
    });
  } catch (error) {
    next(error);
  }
};

// Verify OTP and activate user
const verifyOtp = async (req, res, next) => {
  try {
    const { phone, otp } = req.body;

    // Normalize phone number
    const normalizedPhone = normalizePhoneNumber(phone);

    // Find user
    const user = await User.findOne({ phone: normalizedPhone }).select('+password');
    if (!user) {
      return next(new AppError('User not found', 404));
    }

    // Check if OTP exists and not expired
    if (!user.otpHash || !user.otpExpiry) {
      return next(new AppError('No OTP found. Please request a new one.', 400));
    }

    if (user.otpExpiry < new Date()) {
      return next(new AppError('OTP has expired. Please request a new one.', 400));
    }

    // Verify OTP
    const isValidOTP = await verifyOTP(otp, user.otpHash);
    if (!isValidOTP) {
      return next(new AppError('Invalid OTP', 400));
    }

    // Mark user as verified and clear OTP fields
    user.isVerified = true;
    user.otpHash = undefined;
    user.otpExpiry = undefined;
    await user.save();

    // Send JWT token
    createSendToken(user, 200, res);
  } catch (error) {
    next(error);
  }
};

// Login user
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Check if user exists and password is correct
    const user = await User.findOne({ email }).select('+password');

    if (!user || !(await user.correctPassword(password, user.password))) {
      return next(new AppError('Incorrect email or password', 401));
    }

    // Check if user is verified
    if (!user.isVerified) {
      return next(new AppError('Please verify your phone number first', 401));
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



export { signup, verifyOtp, login, logout, getMe, updateMe, requestReferralBonus, getReferralStatus, getDashboard };