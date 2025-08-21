import Coin from '../models/Coin.js';
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
    
    // First check if we have any coins at all
    const totalCoins = await Coin.countDocuments().maxTimeMS(5000);
    const approvedCoins = await Coin.countDocuments({ isApproved: true }).maxTimeMS(5000);
    const availableCoins = await Coin.countDocuments({ isApproved: true, isInAuction: false }).maxTimeMS(5000);
    
    console.log(`📊 Database status: Total coins: ${totalCoins}, Approved: ${approvedCoins}, Available: ${availableCoins}`);
    
    if (totalCoins === 0) {
      return {
        success: false,
        message: 'No coins found in database. Please create some coins first.',
        results: {},
        coinIds: []
      };
    }
    
    if (approvedCoins === 0) {
      return {
        success: false,
        message: 'No approved coins found. Please approve some coins first.',
        results: {},
        coinIds: []
      };
    }
    
    if (availableCoins === 0) {
      return {
        success: false,
        message: 'No coins available for auction. All approved coins are already in auction.',
        results: {},
        coinIds: []
      };
    }

    const categories = ['Category A', 'Category B', 'Category C', 'Category D'];
    const results = {};
    const allReleasedCoinIds = [];
    
    for (const category of categories) {
      console.log(`🔍 Checking ${category}...`);
      
      // Find up to 100 approved coins not in auction for this category
      const coinsToRelease = await Coin.find({
        category,
        isApproved: true,
        isInAuction: false
      }).limit(100).maxTimeMS(5000);

      console.log(`📋 Found ${coinsToRelease.length} coins in ${category}`);

      if (coinsToRelease.length > 0) {
        const coinIds = coinsToRelease.map(coin => coin._id);
        
        // Mark coins as in auction
        await Coin.updateMany(
          { _id: { $in: coinIds } },
          { 
            isInAuction: true,
            auctionStartDate: new Date()
          }
        ).maxTimeMS(5000);

        allReleasedCoinIds.push(...coinIds);
        results[category] = coinsToRelease.length;
        console.log(`✅ Released ${coinsToRelease.length} coins from ${category}`);
      } else {
        results[category] = 0;
      }
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
      const totalCoins = await Coin.countDocuments({ category });
      const approvedCoins = await Coin.countDocuments({ category, isApproved: true });
      const inAuction = await Coin.countDocuments({ category, isInAuction: true });
      const availableForAuction = await Coin.countDocuments({ 
        category, 
        isApproved: true, 
        isInAuction: false 
      });

      stats[category] = {
        total: totalCoins,
        approved: approvedCoins,
        inAuction,
        availableForAuction
      };
    }

    return stats;
  } catch (error) {
    throw new Error('Error getting auction statistics: ' + error.message);
  }
};

export { releaseCoinsToAuction, getAuctionStats };