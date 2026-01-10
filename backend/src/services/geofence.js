// Basic terminal geofence polygons (placeholder). Replace with accurate coords.
const TERMINAL_POLYGONS = {
  A: [
    { lat: 32.901, lng: -97.042 },
    { lat: 32.901, lng: -97.04 },
    { lat: 32.899, lng: -97.04 },
    { lat: 32.899, lng: -97.042 }
  ]
};

function pointInPolygon(point, polygon) {
  // Ray-casting algorithm for point in polygon
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng, yi = polygon[i].lat;
    const xj = polygon[j].lng, yj = polygon[j].lat;
    const intersect = ((yi > point.lat) !== (yj > point.lat)) &&
      (point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function withinGeofence(terminal, coords) {
  const polygon = TERMINAL_POLYGONS[terminal];
  if (!polygon) return true; // no data, allow
  return pointInPolygon(coords, polygon);
}
