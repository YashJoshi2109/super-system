# SMS Integration Guide

## Current Implementation

The system now supports SMS notifications for all driver status updates:
- ✅ **Request Accepted**: "Your ride request has been accepted! Driver is on the way. Your seats are confirmed."
- ✅ **Driver Arrived**: "Your Super 8 shuttle has arrived! Please look for the van at your location."
- ✅ **Picked Up**: "You've been picked up! Enjoy your ride."

## SMS Service Configuration

The system supports multiple SMS providers with automatic fallback:

### Priority Order:
1. **RapidAPI SMS** (if `RAPIDAPI_SMS_KEY` is configured)
2. **Twilio** (if Twilio credentials are configured)
3. **No SMS** (graceful degradation if neither is configured)

## ⚠️ Important Note About RapidAPI SMS Verify3

The RapidAPI SMS Verify3 API endpoint (`/send-numeric-verify`) is **designed for sending verification codes**, not general text messages. This means:

- ❌ It may **not work** for sending custom messages like "Your driver is on the way"
- ✅ It's designed to send numeric verification codes automatically
- ✅ The API generates and sends codes, you don't control the message content

### For General SMS Notifications

For sending custom SMS notifications (which is what you need for driver updates), you'll need a different SMS service. Here are some **free options** that support 70+ messages per day:

## Recommended Free SMS APIs for General Messages

### 1. **TextBelt** (Free Tier)
- **Free**: 1 SMS per day (very limited)
- **Website**: https://textbelt.com/
- **Best for**: Testing only

### 2. **SMS Mode** (Free Trial)
- **Free**: 20 test credits
- **Paid**: Very affordable pricing
- **Website**: https://www.smsmode.com/en/free-sms-api/
- **Best for**: Small scale testing

### 3. **EasySendSMS** (Free Trial)
- **Free**: 15 free SMS messages
- **Paid**: Competitive pricing
- **Website**: https://www.easysendsms.com/
- **Best for**: Testing

### 4. **Twilio** (Recommended for Production)
- **Free Trial**: $15.50 credit (hundreds of messages)
- **Paid**: ~$0.0075 per SMS in US
- **Website**: https://www.twilio.com/
- **Best for**: Production use (very reliable)

### 5. **AWS SNS** (Amazon)
- **Free Tier**: 100 SMS per month (first 12 months)
- **Paid**: Very affordable
- **Website**: https://aws.amazon.com/sns/
- **Best for**: AWS-based infrastructure

### 6. **Vonage (Nexmo)** (Free Trial)
- **Free Trial**: $2 credit
- **Paid**: Competitive pricing
- **Website**: https://www.vonage.com/
- **Best for**: International messaging

## Setting Up RapidAPI SMS (Current Implementation)

If you want to use RapidAPI SMS Verify3 (even though it's for verification codes):

1. Get your RapidAPI key from https://rapidapi.com/Glavier/api/sms-verify3
2. Add to `.env`:
   ```env
   RAPIDAPI_SMS_KEY=your_rapidapi_key_here
   ```

**Note**: This may not work for general notifications. The API is designed for verification codes only.

## Setting Up Twilio (Recommended)

1. Sign up at https://www.twilio.com/
2. Get your credentials from the Twilio Console
3. Add to `.env`:
   ```env
   TWILIO_ACCOUNT_SID=your_account_sid
   TWILIO_AUTH_TOKEN=your_auth_token
   TWILIO_PHONE_NUMBER=+1234567890
   ```

## Testing SMS

After configuring your SMS provider:

1. Start the backend server
2. Submit a ride request as a guest
3. As a driver, change the status to "accepted" or "picked_up"
4. The guest should receive an SMS notification
5. Check server logs for SMS sending status

## Current SMS Implementation Details

### Code Structure

- **Service File**: `backend/src/services/sms.js`
  - `sendSMSViaRapidAPI()` - RapidAPI integration
  - `sendSMSViaTwilio()` - Twilio integration (fallback)
  - `sendSMS()` - Main function with automatic fallback

- **Socket Events**: `backend/src/sockets/index.js`
  - SMS sent on: `driver_arrived`, `status_change` (accepted, picked_up)

### Message Format

All SMS messages are sent exactly as shown in the toast notifications:
- No truncation
- Includes emojis (✅, 🚐, 🎉)
- Clear, actionable messages

## Recommendations

For **70+ messages per day** in production:

1. **Best Option**: **Twilio** (free trial gives $15.50 credit = ~2000 SMS)
2. **Budget Option**: **AWS SNS** (100 free SMS/month for 12 months)
3. **Testing Only**: **SMS Mode** or **EasySendSMS** (free trials)

The RapidAPI SMS Verify3 service you provided is **not suitable** for general SMS notifications - it's specifically for verification codes.

## Next Steps

1. Choose a free SMS provider from the list above
2. Sign up and get your API key/credentials
3. Add credentials to `.env` file
4. Test SMS delivery
5. Monitor usage and upgrade if needed

---

**Status**: ✅ SMS integration code is complete and ready to use. You just need to configure a suitable SMS provider.
