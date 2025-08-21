import User from '../models/User.js';
import AppError from '../utils/AppError.js';

// Submit complete KYC information
const submitKyc = async (req, res, next) => {
  try {
    const { fullName, idCardType } = req.body;
    const userId = req.user.id;

    if (!req.files || !req.files.idCardImage || !req.files.proofOfAddress) {
      return next(new AppError('Please upload both ID card image and proof of address', 400));
    }

    const user = await User.findById(userId);
    if (!user) {
      return next(new AppError('User not found', 404));
    }

    // Check if KYC already submitted
    if (user.kyc && user.kyc.fullName) {
      return next(new AppError('KYC already submitted', 400));
    }

    // Update user's KYC information
    user.kyc = {
      fullName,
      idCardType,
      idCardImage: req.files.idCardImage[0].path, // Cloudinary URL
      proofOfAddress: req.files.proofOfAddress[0].path, // Cloudinary URL
      submittedAt: new Date()
    };

    // Update KYC status to pending
    user.kycStatus = 'pending';

    await user.save();

    res.status(200).json({
      status: 'success',
      message: 'KYC submitted successfully',
      data: {
        kyc: user.kyc,
        kycStatus: user.kycStatus
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get user's KYC status and information
const getKycStatus = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).select('kycStatus kyc isVerified');

    res.status(200).json({
      status: 'success',
      data: {
        kycStatus: user.kycStatus,
        isVerified: user.isVerified,
        kyc: user.kyc
      }
    });
  } catch (error) {
    next(error);
  }
};

// Admin: Get all pending KYC submissions
const getPendingKyc = async (req, res, next) => {
  try {
    const users = await User.find({
      kycStatus: 'pending'
    }).select('firstName lastName email kycStatus kyc isVerified');

    res.status(200).json({
      status: 'success',
      results: users.length,
      data: {
        users
      }
    });
  } catch (error) {
    next(error);
  }
};

// Admin: Approve or reject KYC submission
const reviewKyc = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { action, rejectionReason } = req.body; // action: 'approve' or 'reject'

    const user = await User.findById(userId);
    if (!user) {
      return next(new AppError('User not found', 404));
    }

    if (!user.kyc || !user.kyc.fullName) {
      return next(new AppError('No KYC submission found for this user', 404));
    }

    if (action === 'approve') {
      user.kycStatus = 'verified';
      user.isVerified = true;
    } else if (action === 'reject') {
      user.kycStatus = 'rejected';
      user.kyc.rejectionReason = rejectionReason;
    }

    await user.save();

    res.status(200).json({
      status: 'success',
      message: `KYC ${action}d successfully`,
      data: {
        user: {
          kycStatus: user.kycStatus,
          isVerified: user.isVerified,
          kyc: user.kyc
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// Admin: Approve entire KYC
const approveKyc = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return next(new AppError('User not found', 404));
    }

    user.kycStatus = 'verified';
    user.isVerified = true;
    
    // Mark all documents as approved
    // user.kycDocuments.forEach(doc => {
    //   if (doc.status === 'pending') {
    //     doc.status = 'approved';
    //   }
    // });

    await user.save();

    res.status(200).json({
      status: 'success',
      message: 'KYC approved successfully',
      data: {
        user: {
          kycStatus: user.kycStatus,
          isVerified: user.isVerified
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

export {
  submitKyc,
  getKycStatus,
  getPendingKyc,
  reviewKyc,
  approveKyc
};