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
  // User registration validation
  register: Joi.object({
    firstName: Joi.string().min(2).max(50).required(),
    lastName: Joi.string().min(2).max(50).required(),
    email: Joi.string().email().required(),
    phone: Joi.string().min(10).max(15).required(),
    password: Joi.string().min(6).required(),
    referralCode: Joi.string().optional()
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
    }).optional(),
    address: Joi.object({
      street: Joi.string().optional(),
      city: Joi.string().optional(),
      state: Joi.string().optional(),
      country: Joi.string().optional(),
      postalCode: Joi.string().optional()
    }).optional()
  }),

  // Admin coin creation validation
  createCoin: Joi.object({
    name: Joi.string().required(),
    description: Joi.string().required(),
    plan: Joi.string().valid('5days', '10days', '30days').required(),
    basePrice: Joi.number().min(10000).max(1000000).required(),
    profitPercentage: Joi.number().positive().required()
  }),

  // Assign coin to user validation
  assignCoin: Joi.object({
    userId: Joi.string().required(),
    coinId: Joi.string().required(),
    currentPrice: Joi.number().positive().optional()
  }),

  // Bid validation
  placeBid: Joi.object({
    coinId: Joi.string().required(),
    paymentMethod: Joi.string().valid('bank_transfer', 'cryptocurrency').required()
  }),

  // KYC submission validation
  submitKyc: Joi.object({
    fullName: Joi.string().min(2).max(100).required(),
    idCardType: Joi.string().valid('national_id', 'passport', 'drivers_license').required()
  }),

  // KYC review validation
  reviewKyc: Joi.object({
    action: Joi.string().valid('approve', 'reject').required(),
    rejectionReason: Joi.string().when('action', {
      is: 'reject',
      then: Joi.required(),
      otherwise: Joi.optional()
    })
  })
};

export { validateRequest, schemas };