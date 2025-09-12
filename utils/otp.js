import bcrypt from 'bcryptjs';

// Generate a random 6-digit OTP
export const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Hash OTP before saving to database
export const hashOTP = async (otp) => {
  return await bcrypt.hash(otp, 12);
};

// Verify OTP against hashed version
export const verifyOTP = async (otp, hashedOTP) => {
  return await bcrypt.compare(otp, hashedOTP);
};

// Normalize Nigerian phone number to start with 234
export const normalizePhoneNumber = (phone) => {
  // Remove all non-digit characters
  let cleaned = phone.replace(/\D/g, '');
  
  // Handle different formats
  if (cleaned.startsWith('234')) {
    return cleaned;
  } else if (cleaned.startsWith('0')) {
    return '234' + cleaned.substring(1);
  } else if (cleaned.length === 10) {
    return '234' + cleaned;
  }
  
  return cleaned;
};