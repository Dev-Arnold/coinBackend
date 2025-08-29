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

// Calculate total portfolio value including coins
userSchema.methods.calculateTotalBalance = async function() {
  const UserCoin = mongoose.model('UserCoin');
  const userCoins = await UserCoin.find({ owner: this._id, status: { $ne: 'sold' } });
  
  let totalCoinValue = 0;
  for (const coin of userCoins) {
    const currentValue = await coin.calculateCurrentValue();
    totalCoinValue += currentValue;
  }
  
  return this.balance + totalCoinValue;
};

// Update balance to reflect total value (referrals + coin profits)
userSchema.methods.updateBalance = async function() {
  const UserCoin = mongoose.model('UserCoin');
  const userCoins = await UserCoin.find({ owner: this._id, status: { $ne: 'sold' } });
  
  let totalCoinValue = 0;
  for (const coin of userCoins) {
    const profitInfo = await coin.getProfitInfo();
    totalCoinValue += profitInfo.profit; // Only add the profit, not the full value
  }
  
  // Balance = referral earnings + coin profits
  this.balance = this.referralEarnings + totalCoinValue;
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
    const daysSinceLastUpdate = Math.floor((now - coin.lastProfitUpdate) / (1000 * 60 * 60 * 24));
    
    if (daysSinceLastUpdate >= 1) {
      const planDays = parseInt(coin.plan.replace('days', ''));
      const dailyProfitRate = coin.profitPercentage / planDays / 100;
      const dailyProfit = coin.currentPrice * dailyProfitRate * daysSinceLastUpdate;
      
      totalDailyProfit += dailyProfit;
      
      // Update last profit update date
      coin.lastProfitUpdate = now;
      await coin.save();
    }
  }
  
  // Update balance to reflect new profits
  await this.updateBalance();
  
  return totalDailyProfit;
};

const User = mongoose.model('User', userSchema);
export default User;