import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import cron from 'node-cron';
import dotenv from 'dotenv';
dotenv.config();

// Import configurations and middleware
import connectDB from './config/db.js';
import globalErrorHandler from './middlewares/errorMiddleware.js';
import AppError from './utils/AppError.js';

// Import routes
import authRoutes from './routes/authRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import auctionRoutes from './routes/auctionRoutes.js';
import coinRoutes from './routes/coinRoutes.js';
import kycRoutes from './routes/kycRoutes.js';
import messageRoutes from "./routes/messageRoutes.js";

// Import models for auction scheduling
import AuctionSession from './models/AuctionSession.js';
import Coin from './models/Coin.js';
import UserCoin from './models/UserCoin.js';
import User from './models/User.js';
import { releaseCoinsToAuction } from './services/auctionService.js';
import startReservationCleanup from './utils/reservationCleanup.js';

// Create Express app
const app = express();

// Connect to database
const startServer = async () => {
  try {
    await connectDB();
    console.log('✅ Database connected successfully');
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    process.exit(1);
  }
};

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true,
  optionsSuccessStatus: 200
}));

// Development logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Serve static files
// app.use('/uploads', express.static('uploads'));

// Create uploads directories if they don't exist
// import { mkdir } from 'fs/promises';
// try {
//   await mkdir('uploads/payment-proofs', { recursive: true });
//   await mkdir('uploads/kyc-documents', { recursive: true });
// } catch (error) {
//   console.log('Uploads directories already exist');
// }

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/auction', auctionRoutes);
app.use('/api/coins', coinRoutes);
app.use('/api/kyc', kycRoutes);
app.use("/api/messages", messageRoutes);

// Health check route
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Coin Auction API is running!',
    timestamp: new Date().toISOString()
  });
});

// Handle undefined routes
app.all('*', (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// Global error handling middleware
app.use(globalErrorHandler);

// Auction scheduling functions
const createAuctionSession = async (startTime, endTime) => {
  try {
    // Wait for database to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const releaseResult = await releaseCoinsToAuction();
    
    if (!releaseResult.success) {
      console.log('No coins released for auction:', releaseResult.message);
      return;
    }

    // Create auction session
    const auction = await AuctionSession.create({
      startTime,
      endTime,
      isActive: true
    });

    const totalReleased = Object.values(releaseResult.results).reduce((sum, count) => sum + count, 0);
    console.log(`Auction session created: ${auction._id}`);
    console.log('Coins released by category:', releaseResult.results);
    console.log(`Total coins in auction: ${totalReleased}`);
  } catch (error) {
    console.error('Error creating auction session:', error);
  }
};

const endAuctionSession = async () => {
  try {
    const activeAuction = await AuctionSession.findOne({ isActive: true });
    
    if (activeAuction) {
      activeAuction.isActive = false;
      await activeAuction.save();

      // End auction - coins remain in auction until sold or manually removed
      console.log('Auction ended - coins remain available for bidding');

      console.log(`Auction session ended: ${activeAuction._id}`);
    }
  } catch (error) {
    console.error('Error ending auction session:', error);
  }
};

// Schedule auctions
// Monday-Saturday: 9:00 AM and 6:30 PM WAT
cron.schedule('0 9 * * 1-6', async () => {
  console.log('Starting morning auction (9:00 AM WAT)');
  const startTime = new Date();
  const endTime = new Date(startTime.getTime() + 30 * 60 * 1000); // 30 minutes
  await createAuctionSession(startTime, endTime);
});

cron.schedule('30 18 * * 1-6', async () => {
  console.log('Starting evening auction (6:30 PM WAT)');
  const startTime = new Date();
  const endTime = new Date(startTime.getTime() + 30 * 60 * 1000); // 30 minutes
  await createAuctionSession(startTime, endTime);
});

// Sunday: 6:30 PM WAT only
cron.schedule('30 18 * * 0', async () => {
  console.log('Starting Sunday auction (6:30 PM WAT)');
  const startTime = new Date();
  const endTime = new Date(startTime.getTime() + 30 * 60 * 1000); // 30 minutes
  await createAuctionSession(startTime, endTime);
});

// End auctions after 30 minutes
cron.schedule('30 9 * * 1-6', endAuctionSession); // End morning auction
cron.schedule('0 19 * * *', endAuctionSession); // End evening/Sunday auction

// Create admin user on startup
const createAdminUser = async () => {
  try {
    const adminExists = await User.findOne({ email: process.env.ADMIN_EMAIL });
    
    if (!adminExists) {
      await User.create({
        firstName: 'Admin',
        lastName: 'User',
        email: process.env.ADMIN_EMAIL,
        phone: '1234567890',
        password: process.env.ADMIN_PASSWORD,
        role: 'admin',
        isVerified: true,
        kycStatus: 'verified'
      });
      console.log('Admin user created successfully');
    }
  } catch (error) {
    console.error('Error creating admin user:', error);
  }
};

// Start server
const port = process.env.PORT || 2500;

startServer().then(() => {
  app.listen(port, async () => {
    console.log(`🚀 Server running on port ${port}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV}`);
    
    // Start reservation cleanup service
    startReservationCleanup();
    console.log('🧹 Reservation cleanup service started');
    
    // Wait a bit then create admin user
    setTimeout(async () => {
      await createAdminUser();
    }, 2000);
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.log('Unhandled Promise Rejection:', err.message);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.log('Uncaught Exception:', err.message);
  process.exit(1);
});

export default app;