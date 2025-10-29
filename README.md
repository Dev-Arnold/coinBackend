# Coin Auction Platform Backend

A Node.js + Express + MongoDB backend for a coin auction platform with user authentication, referral system, and automated auction scheduling.

## Features

### User Features
- User registration and authentication with JWT
- Referral system with ₦2000 bonus + 10% commission
- User profile management with bank details
- Credit score system (3 strikes = account blocked)
- Dashboard with active balance calculation
- Payment proof upload for bids

### Admin Features
- User management and blocking
- Manual coin assignment to users
- Coin approval system
- Platform statistics dashboard

### Auction System
- Automated auction scheduling (9 AM & 6:30 PM WAT Mon-Sat, 6:30 PM WAT Sunday)
- 30-minute auction duration
- Three investment plans: 75 Days (53%), 10 Days (107%), 30 Days (215%)
- 15-minute payment timeout
- Coin categories (Category A: ₦10K-100K, Category B: ₦100K-250K, Category C: ₦250K-500K, Category D: ₦500K-2M)
- Recommitment system for coin resale

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Create `.env` file with your configuration:
   ```
   NODE_ENV=development
   PORT=2500
   MONGODB_URI=your_mongodb_atlas_connection_string
   JWT_SECRET=your_super_secret_jwt_key
   JWT_EXPIRES_IN=7d
   COOKIE_EXPIRES_IN=7
   ADMIN_EMAIL=admin@coinauction.com
   ADMIN_PASSWORD=admin123456
   REFERRAL_BONUS=2000
   REFERRAL_COMMISSION_PERCENT=10
   AUCTION_DURATION_MINUTES=30
   PAYMENT_TIMEOUT_MINUTES=15
   EMAIL_HOST=smtp.gmail.com
   EMAIL_PORT=587
   EMAIL_USERNAME=your_email@gmail.com
   EMAIL_PASSWORD=your_app_password
   EMAIL_FROM_NAME=Coin Auction Platform
   EMAIL_FROM=noreply@coinauction.com
   FRONTEND_URL=http://localhost:3000
   ```

4. Start the server:
   ```bash
   npm run dev
   ```

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login user
- `POST /api/v1/auth/logout` - Logout user
- `POST /api/v1/auth/forgot-password` - Send password reset email
- `POST /api/v1/auth/reset-password` - Reset password with token
- `GET /api/v1/auth/me` - Get current user profile
- `PATCH /api/v1/auth/updateMe` - Update user profile

### Admin Routes
- `GET /api/v1/admin/users` - Get all users
- `GET /api/v1/admin/users/:id` - Get single user
- `POST /api/v1/admin/assign-coin` - Assign coin to user
- `GET /api/v1/admin/pending-coins` - Get coins pending approval
- `PATCH /api/v1/admin/coins/:coinId/approve` - Approve coin
- `PATCH /api/v1/admin/users/:userId/toggle-block` - Block/unblock user
- `GET /api/v1/admin/stats` - Get platform statistics

### Auction Routes
- `GET /api/v1/auction/status` - Get auction status and next auction time
- `GET /api/v1/auction/coins` - Get coins in current auction
- `POST /api/v1/auction/bid` - Place bid on coin
- `PATCH /api/v1/auction/bid/:transactionId/cancel` - Cancel bid
- `GET /api/v1/auction/my-bids` - Get user's bids

### Coin Routes
- `GET /api/v1/coins/my-coins` - Get user's coin portfolio
- `GET /api/v1/coins/:id` - Get single coin details
- `POST /api/v1/coins/payment-proof/:transactionId` - Upload payment proof
- `POST /api/v1/coins/:coinId/recommit` - Make recommitment bid
- `POST /api/v1/coins/:coinId/list-auction` - List coin for auction

## Project Structure

```
coin-auction-backend/
├── config/
│   └── db.js                  # MongoDB connection
├── controllers/
│   ├── authController.js      # Authentication logic
│   ├── adminController.js     # Admin functionality
│   ├── auctionController.js   # Auction management
│   └── coinController.js      # Coin operations
├── middlewares/
│   ├── authMiddleware.js      # Authentication & authorization
│   ├── errorMiddleware.js     # Error handling
│   └── validateRequest.js     # Request validation
├── models/
│   ├── User.js               # User schema
│   ├── Coin.js               # Coin schema
│   ├── AuctionSession.js     # Auction session schema
│   └── Transaction.js        # Transaction schema
├── routes/
│   ├── authRoutes.js         # Authentication routes
│   ├── adminRoutes.js        # Admin routes
│   ├── auctionRoutes.js      # Auction routes
│   └── coinRoutes.js         # Coin routes
├── utils/
│   ├── AppError.js           # Custom error class
│   └── generateToken.js      # JWT utilities
├── uploads/                  # File uploads directory
├── .env                      # Environment variables
├── .gitignore               # Git ignore rules
├── package.json             # Dependencies
├── server.js                # Main server file
└── README.md                # This file
```

## Technologies Used

- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **MongoDB** - Database
- **Mongoose** - ODM for MongoDB
- **JWT** - Authentication
- **bcryptjs** - Password hashing
- **Joi** - Data validation
- **Multer** - File uploads
- **node-cron** - Task scheduling
- **Helmet** - Security headers
- **CORS** - Cross-origin requests

## Development Status

This backend is approximately 60% complete and includes:

✅ User authentication and authorization
✅ Referral system implementation
✅ Credit score system
✅ Admin user management
✅ Coin model with profit calculations
✅ Auction scheduling system
✅ Bidding and payment flow
✅ File upload for payment proofs
✅ Error handling and validation

### Still needed for full completion:
- Payment gateway integration
- Email notifications
- Real-time auction updates (WebSocket)
- Advanced reporting and analytics
- Automated coin verification
- Mobile app API optimizations

## Getting Started

1. Make sure you have Node.js (v16+) and MongoDB Atlas account
2. Update the `.env` file with your MongoDB connection string
3. Run `npm install` to install dependencies
4. Run `npm run dev` to start the development server
5. The API will be available at `http://localhost:2500`

The server will automatically create an admin user on startup using the credentials in your `.env` file.

## Contributing

This is a learning project. Feel free to extend the functionality and add new features as needed.