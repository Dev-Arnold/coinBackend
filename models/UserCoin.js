import mongoose from 'mongoose';

// User's purchased coins (instances of admin-defined coins)
const userCoinSchema = new mongoose.Schema({
  coin: {
    type: mongoose.Schema.ObjectId,
    ref: 'Coin',
    required: [true, 'UserCoin must reference a Coin']
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
  purchaseDate: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['available', 'sold', 'locked', 'pending_payment'],
    default: 'available'
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
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Calculate current value based on linked coin's plan and profit percentage
userCoinSchema.methods.calculateCurrentValue = async function() {
  // Populate the linked coin to get plan and profitPercentage
  await this.populate('coin');
  
  if (!this.purchaseDate || !this.coin) return this.currentPrice;
  
  const daysHeld = Math.floor((Date.now() - this.purchaseDate) / (1000 * 60 * 60 * 24));
  const planDays = parseInt(this.coin.plan.replace('days', ''));
  const dailyGrowth = this.coin.profitPercentage / planDays / 100;
  
  return Math.floor(this.currentPrice * (1 + (dailyGrowth * daysHeld)));
};

// Get profit information
userCoinSchema.methods.getProfitInfo = async function() {
  const currentValue = await this.calculateCurrentValue();
  const profit = currentValue - this.currentPrice;
  const profitPercentage = ((profit / this.currentPrice) * 100).toFixed(2);
  
  return {
    currentValue,
    profit,
    profitPercentage
  };
};

const UserCoin = mongoose.model('UserCoin', userCoinSchema);
export default UserCoin;