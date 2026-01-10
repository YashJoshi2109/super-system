// ETA calculation using MapTiler Directions API
export async function calculateETA(driverCoords, guestCoords, apiKey) {
  if (!driverCoords || !guestCoords || !apiKey) return null;

  try {
    const url = `https://api.maptiler.com/directions/mapbox/driving/${driverCoords.lng},${driverCoords.lat};${guestCoords.lng},${guestCoords.lat}?geometries=geojson&access_token=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      const duration = route.duration; // seconds
      const distance = route.distance; // meters

      return {
        etaMinutes: Math.ceil(duration / 60),
        etaSeconds: Math.ceil(duration),
        distanceKm: (distance / 1000).toFixed(1),
        distanceMiles: (distance / 1609.34).toFixed(1)
      };
    }
    return null;
  } catch (err) {
    console.error('ETA calculation error:', err);
    return null;
  }
}
