import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import { createSendToken } from '../utils/generateToken.js';

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
        referrer.balance += parseInt(process.env.REFERRAL_BONUS);
        referrer.referralEarnings += parseInt(process.env.REFERRAL_BONUS);
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
    
    res.status(200).json({
      status: 'success',
      data: {
        user
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

export { register, login, logout, getMe, updateMe };