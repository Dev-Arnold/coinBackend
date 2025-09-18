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
    enum: ['3mins','5days', '10days', '30days']
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
  reservedBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  },
  reservedAt: Date,
  reservationExpires: Date,
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
  if (this.isNew || this.isModified('plan')) {
    switch(this.plan) {
      case '3mins':
        this.profitPercentage = 35;
        break;
      case '5days':
        this.profitPercentage = 35;
        break;
      case '10days':
        this.profitPercentage = 107;
        break;
      case '30days':
        this.profitPercentage = 161;
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

  const startDate = this.purchaseDate || this.createdAt;
  if (!startDate) {
    console.log('No start date found, returning currentPrice');
    return this.currentPrice;
  }
  
  const now = Date.now();
  console.log('startDate timestamp:', startDate.getTime());
  console.log('now timestamp:', now);
  console.log('time difference (ms):', now - startDate.getTime());
  
  let timeHeld, planDuration, growth;
  
  if (this.plan === '3mins') {
    timeHeld = Math.floor((now - startDate.getTime()) / (1000 * 60));
    planDuration = 3;
    timeHeld = Math.min(timeHeld, planDuration);
    growth = this.profitPercentage / planDuration / 100;
    const result = Math.floor(this.currentPrice * (1 + (growth * timeHeld)));
    return result;
  } else {
    timeHeld = Math.floor((now - startDate.getTime()) / (1000 * 60 * 60 * 24));
    planDuration = parseInt(this.plan.replace('days', ''));
    timeHeld = Math.min(timeHeld, planDuration);
    const dailyGrowth = this.profitPercentage / planDuration / 100;
    const result = Math.floor(this.currentPrice * (1 + (dailyGrowth * timeHeld)));
    return result;
  }
};

// Check if coin has matured (completed its plan duration)
userCoinSchema.methods.hasMatured = function() {
  // Bonus coins are instantly matured
  if (this.isBonusCoin) return true;
  
  const startDate = this.purchaseDate || this.createdAt;
  if (!startDate) return false;
  
  if (this.plan === '3mins') {
    const minutesHeld = Math.floor((Date.now() - startDate) / (1000 * 60));
    return minutesHeld >= 3;
  } else {
    const daysHeld = Math.floor((Date.now() - startDate) / (1000 * 60 * 60 * 24));
    const planDays = parseInt(this.plan.replace('days', ''));
    return daysHeld >= planDays;
  }
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