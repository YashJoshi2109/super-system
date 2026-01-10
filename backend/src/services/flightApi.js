// Flight API integration for auto-terminal detection
export async function getFlightInfo(airlineCode, apiKey) {
  if (!airlineCode || !apiKey) return null;

  // Extract airline and number (e.g., "AA1234" -> airline: "AA", number: "1234")
  const match = airlineCode.match(/^([A-Z]{2})\s*(\d+)$/i);
  if (!match) return null;

  const [, airline, number] = match;

  try {
    // Using AviationStack API (free tier available)
    // Replace with your preferred flight API if different
    const url = `http://api.aviationstack.com/v1/flights?access_key=${apiKey}&airline_iata=${airline}&flight_number=${number}&limit=1`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.data && data.data.length > 0) {
      const flight = data.data[0];
      return {
        terminal: flight.arrival?.terminal || null,
        gate: flight.arrival?.gate || null,
        scheduled: flight.arrival?.scheduled || null,
        estimated: flight.arrival?.estimated || null,
        delayed: flight.arrival?.delay || null,
        status: flight.flight_status || null
      };
    }
    return null;
  } catch (err) {
    console.error('Flight API error:', err);
    // Fallback: try with alternative API format if first fails
    return null;
  }
}

// Alternative: Use OpenSky Network (free, no API key needed) for basic info
export async function getFlightInfoOpenSky(airlineCode) {
  const match = airlineCode.match(/^([A-Z]{2})\s*(\d+)$/i);
  if (!match) return null;

  // OpenSky doesn't provide terminal info, but can verify flight exists
  // This is a placeholder - implement based on available APIs
  return null;
}
