import cron from 'node-cron';
import UserCoin from '../models/UserCoin.js';
import User from '../models/User.js';

// Clean up expired reservations every minute
const startReservationCleanup = () => {
  cron.schedule('* * * * *', async () => {
    try {
      const expiredCoins = await UserCoin.find({
        reservedBy: { $exists: true },
        reservationExpires: { $lt: new Date() }
      });

      for (const coin of expiredCoins) {
        // Penalize user with 20 points deduction
        const user = await User.findById(coin.reservedBy);
        if (user) {
          await user.reduceCreditScore(20);
        }

        // Return coin to auction
        coin.isInAuction = true;
        coin.reservedBy = undefined;
        coin.reservedAt = undefined;
        coin.reservationExpires = undefined;
        await coin.save();
      }

      if (expiredCoins.length > 0) {
        console.log(`Cleaned up ${expiredCoins.length} expired reservations`);
      }
    } catch (error) {
      console.error('Error cleaning up expired reservations:', error);
    }
  });
};

export default startReservationCleanup;