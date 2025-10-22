import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import { createSendToken } from '../utils/generateToken.js';
import { verifyOTP, normalizePhoneNumber } from '../utils/otp.js';
import sendEmail from '../utils/email.js';

const signup = async (req, res, next) => {
  try {
    const { firstName, lastName, email, phone, password, bankDetails, usdtWallet, referralCode, referralLink } = req.body;
    
    const existingUser = await User.findOne({ email });
    
    if (existingUser) {
      return next(new AppError('User with email already exists', 400));
    }

    let referrer = null;
    
    // Handle referral code
    if (referralCode) {
      referrer = await User.findOne({ referralCode });
      if (!referrer) {
        return next(new AppError('Invalid referral code', 400));
      }
    }
    
    // Handle referral link (extract referral code from link)
    if (referralLink && !referrer) {
      const referralCodeFromLink = referralLink.split('/').pop(); // Extract code from URL
      referrer = await User.findOne({ referralCode: referralCodeFromLink });
      if (!referrer) {
        return next(new AppError('Invalid referral link', 400));
      }
    }

    const newUser = await User.create({
      firstName,
      lastName,
      email,
      phone,
      password,
      bankDetails,
      usdtWallet,
      referredBy: referrer?._id
    });

    if (referrer) {
      referrer.referralEarnings = Number(referrer.referralEarnings || 0) + (Number(process.env.REFERRAL_BONUS) || 2000);
      await referrer.save();
    }

    createSendToken(newUser, 201, res);

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
    
    // Only update profits if last update was more than 1 hour ago
    const lastUpdate = user.lastProfitUpdate || user.createdAt;
    const hoursSinceUpdate = (Date.now() - lastUpdate) / (1000 * 60 * 60);
    
    let dailyProfitAdded = 0;
    if (hoursSinceUpdate >= 1) {
      dailyProfitAdded = await user.updateDailyProfits();
    }
    
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
    const { firstName, lastName, phone, bankDetails, usdtWallet } = req.body;

    // Create object with allowed fields
    const updateData = {};
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (phone) updateData.phone = phone;
    if (bankDetails) updateData.bankDetails = bankDetails;
    if (usdtWallet !== undefined) updateData.usdtWallet = usdtWallet;

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

    // Get all users referred by this user
    const referredUsers = await User.find({ referredBy: req.user.id })
      .select('firstName lastName email createdAt');

    const canRequest = user.referralEarnings >= 10000;
    const pendingRequest = user.referralBonusRequests.find(req => req.status === 'pending');
    
    // Generate referral link
    const referralLink = `${process.env.FRONTEND_URL || 'https://locexcoinp2pauction.com'}/signup/${user.referralCode}`;

    res.status(200).json({
      status: 'success',
      data: {
        referralEarnings: user.referralEarnings,
        referralCode: user.referralCode,
        referralLink: referralLink,
        canRequestBonus: canRequest,
        hasPendingRequest: !!pendingRequest,
        requests: user.referralBonusRequests,
        referredUsers: referredUsers,
        totalReferrals: referredUsers.length
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



// Forgot password
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    
    if (!user) {
      return next(new AppError('No user found with that email', 404));
    }
    
    // Create JWT token with user ID and 10-minute expiry
    const jwt = (await import('jsonwebtoken')).default;
    const resetToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '10m' }
    );
    
    const resetURL = `${process.env.FRONTEND_URL || 'https://locexcoinp2pauction.com'}/reset-password/${resetToken}`;
    
    const message = `Forgot your password? Use this token to reset: ${resetToken}\n\nOr click this link: ${resetURL}\n\nIf you didn't request this, please ignore this email.`;
    
    try {
      await sendEmail({
        email: user.email,
        subject: 'Password Reset Token (valid for 10 minutes)',
        message,
        resetToken,
        html: `
          <h2>Password Reset Request</h2>
          <p>You requested a password reset. Use this token: <strong>${resetToken}</strong></p>
          <p>Or <a href="${resetURL}">click here to reset your password</a></p>
          <p>This token expires in 10 minutes.</p>
          <p>If you didn't request this, please ignore this email.</p>
        `
      });
      
      res.status(200).json({
        status: 'success',
        message: 'Password reset token sent to email',
        ...((!process.env.EMAIL_USERNAME || !process.env.EMAIL_PASSWORD) && { resetToken })
      });
    } catch (emailError) {
      console.error('Email error:', emailError);
      return next(new AppError('There was an error sending the email. Try again later.', 500));
    }
  } catch (error) {
    next(error);
  }
};

// Reset password
const resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;
    
    // Verify JWT token
    const jwt = (await import('jsonwebtoken')).default;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const user = await User.findById(decoded.userId);
    if (!user) {
      return next(new AppError('Token is invalid or user no longer exists', 400));
    }
    
    user.password = password;
    await user.save();
    
    createSendToken(user, 200, res);
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return next(new AppError('Token is invalid or has expired', 400));
    }
    next(error);
  }
};

// Validate referral link/code
const validateReferralLink = async (req, res, next) => {
  try {
    const { referralCode } = req.params;
    
    const referrer = await User.findOne({ referralCode })
      .select('firstName lastName referralCode');
    
    if (!referrer) {
      return next(new AppError('Invalid referral code', 404));
    }
    
    res.status(200).json({
      status: 'success',
      data: {
        referrer: {
          name: `${referrer.firstName} ${referrer.lastName}`,
          referralCode: referrer.referralCode
        },
        valid: true
      }
    });
  } catch (error) {
    next(error);
  }
};

export { signup, verifyOtp, login, logout, getMe, updateMe, requestReferralBonus, getReferralStatus, getDashboard, validateReferralLink, forgotPassword, resetPassword };
