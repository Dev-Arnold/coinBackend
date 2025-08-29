import User from '../models/User.js';
import cron from 'node-cron';

// Update daily profits for all users
const updateAllUserProfits = async () => {
  try {
    console.log('🔄 Starting daily profit update for all users...');
    
    const users = await User.find({ role: 'user', isBlocked: false });
    let totalUsersUpdated = 0;
    let totalProfitAdded = 0;
    
    for (const user of users) {
      const dailyProfit = await user.updateDailyProfits();
      if (dailyProfit > 0) {
        totalUsersUpdated++;
        totalProfitAdded += dailyProfit;
      }
    }
    
    console.log(`✅ Daily profit update completed: ${totalUsersUpdated} users updated, ₦${totalProfitAdded.toLocaleString()} total profit added`);
    
    return {
      success: true,
      usersUpdated: totalUsersUpdated,
      totalProfitAdded
    };
  } catch (error) {
    console.error('❌ Error updating daily profits:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Schedule daily profit updates at midnight
const scheduleDailyProfitUpdates = () => {
  // Run every day at midnight (00:00)
  cron.schedule('0 0 * * *', async () => {
    await updateAllUserProfits();
  }, {
    timezone: 'Africa/Lagos'
  });
  
  console.log('📅 Daily profit update scheduler initialized');
};

export { updateAllUserProfits, scheduleDailyProfitUpdates };