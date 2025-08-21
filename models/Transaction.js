import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  buyer: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  },
  seller: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  },
  coin: {
    type: mongoose.Schema.ObjectId,
    ref: 'Coin',
    required: true
  },
  userCoin: {
    type: mongoose.Schema.ObjectId,
    ref: 'UserCoin'
  },
  amount: {
    type: Number,
    required: true
  },
  plan: {
    type: String,
    enum: ['5days', '10days', '30days'],
    required: true
  },
  paymentMethod: {
    type: String,
    enum: ['bank_transfer', 'cryptocurrency'],
    required: true
  },
  paymentProof: {
    type: String // File path to uploaded proof
  },
  status: {
    type: String,
    enum: ['pending_payment', 'payment_uploaded', 'confirmed', 'failed', 'cancelled'],
    default: 'pending_payment'
  },
  paymentDeadline: {
    type: Date,
    required: true
  },
  referralCommission: {
    amount: Number,
    paidTo: {
      type: mongoose.Schema.ObjectId,
      ref: 'User'
    }
  },
  auctionSession: {
    type: mongoose.Schema.ObjectId,
    ref: 'AuctionSession'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  completedAt: Date
});

// Check if payment deadline has passed
transactionSchema.methods.isPaymentExpired = function() {
  return new Date() > this.paymentDeadline;
};

// Calculate referral commission for first-time buyers
transactionSchema.methods.calculateReferralCommission = function() {
  if (this.referralCommission) return this.referralCommission.amount;
  
  const commissionRate = process.env.REFERRAL_COMMISSION_PERCENT / 100;
  return Math.floor(this.amount * commissionRate);
};

const Transaction = mongoose.model('Transaction', transactionSchema);
export default Transaction;