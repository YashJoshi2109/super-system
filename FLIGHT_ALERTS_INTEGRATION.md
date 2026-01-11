# FlightStats Alerts Integration

## Overview

This integration uses the FlightStats/Cirium Alerts API to send real-time flight updates to guests who have requested shuttle rides. When a guest provides their flight code, the system automatically subscribes to alerts for delays, cancellations, gate changes, and other flight events.

**Reference**: [FlightStats Alerts API Documentation](https://developer.flightstats.com/api-docs/alerts/v1)

## ⚠️ Important Notes

1. **PREMIUM API**: This is a **paid/contract API** - not free. You need to sign up with FlightStats/Cirium and get an App ID and App Key.
2. **Webhook Required**: Your server must be publicly accessible to receive alert callbacks.
3. **Flight Information Required**: The API requires both departure and arrival airports, which may require adding fields to your guest form.

## Features

✅ **Automatic Alert Subscription**: When a guest submits a ride request with a flight code, the system creates an alert rule
✅ **Real-time Updates**: Guests receive SMS notifications for:
   - Flight delays
   - Flight cancellations
   - Gate changes
   - Pre-arrival notifications (60 minutes before)
   - Flight arrivals
✅ **Push Notifications**: In addition to SMS, guests also receive in-app notifications
✅ **Automatic Cleanup**: Alert rules are automatically deleted when guests disconnect or rides complete

## Configuration

### 1. Get FlightStats Credentials

1. Sign up at https://developer.flightstats.com/
2. Get your App ID and App Key from the developer portal
3. Note: This requires a contract/paid plan with FlightStats

### 2. Set Environment Variables

Add to your `.env` file:

```env
# FlightStats/Cirium Alerts API
FLIGHTSTATS_APP_ID=your_app_id_here
FLIGHTSTATS_APP_KEY=your_app_key_here

# Public URL for webhook callbacks (REQUIRED)
# For production: https://your-server.com
# For development: Use ngrok or similar: https://your-domain.ngrok.io
WEBHOOK_BASE_URL=https://your-server.com
PUBLIC_URL=https://your-server.com
```

### 3. Make Server Publicly Accessible

FlightStats needs to send webhook callbacks to your server. Options:

- **Production**: Deploy to a public server (AWS, Heroku, DigitalOcean, etc.)
- **Development**: Use ngrok or similar tunneling service:
  ```bash
  ngrok http 3001
  # Use the ngrok URL as WEBHOOK_BASE_URL
  ```

## How It Works

### 1. Guest Submits Request

When a guest submits a ride request with a flight code (e.g., "AA1234"):

1. System parses the flight code to extract airline and flight number
2. Creates a FlightStats alert rule for that flight
3. Stores the alert rule ID for later cleanup
4. Alert rule monitors the flight for events

### 2. Flight Events Occur

When FlightStats detects a flight event (delay, cancellation, gate change, etc.):

1. FlightStats sends a POST request to your webhook: `/api/webhooks/flight-alerts`
2. System extracts the request ID and guest phone from the alert
3. Formats a user-friendly message
4. Sends SMS to the guest
5. Sends push notification via Socket.IO

### 3. Cleanup

Alert rules are automatically cleaned up when:
- Guest disconnects (if request is still pending)
- Ride is completed
- Request is cancelled

## Current Limitations

### 1. Departure Airport Required

The FlightStats API requires both departure and arrival airports. Currently, the code uses a default departure airport (`JFK`). **You should**:

- Add a "Departure Airport" field to your guest form, OR
- Use flight API to detect departure airport from flight code, OR
- Store common routes and use defaults based on airline/flight number patterns

### 2. Flight Date

Currently uses the current date. For better accuracy:
- Add a "Flight Date" field to the guest form, OR
- Parse date from flight information if available

### 3. Single Flight Rules Only

Currently implements single-flight rules (monitors one specific flight). The API also supports multi-flight rules (monitor all flights to an airport), which could be useful for monitoring all arrivals at DFW.

## Supported Alert Events

The system monitors these events (configured in `createFlightAlertRule`):

- `depDelay` - Departure delay detected
- `can` - Flight cancelled
- `arrGate` - Arrival gate changed
- `preArr60` - Pre-arrival notification (60 minutes before)
- `arr` - Flight arrived

You can customize events in `backend/src/sockets/index.js` when calling `createFlightAlertRule`.

## Alert Message Format

SMS messages are formatted like:

```
Super 8 Shuttle Alert: ⚠️ Flight AA1234 is delayed. New arrival time: Jan 15, 3:45 PM CST
Super 8 Shuttle Alert: ❌ Flight AA1234 has been CANCELLED.
Super 8 Shuttle Alert: 📍 Flight AA1234 arrival gate changed to: DFW Gate A
Super 8 Shuttle Alert: ✈️ Flight AA1234 will arrive in approximately 60 minutes.
Super 8 Shuttle Alert: ✅ Flight AA1234 has arrived at DFW.
```

## Webhook Security (Optional but Recommended)

FlightStats provides security headers for webhook verification:

- `Cirium-Flex-Alert-Key` - Concatenated alert fields
- `Cirium-Flex-Alert-Hash` - SHA512 HMAC hash using your App Key

You can verify webhooks by:
1. Reconstructing the key from alert fields
2. Computing the hash using your App Key
3. Comparing with the provided hash

This is not currently implemented but can be added for production security.

## Testing

### 1. Local Testing with ngrok

```bash
# Terminal 1: Start your server
npm start

# Terminal 2: Start ngrok
ngrok http 3001

# Copy the ngrok URL and add to .env:
# WEBHOOK_BASE_URL=https://your-ngrok-url.ngrok.io
```

### 2. Test Alert Creation

Submit a ride request with a flight code and check logs for:
```
Flight alert rule created for request [id]: [rule-id]
```

### 3. Test Webhook (Manual)

You can manually test the webhook endpoint:

```bash
curl -X POST http://localhost:3001/api/webhooks/flight-alerts \
  -H "Content-Type: application/json" \
  -d '{
    "event": {
      "type": "ARRIVAL_DELAY",
      "dateTimeUtc": "2024-01-15T20:00:00Z"
    },
    "flightStatus": {
      "carrierFsCode": "AA",
      "flightNumber": "1234",
      "arrivalAirportFsCode": "DFW"
    },
    "_requestId": "test-request-id",
    "_phone": "+1234567890"
  }'
```

## Troubleshooting

### Alert Rules Not Created

- Check FlightStats credentials are correct
- Verify flight code format (e.g., "AA1234")
- Check server logs for error messages
- Ensure webhook URL is publicly accessible

### Webhooks Not Received

- Verify `WEBHOOK_BASE_URL` is correct and publicly accessible
- Check FlightStats dashboard for webhook delivery status
- Verify firewall/security groups allow incoming POST requests
- Check server logs for incoming requests

### SMS Not Sending

- Verify SMS service is configured (Twilio or RapidAPI)
- Check SMS service logs
- Verify phone number format is correct

## Future Enhancements

1. **Add Departure Airport Field**: Ask guests for departure airport
2. **Add Flight Date Field**: Ask guests for flight date
3. **Webhook Verification**: Implement hash verification for security
4. **Multi-Flight Rules**: Monitor all arrivals at DFW airport
5. **Alert Preferences**: Let guests choose which alerts they want
6. **Database Storage**: Store alert rule IDs in database for persistence

## API Documentation

Full API documentation: https://developer.flightstats.com/api-docs/alerts/v1

---

**Status**: ✅ Integration code complete. Requires FlightStats credentials and public server URL to activate.
