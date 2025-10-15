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
  isVerified: {
    type: Boolean,
    default: false
  },
  otpHash: String,
  otpExpiry: Date,
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
  referralBonusRequests: [{
    amount: {
      type: Number,
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    },
    requestedAt: {
      type: Date,
      default: Date.now
    },
    processedAt: Date,
    processedBy: {
      type: mongoose.Schema.ObjectId,
      ref: 'User'
    }
  }],
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
  usdtWallet: {
    type: String
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

// Calculate total portfolio value (same as balance since it includes everything)
userSchema.methods.calculateTotalBalance = async function() {
  return this.balance;
};

// Update balance to reflect total coin values + referral earnings
userSchema.methods.updateBalance = async function() {
  const UserCoin = mongoose.model('UserCoin');
  const userCoins = await UserCoin.find({ owner: this._id, status: { $ne: 'sold' } });
  
  let totalCoinValue = 0;
  for (const coin of userCoins) {
    const currentValue = coin.calculateCurrentValue();
    totalCoinValue += currentValue;
  }
  
  // Balance = total current value of all coins + referral earnings
  this.balance = totalCoinValue + this.referralEarnings;
  await this.save();
  
  return this.balance;
};

// Update daily profits for all user coins
userSchema.methods.updateDailyProfits = async function() {
  const UserCoin = mongoose.model('UserCoin');
  const userCoins = await UserCoin.find({ 
    owner: this._id, 
    status: { $in: ['locked', 'available'] },
    isApproved: true
  });
  
  let totalDailyProfit = 0;
  const now = new Date();
  
  for (const coin of userCoins) {
    let timeSinceLastUpdate, profitRate, profit;
    
    if (coin.plan === '3mins') {
      const minutesSinceLastUpdate = Math.floor((now - coin.lastProfitUpdate) / (1000 * 60));
      if (minutesSinceLastUpdate >= 1) {
        const minuteProfitRate = coin.profitPercentage / 3 / 100;
        profit = coin.currentPrice * minuteProfitRate * minutesSinceLastUpdate;
        totalDailyProfit += profit;
        coin.lastProfitUpdate = now;
        await coin.save();
      }
    } else {
      const daysSinceLastUpdate = Math.floor((now - coin.lastProfitUpdate) / (1000 * 60 * 60 * 24));
      if (daysSinceLastUpdate >= 1 && coin.plan) {
        const planDays = parseInt(coin.plan.replace('days', ''));
        const dailyProfitRate = coin.profitPercentage / planDays / 100;
        profit = coin.currentPrice * dailyProfitRate * daysSinceLastUpdate;
        totalDailyProfit += profit;
        coin.lastProfitUpdate = now;
        await coin.save();
      }
    }
  }
  
  // Update balance to reflect new profits
  await this.updateBalance();
  
  return totalDailyProfit;
};

const User = mongoose.model('User', userSchema);
export default User;