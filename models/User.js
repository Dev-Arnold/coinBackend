import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: [true, 'Please provide your firstname'],
    trim: true
  },
  lastName: {
    type: String,
    required: [true, 'Please provide your lastname'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Please provide your email'],
    unique: true,
    lowercase: true
  },
  phone: {
    type: String,
    required: [true, 'Please provide your phone number']
  },
  password: {
    type: String,
    required: [true, 'Please provide a password'],
    minlength: 6,
    select: false
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  balance: {
    type: Number,
    default: 0
  },
  creditScore: {
    type: Number,
    default: 100,
    min: 0,
    max: 100
  },
  isBlocked: {
    type: Boolean,
    default: false
  },
  referralCode: {
    type: String,
    unique: true
  },
  referredBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  },
  referralEarnings: {
    type: Number,
    default: 0
  },
  bankDetails: {
    accountName: {
      type: String,
      trim: true
    },
    accountNumber: {
      type: String,
      match: [/^\d{10}$/, "Account number must be 10 digits"]
    },
    bankName: {
      type: String,
      trim: true
    }
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  kycStatus: {
    type: String,
    enum: ['not_submitted', 'pending', 'verified', 'rejected'],
    default: 'not_submitted'
  },
  address: {
    street: String,
    city: String,
    state: String,
    country: String,
    postalCode: String
  },
  kyc: {
    fullName: String,
    idCardType: {
      type: String,
      enum: ['national_id', 'passport', 'drivers_license']
    },
    idCardImage: String,
    proofOfAddress: String,
    submittedAt: Date,
    rejectionReason: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Generate referral code before saving
userSchema.pre('save', function(next) {
  if (!this.referralCode) {
    this.referralCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  }
  next();
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password method
userSchema.methods.correctPassword = async function(candidatePassword, userPassword) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

// Reduce credit score method
userSchema.methods.reduceCreditScore = function(points = 10) {
  this.creditScore = Math.max(0, this.creditScore - points);
  if (this.creditScore <= 30) {
    this.isBlocked = true;
  }
  return this.save();
};

const User = mongoose.model('User', userSchema);
export default User;