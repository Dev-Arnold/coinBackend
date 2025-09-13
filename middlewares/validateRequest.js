import Joi from 'joi';
import AppError from '../utils/AppError.js';

// Wrapper function to validate request data using Joi schemas
const validateRequest = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    
    if (error) {
      const errorMessage = error.details.map(detail => detail.message).join(', ');
      return next(new AppError(errorMessage, 400));
    }
    
    next();
  };
};

// Common validation schemas
const schemas = {
  // User signup validation
  signup: Joi.object({
    firstName: Joi.string().min(2).max(50).required(),
    lastName: Joi.string().min(2).max(50).required(),
    email: Joi.string().min(2).max(50).required(),
    phone: Joi.string().min(10).max(15).required(),
    password: Joi.string().min(6).required(),
    referralCode:Joi.string().min(6).optional(),
  }),

  // Verify OTP validation
  verifyOtp: Joi.object({
    phone: Joi.string().min(10).max(15).required(),
    otp: Joi.string().length(6).required()
  }),

  // User login validation
  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  }),

  // Update user profile validation
  updateProfile: Joi.object({
    firstName: Joi.string().min(2).max(50).optional(),
    lastName: Joi.string().min(2).max(50).optional(),
    phone: Joi.string().min(10).max(15).optional(),
    bankDetails: Joi.object({
      accountName: Joi.string().required(),
      accountNumber: Joi.string().required(),
      bankName: Joi.string().required()
    }).optional()
  }),

  // Assign coin to user validation
  assignCoin: Joi.object({
    plan: Joi.string().valid('3mins', '5days', '10days', '30days').required(),
    currentPrice: Joi.number().min(10000).max(1000000).required(),
    isBonusCoin: Joi.boolean().optional()
  }),

  // Bid validation
  placeBid: Joi.object({
    coinId: Joi.string().required(),
    paymentMethod: Joi.string().valid('bank_transfer', 'cryptocurrency').required()
  }),

  // Submit bid with proof validation
  submitBid: Joi.object({
    coinId: Joi.string().required(),
    plan: Joi.string().valid('3mins', '5days', '10days', '30days').required(),
    paymentMethod: Joi.string().valid('bank_transfer', 'cryptocurrency').required()
  }),

  // Reserve coin validation
  reserveCoin: Joi.object({
    coinId: Joi.string().required(),
    plan: Joi.string().valid('3mins', '5days', '10days', '30days').required()
  }),

  // Submit bid with proof validation
  submitBidWithProof: Joi.object({
    coinId: Joi.string().required(),
    plan: Joi.string().valid('3mins', '5days', '10days', '30days').required(),
    paymentMethod: Joi.string().valid('bank_transfer', 'cryptocurrency').required()
  }),

  // Send OTP validation
  sendOTP: Joi.object({
    phone: Joi.string().required()
  }),

  // Verify OTP validation
  verifyOTP: Joi.object({
    phone: Joi.string().required(),
    pin: Joi.string().length(6).required()
  })
};

export { validateRequest, schemas };