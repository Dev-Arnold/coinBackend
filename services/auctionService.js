import UserCoin from '../models/UserCoin.js';
import mongoose from 'mongoose';

// Release coins to auction by category
const releaseCoinsToAuction = async (auctionSessionId = null) => {
  try {
    console.log('🔍 Starting coin release process...');
    
    // Check database connection
    if (mongoose.connection.readyState !== 1) {
      console.log('❌ Database not connected, readyState:', mongoose.connection.readyState);
      return {
        success: false,
        message: 'Database connection not ready',
        results: {},
        coinIds: []
      };
    }
    
    console.log('✅ Database connection confirmed');
    
    // Check user coins
    const totalUserCoins = await UserCoin.countDocuments().maxTimeMS(5000);
    const approvedUserCoins = await UserCoin.countDocuments({ 
      isApproved: true, 
      isInAuction: false, 
      // isLocked: false 
    }).maxTimeMS(5000);
    
    console.log(`📊 User coins: ${totalUserCoins} (${approvedUserCoins} available for auction)`);
    
    if (totalUserCoins === 0) {
      return {
        success: false,
        message: 'No coins found in database.',
        results: {},
        coinIds: []
      };
    }
    
    if (approvedUserCoins === 0) {
      return {
        success: false,
        message: 'No coins available for auction.',
        results: {},
        coinIds: []
      };
    }

    const categories = ['Category A', 'Category B', 'Category C', 'Category D'];
    const results = {};
    const allReleasedCoinIds = [];
    
    for (const category of categories) {
      console.log(`🔍 Checking ${category}...`);
      
      // Find user coins for this category (must be unlocked, approved, and not in auction)
      const userCoinsToRelease = await UserCoin.find({
        category,
        isApproved: true,
        isInAuction: false,
        isLocked: false
      })
      .limit(50)
      .maxTimeMS(5000);

      console.log(`📋 Found ${userCoinsToRelease.length} user coins in ${category}`);

      let categoryCount = 0;

      // Release user coins
      if (userCoinsToRelease.length > 0) {
        const userCoinIds = userCoinsToRelease.map(uc => uc._id);
        
        await UserCoin.updateMany(
          { _id: { $in: userCoinIds } },
          { isInAuction: true }
        ).maxTimeMS(5000);

        allReleasedCoinIds.push(...userCoinIds);
        categoryCount += userCoinsToRelease.length;
      }

      results[category] = categoryCount;
      console.log(`✅ Released ${categoryCount} coins from ${category}`);
    }

    const totalReleased = Object.values(results).reduce((sum, count) => sum + count, 0);
    
    if (totalReleased === 0) {
      return {
        success: false,
        message: 'No coins were released to auction. Check coin approval status.',
        results,
        coinIds: []
      };
    }

    return {
      success: true,
      message: `Successfully released ${totalReleased} coins to auction`,
      results,
      coinIds: allReleasedCoinIds
    };
  } catch (error) {
    console.error('❌ Error in releaseCoinsToAuction:', error);
    return {
      success: false,
      message: 'Error releasing coins to auction',
      error: error.message,
      coinIds: []
    };
  }
};

// Get auction statistics
const getAuctionStats = async () => {
  try {
    const stats = {};
    const categories = ['Category A', 'Category B', 'Category C', 'Category D'];

    for (const category of categories) {
      // User coins stats
      const totalUserCoins = await UserCoin.countDocuments({ category });
      const approvedUserCoins = await UserCoin.countDocuments({ category, isApproved: true });
      const userCoinsInAuction = await UserCoin.countDocuments({ category, isInAuction: true });
      const availableUserCoins = await UserCoin.countDocuments({ 
        category, 
        isApproved: true, 
        isInAuction: false,
        isLocked: false
      });

      stats[category] = {
        userCoins: {
          total: totalUserCoins,
          approved: approvedUserCoins,
          inAuction: userCoinsInAuction,
          availableForAuction: availableUserCoins
        },
        totalInAuction: userCoinsInAuction,
        totalAvailable: availableUserCoins
      };
    }

    return stats;
  } catch (error) {
    throw new Error('Error getting auction statistics: ' + error.message);
  }
};

export { releaseCoinsToAuction, getAuctionStats };