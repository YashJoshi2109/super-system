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

// Hotel location: Super 8 Bedford DFW West, 1700 Airport Freeway, Bedford, TX
const HOTEL_COORDS = { lat: 32.836, lng: -97.138 };

export default function LiveMap({ driver, guests = [], showRoute = false, fromHotel = false, alwaysShowHotel = false }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const driverMarker = useRef(null);
  const guestMarkers = useRef([]);
  const hotelMarker = useRef(null);
  const routeLayer = useRef(null);

  useEffect(() => {
    const key = import.meta.env.VITE_MAPTILER_KEY;
    if (!key) {
      console.error('MapTiler key not found');
      return;
    }

    mapInstance.current = new maplibregl.Map({
      container: mapRef.current,
      style: styleUrl(key),
      center: [driver?.lng || -97.138, driver?.lat || 32.836],
      zoom: 13
    });

    const setupRoute = () => {
      if (mapInstance.current.getSource('route')) return; // Already set up
      
      mapInstance.current.addSource('route', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      mapInstance.current.addLayer({
        id: 'route',
        type: 'line',
        source: 'route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#3b82f6',
          'line-width': 4,
          'line-opacity': 0.75
        }
      });
    };

    if (mapInstance.current.loaded()) {
      if (showRoute) setupRoute();
    } else {
      mapInstance.current.on('load', () => {
        if (showRoute) setupRoute();
      });
    }

    return () => {
      if (mapInstance.current) mapInstance.current.remove();
    };
  }, [showRoute]);

  useEffect(() => {
    if (!mapInstance.current) return;
    
    const updateMap = () => {
      if (!mapInstance.current.loaded()) {
        mapInstance.current.once('load', updateMap);
        return;
      }

      // Hotel marker (always show if fromHotel or alwaysShowHotel is true)
      if (fromHotel || alwaysShowHotel) {
        if (!hotelMarker.current) {
          hotelMarker.current = new maplibregl.Marker({ 
            element: createMarkerEl('Hotel', '#10b981', '🏨'),
            anchor: 'bottom'
          })
            .setLngLat([HOTEL_COORDS.lng, HOTEL_COORDS.lat])
            .setPopup(new maplibregl.Popup({ offset: 12 }).setHTML('<div style="font-weight: bold; color: #10b981; font-size: 14px;">🏨 Super 8 Bedford DFW West</div><div style="font-size: 11px; color: #666; margin-top: 4px;">1700 Airport Freeway, Bedford, TX</div>'))
            .addTo(mapInstance.current);
        }
      } else if (hotelMarker.current && !alwaysShowHotel) {
        hotelMarker.current.remove();
        hotelMarker.current = null;
      }

      // Driver marker
      if (driver) {
        if (!driverMarker.current) {
          driverMarker.current = new maplibregl.Marker({ element: createMarkerEl('Shuttle', '#67e8f9', '🚐') })
            .setLngLat([driver.lng, driver.lat])
            .setPopup(new maplibregl.Popup({ offset: 12 }).setText('Shuttle Location'))
            .addTo(mapInstance.current);
        } else {
          driverMarker.current.setLngLat([driver.lng, driver.lat]);
        }
      }

      // Guest markers
      guestMarkers.current.forEach((m) => m.remove());
      guestMarkers.current = [];
      guests.filter(Boolean).forEach((g, idx) => {
        const marker = new maplibregl.Marker({ element: createMarkerEl(`Guest ${idx + 1}`, '#f59e0b', '📍') })
          .setLngLat([g.lng, g.lat])
          .setPopup(new maplibregl.Popup({ offset: 12 }).setText(`Guest ${idx + 1}`))
          .addTo(mapInstance.current);
        guestMarkers.current.push(marker);
      });

      // Draw route if needed
      if (showRoute && mapInstance.current.getSource('route')) {
        const key = import.meta.env.VITE_MAPTILER_KEY;
        if (key) {
          let fromCoords, toCoords;
          
          if (fromHotel || alwaysShowHotel) {
            // Guest view: Always show route from hotel (Super 8) to guest location
            if (guests.length > 0) {
              fromCoords = HOTEL_COORDS;
              toCoords = guests[0];
            }
          } else {
            // Driver view: Route from driver current location to guest
            if (driver && guests.length > 0) {
              fromCoords = driver;
              toCoords = guests[0];
            }
          }

          if (fromCoords && toCoords) {
            // Debounce to avoid excessive API calls
            const routeKey = `${fromCoords.lng},${fromCoords.lat};${toCoords.lng},${toCoords.lat}`;
            const lastRouteKey = mapInstance.current._lastRouteKey;
            
            if (!lastRouteKey || lastRouteKey !== routeKey) {
              mapInstance.current._lastRouteKey = routeKey;
              
              fetch(`https://api.maptiler.com/directions/mapbox/driving/${fromCoords.lng},${fromCoords.lat};${toCoords.lng},${toCoords.lat}?geometries=geojson&access_token=${key}`)
                .then(res => res.json())
                .then(data => {
                  if (data.routes && data.routes.length > 0 && mapInstance.current && mapInstance.current.getSource('route')) {
                    const route = data.routes[0].geometry;
                    mapInstance.current.getSource('route').setData({
                      type: 'Feature',
                      properties: {
                        distance: Math.round(data.routes[0].distance / 1000),
                        duration: Math.round(data.routes[0].duration / 60)
                      },
                      geometry: route
                    });
                  }
                })
                .catch(err => console.error('Route fetch error:', err));
            }
          } else if (mapInstance.current.getSource('route')) {
            // Clear route if no coordinates
            mapInstance.current.getSource('route').setData({
              type: 'FeatureCollection',
              features: []
            });
          }
        }
      }

      // Fit bounds - always include hotel if fromHotel or alwaysShowHotel
      const coords = [
        ...((fromHotel || alwaysShowHotel) ? [[HOTEL_COORDS.lng, HOTEL_COORDS.lat]] : []),
        ...(driver ? [[driver.lng, driver.lat]] : []),
        ...guests.filter(Boolean).map((g) => [g.lng, g.lat])
      ];
      if (coords.length) {
        const bounds = coords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
        mapInstance.current.fitBounds(bounds, { 
          padding: { top: 80, bottom: 80, left: 80, right: 80 }, 
          maxZoom: 14,
          duration: 1000
        });
      } else if (fromHotel || alwaysShowHotel) {
        // If no other coords, center on hotel
        mapInstance.current.flyTo({
          center: [HOTEL_COORDS.lng, HOTEL_COORDS.lat],
          zoom: 13,
          duration: 1000
        });
      }
    };

    updateMap();
  }, [driver, guests, showRoute, fromHotel, alwaysShowHotel]);

  return <div ref={mapRef} className="w-full h-full rounded-xl overflow-hidden" />;
}
