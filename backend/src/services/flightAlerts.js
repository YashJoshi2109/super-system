// FlightStats/Cirium Alerts API integration
// Documentation: https://developer.flightstats.com/api-docs/alerts/v1
// Note: This is a PREMIUM API requiring a contract with FlightStats/Cirium

/**
 * Create a flight alert rule to monitor a specific flight
 * @param {Object} params - Flight parameters
 * @param {string} params.carrier - Airline code (e.g., "AA")
 * @param {string} params.flightNumber - Flight number (e.g., "1234")
 * @param {string} params.departureAirport - Departure airport code (e.g., "JFK")
 * @param {string} params.arrivalAirport - Arrival airport code (e.g., "DFW")
 * @param {string} params.year - Year (e.g., "2024")
 * @param {string} params.month - Month (e.g., "01")
 * @param {string} params.day - Day (e.g., "15")
 * @param {string} params.callbackUrl - Webhook URL to receive alerts
 * @param {Array} params.events - Events to monitor (e.g., ["depDelay", "can", "arrGate", "preArr60"])
 * @returns {Promise<Object>} Alert rule information
 */
export async function createFlightAlertRule(params) {
  const appId = process.env.FLIGHTSTATS_APP_ID;
  const appKey = process.env.FLIGHTSTATS_APP_KEY;

  if (!appId || !appKey) {
    console.warn('FlightStats credentials not configured, skipping alert creation');
    return { success: false, error: 'FlightStats credentials not configured' };
  }

  const {
    carrier,
    flightNumber,
    departureAirport,
    arrivalAirport,
    year,
    month,
    day,
    callbackUrl,
    events = ['depDelay', 'can', 'arrGate', 'preArr60', 'arr'] // Default events
  } = params;

  // FlightStats API endpoint for creating route arrival alert rule
  // Using route arrival rule: monitors flight by arrival airport and time
  const baseUrl = 'https://api.flightstats.com/flex/alerts/rest/v1/json';
  const endpoint = `/create/route/arrival/${carrier}/${flightNumber}/${departureAirport}/${arrivalAirport}/arriving/${year}/${month}/${day}`;
  
  const url = `${baseUrl}${endpoint}?appId=${appId}&appKey=${appKey}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        callbackUrl: callbackUrl,
        events: events,
        // Additional name/value pairs can be passed for context
        _requestId: params.requestId || '', // Store request ID for reference
        _phone: params.phone || '' // Store phone for SMS notifications
      })
    });

    const data = await response.json();

    if (response.ok && data.alertRule) {
      console.log('FlightStats alert rule created:', data.alertRule.ruleId);
      return {
        success: true,
        ruleId: data.alertRule.ruleId,
        data: data.alertRule
      };
    } else {
      console.error('FlightStats alert creation failed:', data);
      return {
        success: false,
        error: data.error?.message || 'Failed to create alert rule',
        data: data
      };
    }
  } catch (err) {
    console.error('FlightStats API error:', err);
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Delete a flight alert rule
 * @param {string} ruleId - Alert rule ID to delete
 * @returns {Promise<Object>} Deletion result
 */
export async function deleteFlightAlertRule(ruleId) {
  const appId = process.env.FLIGHTSTATS_APP_ID;
  const appKey = process.env.FLIGHTSTATS_APP_KEY;

  if (!appId || !appKey || !ruleId) {
    return { success: false, error: 'Credentials or ruleId missing' };
  }

  const baseUrl = 'https://api.flightstats.com/flex/alerts/rest/v1/json';
  const endpoint = `/delete/${ruleId}`;
  const url = `${baseUrl}${endpoint}?appId=${appId}&appKey=${appKey}`;

  try {
    const response = await fetch(url, {
      method: 'DELETE'
    });

    if (response.ok) {
      console.log('FlightStats alert rule deleted:', ruleId);
      return { success: true };
    } else {
      const data = await response.json();
      console.error('FlightStats alert deletion failed:', data);
      return { success: false, error: data.error?.message || 'Failed to delete alert rule' };
    }
  } catch (err) {
    console.error('FlightStats API error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Parse flight code and extract flight information
 * Expected format: "AA1234" or "AA 1234"
 * @param {string} airlineCode - Flight code (e.g., "AA1234")
 * @returns {Object|null} Parsed flight information
 */
export function parseFlightCode(airlineCode) {
  if (!airlineCode) return null;

  // Match pattern: 2-3 letters (airline code) + flight number
  const match = airlineCode.trim().match(/^([A-Z]{2,3})\s*(\d+)$/i);
  if (!match) return null;

  const [, carrier, flightNumber] = match;
  return {
    carrier: carrier.toUpperCase(),
    flightNumber: flightNumber
  };
}

/**
 * Format flight alert message for SMS
 * @param {Object} alert - Alert data from FlightStats
 * @returns {string} Formatted message
 */
export function formatFlightAlertMessage(alert) {
  const eventType = alert.event?.type || 'UNKNOWN';
  const flightStatus = alert.flightStatus || {};
  const carrier = flightStatus.carrierFsCode || '';
  const flightNumber = flightStatus.flightNumber || '';
  const flight = `${carrier}${flightNumber}`;

  // Map event types to user-friendly messages
  const eventMessages = {
    'ARRIVAL_DELAY': `⚠️ Flight ${flight} is delayed. New arrival time: ${formatTime(alert.event?.dateTimeUtc)}`,
    'DEPARTURE_DELAY': `⚠️ Flight ${flight} departure is delayed.`,
    'CANCELLATION': `❌ Flight ${flight} has been CANCELLED.`,
    'ARRIVAL_GATE': `📍 Flight ${flight} arrival gate changed to: ${flightStatus.arrivalAirportFsCode} Gate ${flightStatus.arrivalTerminal || ''}`,
    'PRE_ARRIVAL': `✈️ Flight ${flight} will arrive in approximately 60 minutes.`,
    'ARRIVAL': `✅ Flight ${flight} has arrived at ${flightStatus.arrivalAirportFsCode}.`,
    'DIVERTED': `⚠️ Flight ${flight} has been diverted.`
  };

  const message = eventMessages[eventType] || `ℹ️ Update for flight ${flight}: ${eventType}`;
  
  return `Super 8 Shuttle Alert: ${message}`;
}

function formatTime(isoString) {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    return date.toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      hour: 'numeric', 
      minute: '2-digit',
      timeZoneName: 'short'
    });
  } catch {
    return isoString;
  }
}
