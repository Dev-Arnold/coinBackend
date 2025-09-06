const TERMII_BASE_URL = 'https://api.ng.termii.com/api';
const API_KEY = process.env.TERMII_API_KEY;

// Send WhatsApp OTP
const sendWhatsAppOTP = async (phoneNumber) => {
  try {
    const response = await fetch(`${TERMII_BASE_URL}/sms/otp/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        api_key: API_KEY,
        message_type: 'NUMERIC',
        to: phoneNumber,
        from: 'N-Alert',
        channel: 'whatsapp',
        pin_attempts: 3,
        pin_time_to_live: 5,
        pin_length: 6,
        pin_placeholder: '< 1234 >',
        message_text: 'Your CoinAuction verification code is < 1234 >. Valid for 5 minutes.',
        pin_type: 'NUMERIC'
      })
    });

    const data = await response.json();
    
    return {
      success: response.ok,
      data
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

// Verify WhatsApp OTP
const verifyWhatsAppOTP = async (pinId, pin) => {
  try {
    const response = await fetch(`${TERMII_BASE_URL}/sms/otp/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        api_key: API_KEY,
        pin_id: pinId,
        pin: pin
      })
    });

    const data = await response.json();
    
    return {
      success: response.ok,
      verified: data.verified
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

export { sendWhatsAppOTP, verifyWhatsAppOTP };