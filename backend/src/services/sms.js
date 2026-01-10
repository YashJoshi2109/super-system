// SMS notification service using Twilio
export async function sendSMS(phone, message) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    console.log('Twilio not configured, skipping SMS:', phone, message);
    return { success: false, error: 'SMS service not configured' };
  }

  try {
    // Format phone number (remove + if present, ensure it starts with country code)
    const cleanPhone = phone.replace(/\D/g, '');
    const toNumber = cleanPhone.startsWith('1') && cleanPhone.length === 11 
      ? `+${cleanPhone}` 
      : `+1${cleanPhone}`;

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`
        },
        body: new URLSearchParams({
          From: fromNumber,
          To: toNumber,
          Body: message
        })
      }
    );

    const data = await response.json();
    
    if (response.ok) {
      console.log('SMS sent successfully to', toNumber);
      return { success: true, sid: data.sid };
    } else {
      console.error('SMS send failed:', data);
      return { success: false, error: data.message || 'SMS send failed' };
    }
  } catch (err) {
    console.error('SMS error:', err);
    return { success: false, error: err.message };
  }
}

// Alternative: Use SMS API services like TextBelt, AWS SNS, etc.
export async function sendSMSAlternative(phone, message, apiKey) {
  // Placeholder for alternative SMS providers
  // Example: AWS SNS, Nexmo, etc.
  return { success: false, error: 'Alternative SMS not implemented' };
}
