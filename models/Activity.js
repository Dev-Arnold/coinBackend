import mongoose from 'mongoose';

const activitySchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['coin_bought', 'coin_released', 'auction_started', 'auction_ended', 'user_registered'],
    required: true
  },
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  },
  description: {
    type: String,
    required: true
  },
  amount: Number,
  coinId: {
    type: mongoose.Schema.ObjectId,
    ref: 'UserCoin'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Activity = mongoose.model('Activity', activitySchema);
export default Activity;