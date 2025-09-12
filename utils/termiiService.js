import dotenv from 'dotenv';
dotenv.config();

const TERMII_BASE_URL = 'https://v3.api.termii.com' ;
const API_KEY = process.env.TERMII_API_KEY;

// Send OTP via WhatsApp
const sendWhatsAppOTP = async (phoneNumber, otp) => {
  try {
    console.log('Sending WhatsApp OTP to:', phoneNumber);
    console.log('Using API Key:', API_KEY ? 'Present' : 'Missing');
    
    const requestBody = {
      api_key: API_KEY,
      to: phoneNumber,
      from: "CoinAuction", // your app/brand name
      sms: `Your CoinAuction verification code is ${otp}. Valid for 5 minutes.`,
      type: 'plain',
      channel: 'whatsapp'
    };
    
    console.log('Request body:', JSON.stringify(requestBody, null, 2));
    
    const response = await fetch(`${TERMII_BASE_URL}/whatsapp/send`, { // ✅ changed here
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers));
    
    const responseText = await response.text();
    console.log('Raw response:', responseText);
    
    let data = {};
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.log('Failed to parse JSON response');
    }
    
    console.log('Parsed response:', data);
    
    return {
      success: response.ok,
      data
    };
  } catch (error) {
    console.error('Termii API Error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

export { sendWhatsAppOTP };
