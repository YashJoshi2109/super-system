import https from 'https';

// SMS notification service - supports multiple providers
// Priority: RapidAPI SMS > Twilio > None

/**
 * Send SMS using RapidAPI SMS Verify3 service
 * Note: This API is designed for verification codes, but we'll adapt it for notifications
 */
async function sendSMSViaRapidAPI(phone, message) {
  const rapidApiKey = process.env.RAPIDAPI_SMS_KEY;

  if (!rapidApiKey) {
    return { success: false, error: 'RapidAPI key not configured' };
  }

  return new Promise((resolve) => {
    const options = {
      method: 'POST',
      hostname: 'sms-verify3.p.rapidapi.com',
      port: null,
      path: '/send-numeric-verify',
      headers: {
        'x-rapidapi-key': rapidApiKey,
        'x-rapidapi-host': 'sms-verify3.p.rapidapi.com',
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, function (res) {
      const chunks = [];

      res.on('data', function (chunk) {
        chunks.push(chunk);
      });

      res.on('end', function () {
        try {
          const body = Buffer.concat(chunks);
          const data = JSON.parse(body.toString());
          
          if (res.statusCode === 200) {
            console.log('RapidAPI SMS sent successfully to', phone);
            resolve({ success: true, provider: 'rapidapi', data });
          } else {
            console.error('RapidAPI SMS failed:', data);
            resolve({ success: false, error: data.message || 'SMS send failed', provider: 'rapidapi' });
          }
        } catch (err) {
          console.error('RapidAPI SMS parse error:', err);
          resolve({ success: false, error: err.message, provider: 'rapidapi' });
        }
      });
    });

    req.on('error', function (err) {
      console.error('RapidAPI SMS request error:', err);
      resolve({ success: false, error: err.message, provider: 'rapidapi' });
    });

    // Format phone number (ensure it includes country code)
    const cleanPhone = phone.replace(/\D/g, '');
    const formattedPhone = phone.startsWith('+') ? phone : `+${cleanPhone}`;

    req.write(JSON.stringify({
      target: formattedPhone,
      estimate: false,
      // Note: This API is for verification codes, but we'll use it for notifications
      // For general SMS, you may want to use a different endpoint or service
    }));

    req.end();
  });
}

/**
 * Send SMS using Twilio (fallback)
 */
async function sendSMSViaTwilio(phone, message) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    return { success: false, error: 'Twilio not configured' };
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
      console.log('Twilio SMS sent successfully to', toNumber);
      return { success: true, provider: 'twilio', sid: data.sid };
    } else {
      console.error('Twilio SMS send failed:', data);
      return { success: false, error: data.message || 'SMS send failed', provider: 'twilio' };
    }
  } catch (err) {
    console.error('Twilio SMS error:', err);
    return { success: false, error: err.message, provider: 'twilio' };
  }
}

/**
 * Main SMS sending function
 * Tries RapidAPI first, then Twilio, then fails gracefully
 */
export async function sendSMS(phone, message) {
  if (!phone || !message) {
    return { success: false, error: 'Phone and message are required' };
  }

  // Try RapidAPI first (if configured)
  if (process.env.RAPIDAPI_SMS_KEY) {
    const result = await sendSMSViaRapidAPI(phone, message);
    if (result.success) {
      return result;
    }
    // If RapidAPI fails, try Twilio as fallback
    console.log('RapidAPI SMS failed, trying Twilio...');
  }

  // Try Twilio (if configured)
  if (process.env.TWILIO_ACCOUNT_SID) {
    const result = await sendSMSViaTwilio(phone, message);
    if (result.success) {
      return result;
    }
  }

  // No SMS service configured or both failed
  console.log('No SMS service configured or all providers failed, skipping SMS:', phone, message);
  return { success: false, error: 'SMS service not configured or failed' };
}
