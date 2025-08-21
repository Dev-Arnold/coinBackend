import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import multer from 'multer';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// KYC Documents Storage
const kycStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'coin/kyc-documents',
    allowedFormats: ['jpeg', 'png', 'jpg', 'pdf'],
    transformation: [{ width: 1000, height: 1000, crop: 'limit', quality: 'auto' }],
  },
});

// Payment Proofs Storage
const paymentStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'coin/payment-proofs',
    allowedFormats: ['jpeg', 'png', 'jpg'],
    transformation: [{ width: 800, height: 800, crop: 'limit', quality: 'auto' }],
  },
});

const kycUpload = multer({ 
  storage: kycStorage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

const paymentUpload = multer({ 
  storage: paymentStorage,
  limits: { fileSize: 3 * 1024 * 1024 } // 3MB limit
});

export { cloudinary, kycUpload, paymentUpload };
