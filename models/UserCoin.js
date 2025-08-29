import mongoose from 'mongoose';

// User's purchased coins
const userCoinSchema = new mongoose.Schema({
  category: {
    type: String,
    enum: ['Category A', 'Category B', 'Category C', 'Category D'],
    required: [true, 'UserCoin must have a category']
  },
  plan: {
    type: String,
    required: [true, 'UserCoin must have a plan'],
    enum: ['5days', '10days', '30days']
  },
  profitPercentage: {
    type: Number,
    required: [true, 'UserCoin must have profit percentage']
  },
  owner: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'UserCoin must have an owner']
  },
  seller: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  },
  boughtFrom: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  },
  purchaseDate: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['available', 'sold', 'locked', 'pending_payment', 'matured', 'pending_approval'],
    default: 'locked'
  },
  isLocked: {
    type: Boolean,
    default: true
  },
  lockExpiresAt: Date,
  currentPrice: {
    type: Number,
    required: [true, 'UserCoin must have a current price']
  },
  isApproved: {
    type: Boolean,
    default: false
  },
  isInAuction: {
    type: Boolean,
    default: false
  },
  isBonusCoin: {
    type: Boolean,
    default: false
  },
  lastProfitUpdate: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Set profit percentage based on plan
userCoinSchema.pre('save', function(next) {
  if (this.isModified('plan')) {
    switch(this.plan) {
      case '5days':
        this.profitPercentage = 35;
        break;
      case '10days':
        this.profitPercentage = 107;
        break;
      case '30days':
        this.profitPercentage = 215;
        break;
    }
  }
  
  // Set category based on current price
  if (this.isModified('currentPrice')) {
    if (this.currentPrice >= 10000 && this.currentPrice <= 100000) {
      this.category = 'Category A';
    } else if (this.currentPrice > 100000 && this.currentPrice <= 250000) {
      this.category = 'Category B';
    } else if (this.currentPrice > 250000 && this.currentPrice <= 500000) {
      this.category = 'Category C';
    } else if (this.currentPrice > 500000 && this.currentPrice <= 1000000) {
      this.category = 'Category D';
    }
  }
  
  next();
});

// Calculate current value based on plan and profit percentage
userCoinSchema.methods.calculateCurrentValue = function() {
  if (!this.purchaseDate) return this.currentPrice;
  
  const daysHeld = Math.floor((Date.now() - this.purchaseDate) / (1000 * 60 * 60 * 24));
  const planDays = parseInt(this.plan.replace('days', ''));
  const dailyGrowth = this.profitPercentage / planDays / 100;
  
  return Math.floor(this.currentPrice * (1 + (dailyGrowth * daysHeld)));
};

// Check if coin has matured (completed its plan days)
userCoinSchema.methods.hasMatured = function() {
  // Bonus coins are instantly matured
  if (this.isBonusCoin) return true;
  
  if (!this.purchaseDate) return false;
  
  const daysHeld = Math.floor((Date.now() - this.purchaseDate) / (1000 * 60 * 60 * 24));
  const planDays = parseInt(this.plan.replace('days', ''));
  
  return daysHeld >= planDays;
};

// Get profit information
userCoinSchema.methods.getProfitInfo = function() {
  const currentValue = this.calculateCurrentValue();
  const profit = currentValue - this.currentPrice;
  const profitPercentage = ((profit / this.currentPrice) * 100).toFixed(2);
  const isMatured = this.hasMatured();
  
  return {
    currentValue,
    profit,
    profitPercentage,
    isMatured,
    isBonusCoin: this.isBonusCoin,
    canSell: isMatured && !this.isLocked
  };
};

const UserCoin = mongoose.model('UserCoin', userCoinSchema);
export default UserCoin;