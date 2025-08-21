import mongoose from 'mongoose';

const auctionSessionSchema = new mongoose.Schema({
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date,
    required: true
  },
  isActive: {
    type: Boolean,
    default: false
  },
  coins: [{
    type: mongoose.Schema.ObjectId,
    ref: 'Coin'
  }],
  participants: [{
    user: {
      type: mongoose.Schema.ObjectId,
      ref: 'User'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],
  totalBids: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Check if auction is currently active
auctionSessionSchema.methods.isCurrentlyActive = function() {
  const now = new Date();
  return now >= this.startTime && now <= this.endTime && this.isActive;
};

// Auto-cleanup expired auctions
auctionSessionSchema.statics.cleanupExpiredAuctions = async function() {
  const now = new Date();
  const result = await this.updateMany(
    { 
      isActive: true,
      endTime: { $lt: now }
    },
    { 
      isActive: false 
    }
  );
  return result.modifiedCount;
};

// Get next auction time
auctionSessionSchema.statics.getNextAuctionTime = function() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  // Auction times: 9:00 AM and 6:30 PM WAT (Monday-Saturday), 6:30 PM WAT (Sunday)
  const morningTime = new Date(today.getTime() + 9 * 60 * 60 * 1000); // 9:00 AM
  const eveningTime = new Date(today.getTime() + 18.5 * 60 * 60 * 1000); // 6:30 PM
  
  const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
  
  if (dayOfWeek === 0) { // Sunday
    if (now < eveningTime) {
      return eveningTime;
    } else {
      // Next auction is Monday 9:00 AM
      const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
      return new Date(tomorrow.getTime() + 9 * 60 * 60 * 1000);
    }
  } else { // Monday-Saturday
    if (now < morningTime) {
      return morningTime;
    } else if (now < eveningTime) {
      return eveningTime;
    } else {
      // Next auction is tomorrow 9:00 AM (or Sunday 6:30 PM if today is Saturday)
      const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
      if (dayOfWeek === 6) { // Saturday
        return new Date(tomorrow.getTime() + 18.5 * 60 * 60 * 1000); // Sunday 6:30 PM
      } else {
        return new Date(tomorrow.getTime() + 9 * 60 * 60 * 1000); // Tomorrow 9:00 AM
      }
    }
  }
};

const AuctionSession = mongoose.model('AuctionSession', auctionSessionSchema);
export default AuctionSession;