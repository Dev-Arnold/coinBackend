import User from '../models/User.js';
import UserCoin from '../models/UserCoin.js';
import Transaction from '../models/Transaction.js';
import AuctionSession from '../models/AuctionSession.js';
import fs from 'fs';
import path from 'path';
import AppError from '../utils/AppError.js';

const createBackup = async (req, res, next) => {
  try {
    const backupData = {
      timestamp: new Date().toISOString(),
      users: await User.find({}).lean(),
      userCoins: await UserCoin.find({}).lean(),
      transactions: await Transaction.find({}).lean(),
      auctionSessions: await AuctionSession.find({}).lean()
    };

    const backupDir = 'backups';
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir);
    }

    const filename = `backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const filepath = path.join(backupDir, filename);
    
    fs.writeFileSync(filepath, JSON.stringify(backupData, null, 2));

    res.status(200).json({
      status: 'success',
      message: 'Backup created successfully',
      data: {
        filename,
        filepath,
        collections: {
          users: backupData.users.length,
          userCoins: backupData.userCoins.length,
          transactions: backupData.transactions.length,
          auctionSessions: backupData.auctionSessions.length
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

const restoreFromBackup = async (req, res, next) => {
  try {
    const { filename } = req.body;
    
    if (!filename) {
      return next(new AppError('Backup filename is required', 400));
    }

    const backupPath = path.join('backups', filename);
    
    if (!fs.existsSync(backupPath)) {
      return next(new AppError('Backup file not found', 404));
    }

    // Read backup file
    const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    
    // Clear existing data (WARNING: This deletes everything!)
    await User.deleteMany({});
    await UserCoin.deleteMany({});
    await Transaction.deleteMany({});
    await AuctionSession.deleteMany({});

    // Restore data
    const results = {};
    
    if (backupData.users?.length > 0) {
      await User.insertMany(backupData.users);
      results.users = backupData.users.length;
    }
    
    if (backupData.userCoins?.length > 0) {
      await UserCoin.insertMany(backupData.userCoins);
      results.userCoins = backupData.userCoins.length;
    }
    
    if (backupData.transactions?.length > 0) {
      await Transaction.insertMany(backupData.transactions);
      results.transactions = backupData.transactions.length;
    }
    
    if (backupData.auctionSessions?.length > 0) {
      await AuctionSession.insertMany(backupData.auctionSessions);
      results.auctionSessions = backupData.auctionSessions.length;
    }

    res.status(200).json({
      status: 'success',
      message: 'Database restored successfully from backup',
      data: {
        backupTimestamp: backupData.timestamp,
        restoredCollections: results
      }
    });
  } catch (error) {
    next(error);
  }
};

export { createBackup, restoreFromBackup };