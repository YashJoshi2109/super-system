// Groups requests by terminal and time window (in minutes)
export function groupNearby(requests, windowMinutes = 8, maxDistanceMeters = 200) {
  const grouped = [];
  const byTerminal = requests.reduce((acc, r) => {
    acc[r.terminal] = acc[r.terminal] || [];
    acc[r.terminal].push(r);
    return acc;
  }, {});

  Object.values(byTerminal).forEach((reqs) => {
    const sorted = reqs.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    let bucket = [];

    for (const req of sorted) {
      if (bucket.length === 0) {
        bucket.push(req);
        continue;
      }

      const first = bucket[0];
      const timeDiff = Math.abs(new Date(req.created_at) - new Date(first.created_at)) / 60000;
      const distance = distanceMeters(first.coordinates, req.coordinates);

      if (timeDiff <= windowMinutes && distance <= maxDistanceMeters) {
        bucket.push(req);
      } else {
        grouped.push(bucket);
        bucket = [req];
      }
    }

    if (bucket.length) grouped.push(bucket);
  });

  return grouped.map((bucket) => ({
    terminal: bucket[0].terminal,
    count: bucket.length,
    requests: bucket
  }));
}

function distanceMeters(a, b) {
  if (!a || !b) return Infinity;
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
