import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';

const styleUrl = (key) => `https://api.maptiler.com/maps/basic-v2/style.json?key=${key}`;

function createMarkerEl(label, color, emoji) {
  const el = document.createElement('div');
  el.className = 'map-marker';
  el.style.width = '32px';
  el.style.height = '32px';
  el.style.borderRadius = '9999px';
  el.style.backgroundColor = color;
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';
  el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.35)';
  el.style.fontSize = '16px';
  el.style.color = '#0f172a';
  el.title = label;
  el.textContent = emoji || '•';
  return el;
}

export default function LiveMap({ driver, guests = [] }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const driverMarker = useRef(null);
  const guestMarkers = useRef([]);

  useEffect(() => {
    const key = import.meta.env.VITE_MAPTILER_KEY;
    if (!key) return;
    mapInstance.current = new maplibregl.Map({
      container: mapRef.current,
      style: styleUrl(key),
      center: [driver?.lng || -97.138, driver?.lat || 32.836], // default center
      zoom: 13
    });

    return () => {
      if (mapInstance.current) mapInstance.current.remove();
    };
  }, []);

  useEffect(() => {
    if (!mapInstance.current) return;

    // Driver marker
    if (driver) {
      if (!driverMarker.current) {
        driverMarker.current = new maplibregl.Marker({ element: createMarkerEl('Shuttle', '#67e8f9', '🚐') })
          .setLngLat([driver.lng, driver.lat])
          .addTo(mapInstance.current);
      } else {
        driverMarker.current.setLngLat([driver.lng, driver.lat]);
      }
    }

    // Guest markers
    guestMarkers.current.forEach((m) => m.remove());
    guestMarkers.current = [];
    guests.filter(Boolean).forEach((g, idx) => {
      const marker = new maplibregl.Marker({ element: createMarkerEl(`Rider ${idx + 1}`, '#fbbf24', '📍') })
        .setLngLat([g.lng, g.lat])
        .setPopup(new maplibregl.Popup({ offset: 12 }).setText(`Rider ${idx + 1}`))
        .addTo(mapInstance.current);
      guestMarkers.current.push(marker);
    });

    // Fit bounds
    const coords = [
      ...(driver ? [[driver.lng, driver.lat]] : []),
      ...guests.filter(Boolean).map((g) => [g.lng, g.lat])
    ];
    if (coords.length) {
      const bounds = coords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
      mapInstance.current.fitBounds(bounds, { padding: 60, maxZoom: 15 });
    }
  }, [driver, guests]);

  return <div ref={mapRef} className="w-full h-full rounded-xl overflow-hidden" />;
}
