import mongoose from 'mongoose';

// Admin-defined coin types with price-based categories
const coinSchema = new mongoose.Schema({
  category: {
    type: String,
    enum: ['Category A', 'Category B', 'Category C', 'Category D']
  },
  plan: {
    type: String,
    required: [true, 'Coin must have a plan'],
    enum: ['5days', '10days', '30days']
  },
  basePrice: {
    type: Number,
    required: [true, 'Coin must have a base price']
  },
  profitPercentage: {
    type: Number
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isApproved: {
    type: Boolean,
    default: false
  },
  isInAuction: {
    type: Boolean,
    default: false
  },
  auctionStartDate: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Automatically set category based on basePrice
coinSchema.pre('save', function(next) {
  if (this.basePrice >= 10000 && this.basePrice <= 100000) {
    this.category = 'Category A';
  } else if (this.basePrice > 100000 && this.basePrice <= 250000) {
    this.category = 'Category B';
  } else if (this.basePrice > 250000 && this.basePrice <= 500000) {
    this.category = 'Category C';
  } else if (this.basePrice > 500000 && this.basePrice <= 1000000) {
    this.category = 'Category D';
  }
  next();
});

coinSchema.pre('save', function(next) {
  switch(this.plan) {
    case '5days':
      this.profitPercentage = 53;
      break;

    case '10days':
      this.profitPercentage = 107;
      break;

    case '30days':
      this.profitPercentage = 215;
      break;

    default:
      break;
  }
  next();
});

const Coin = mongoose.model('Coin', coinSchema);
export default Coin;