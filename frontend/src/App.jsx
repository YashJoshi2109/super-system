import React, { useEffect, useMemo, useState } from 'react';
import { socket } from './lib/socket.js';
import LiveMap from './components/LiveMap.jsx';
import ChatPanel from './components/ChatPanel.jsx';
import HorizontalJourney from './components/HorizontalJourney.jsx';
import NotificationToast from './components/NotificationToast.jsx';
import ShuttleSeatSelection from './components/ShuttleSeatSelection.jsx';
import LiveShuttleStatus from './components/LiveShuttleStatus.jsx';
import LoginModal from './components/LoginModal.jsx';
import { t } from './i18n.js';

const roles = ['guest', 'driver', 'admin'];

export default function App() {
  // Initialize theme from localStorage immediately (prevents white flash)
  const getInitialTheme = () => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      return saved === 'light' ? 'light' : 'dark';
    }
    return 'dark'; // Default to dark
  };
  
  const [role, setRole] = useState('guest');
  const [lang, setLang] = useState('en');
  const [theme, setTheme] = useState(getInitialTheme); // Initialize from localStorage
  const [authToken, setAuthToken] = useState(null);
  const [authUser, setAuthUser] = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const [pendingRole, setPendingRole] = useState(null);
  const [weather, setWeather] = useState(null); // Weather data
  const [logs, setLogs] = useState([]);
  const [grouped, setGrouped] = useState([]);
  const [requests, setRequests] = useState([]);
  const [statusMap, setStatusMap] = useState({});
  const [connection, setConnection] = useState('disconnected');
  const [geofenceWarning, setGeofenceWarning] = useState(null);
  const [requestId, setRequestId] = useState(null);
  const [requestError, setRequestError] = useState(null);
  const [driverLoc, setDriverLoc] = useState(null);
  const [guestLoc, setGuestLoc] = useState(null);
  const [etas, setEtas] = useState({}); // request_id -> { etaMinutes, distanceKm }
  const [notifications, setNotifications] = useState([]);
  const [flightInfo, setFlightInfo] = useState(null);

  // Check for stored auth tokens on mount
  useEffect(() => {
    const storedDriverToken = localStorage.getItem('auth_token_driver');
    const storedAdminToken = localStorage.getItem('auth_token_admin');
    const storedDriverUser = localStorage.getItem('auth_user_driver');
    const storedAdminUser = localStorage.getItem('auth_user_admin');

    // Auto-login if token exists and role matches
    if (role === 'driver' && storedDriverToken && storedDriverUser) {
      try {
        setAuthToken(storedDriverToken);
        setAuthUser(JSON.parse(storedDriverUser));
      } catch (err) {
        console.error('Error parsing stored user:', err);
      }
    } else if (role === 'admin' && storedAdminToken && storedAdminUser) {
      try {
        setAuthToken(storedAdminToken);
        setAuthUser(JSON.parse(storedAdminUser));
      } catch (err) {
        console.error('Error parsing stored user:', err);
      }
    } else if ((role === 'driver' || role === 'admin') && !authToken) {
      // Show login if no token
      setShowLogin(true);
    }
  }, [role]);

  useEffect(() => {
    const handlers = [
      ['connect', () => { setConnection('connected'); pushLog(setLogs, 'Socket connected', {}); }],
      ['disconnect', () => setConnection('disconnected')],
      ['connect_error', (err) => setConnection(err?.message || 'error')],
      ['new_ride_request', (payload) => { pushLog(setLogs, 'New ride request', payload); setRequests((prev) => upsertRequest(prev, payload)); }],
      ['driver_moved', (payload) => { setDriverLoc(payload); pushLog(setLogs, 'Driver moved', payload); }],
      ['guest_moved', (payload) => { setGuestLoc(payload.coords); pushLog(setLogs, 'Guest moved', payload); }],
      ['receive_message', (payload) => pushLog(setLogs, 'Message', payload)],
      ['update_status', (payload) => {
        pushLog(setLogs, 'Status change', payload);
        if (payload?.request_id && payload?.status) {
          setStatusMap((prev) => ({ ...prev, [payload.request_id]: payload.status }));
          setRequests((prev) => prev.map((r) => r.id === payload.request_id ? { ...r, status: payload.status } : r));
        }
      }],
      ['geofence_warning', (payload) => { setGeofenceWarning(payload); pushLog(setLogs, 'Geofence warning', payload); }],
      ['grouped_requests', (payload) => setGrouped(payload || [])],
      ['request_ack', (payload) => { setRequestError(null); setRequestId(payload.request_id); pushLog(setLogs, 'Request acknowledged', payload); }],
      ['request_error', (payload) => { setRequestError(payload?.message || 'Request failed'); pushLog(setLogs, 'Request error', payload); }],
      ['eta_update', (payload) => {
        if (payload.request_id) {
          setEtas((prev) => ({ ...prev, [payload.request_id]: payload }));
          pushLog(setLogs, 'ETA update', payload);
        }
      }],
      ['push_notification', (payload) => {
        setNotifications((prev) => [...prev, payload].slice(-10));
        pushLog(setLogs, 'Notification', payload);
        // Browser notification
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(payload.message || 'Hotel Transport Update', {
            body: payload.message,
            icon: '/favicon.ico'
          });
        }
      }],
      ['flight_info', (payload) => {
        setFlightInfo(payload);
        pushLog(setLogs, 'Flight info', payload);
      }]
    ];
    handlers.forEach(([evt, fn]) => socket.on(evt, fn));
    return () => handlers.forEach(([evt, fn]) => socket.off(evt, fn));
  }, []);

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Apply theme immediately on mount and on changes - Prevent white flash
  useEffect(() => {
    // Apply theme synchronously to prevent white flash
    if (theme === 'light') {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      document.body.className = 'light bg-white text-slate-900';
    } else {
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
      document.body.className = 'dark bg-slate-950 text-slate-100';
    }
    // Persist theme preference
    if (typeof window !== 'undefined') {
      localStorage.setItem('theme', theme);
    }
  }, [theme]); // Run on mount and when theme changes

  // Fetch weather for Bedford, TX (Hotel location: 32.836, -97.138)
  useEffect(() => {
    const fetchWeather = async () => {
      try {
        // Using OpenWeatherMap API (free tier) - you'll need to add VITE_WEATHER_API_KEY to .env
        const apiKey = import.meta.env.VITE_WEATHER_API_KEY;
        if (!apiKey) {
          // Fallback: use a free weather API without key
          const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=32.836&longitude=-97.138&current=temperature_2m,weather_code&temperature_unit=fahrenheit`);
          const data = await response.json();
          if (data.current) {
            setWeather({
              temp: Math.round(data.current.temperature_2m),
              code: data.current.weather_code,
              unit: '°F'
            });
          }
        } else {
          const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=32.836&lon=-97.138&appid=${apiKey}&units=imperial`);
          const data = await response.json();
          if (data.main) {
            setWeather({
              temp: Math.round(data.main.temp),
              icon: data.weather[0]?.icon,
              description: data.weather[0]?.main,
              unit: '°F'
            });
          }
        }
      } catch (err) {
        console.error('Weather fetch error:', err);
        // Set default weather if fetch fails
        setWeather({ temp: 75, code: 1, unit: '°F', fallback: true });
      }
    };
    fetchWeather();
    // Update weather every 30 minutes
    const interval = setInterval(fetchWeather, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const isGuest = role === 'guest';

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-white text-slate-900'}`}>
      <header className={`border-b ${theme === 'dark' ? 'border-slate-800 bg-slate-900/95' : 'border-slate-200 bg-white'} backdrop-blur-sm px-4 py-3 sticky top-0 z-40 shadow-lg`}>
        {/* Top row: Logo, Weather, Language, Theme */}
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-400 flex items-center justify-center font-bold text-slate-950 flex-shrink-0">HT</div>
            <div className="min-w-0 flex-1">
              <div className="text-base sm:text-lg font-semibold truncate">Hotel Transport RTA</div>
              <div className="text-xs text-slate-400">Micro-logistics · live</div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <WeatherDisplay weather={weather} />
            <LangSwitcher lang={lang} setLang={setLang} />
            <ThemeToggle theme={theme} setTheme={setTheme} />
          </div>
        </div>
        {/* Bottom row: Connection, Role Switcher, Auth Status */}
        <div className="flex flex-wrap gap-2 items-center">
          <ConnectionPill state={connection} />
          <RoleSwitcher 
            role={role} 
            setRole={setRole}
            authToken={authToken}
            authUser={authUser}
            setShowLogin={setShowLogin}
            setPendingRole={setPendingRole}
          />
          {(role === 'driver' || role === 'admin') && authUser && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/50 text-xs">
              <span className="text-emerald-300">✓ {authUser.username}</span>
              <button
                onClick={() => {
                  localStorage.removeItem(`auth_token_${role}`);
                  localStorage.removeItem(`auth_user_${role}`);
                  setAuthToken(null);
                  setAuthUser(null);
                  setRole('guest');
                }}
                className="text-emerald-400 hover:text-emerald-200"
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </header>

      <main className={`p-4 sm:p-6 space-y-4 sm:space-y-6 ${isGuest ? '' : 'max-w-7xl mx-auto'}`}>
          {role === 'guest' && (
            <GuestPanel
              lang={lang}
              requestId={requestId}
              setRequestId={setRequestId}
              geofenceWarning={geofenceWarning}
              setGuestLoc={setGuestLoc}
              driverLoc={driverLoc}
              requestError={requestError}
              setRequestError={setRequestError}
              statusMap={statusMap}
              eta={etas[requestId]}
              flightInfo={flightInfo}
            />
          )}
          {role === 'driver' && !authToken && (
            <div className="text-center py-12">
              <p className="text-slate-400">Please login to access driver panel</p>
            </div>
          )}
          {role === 'driver' && authToken && (
            <DriverPanel
              driverLoc={driverLoc}
              requests={requests}
              statusMap={statusMap}
              logs={logs.slice(-5)}
              etas={etas}
            />
          )}
          {role === 'admin' && !authToken && (
            <div className="text-center py-12">
              <p className="text-slate-400">Please login to access admin panel</p>
            </div>
          )}
          {role === 'admin' && authToken && (
            <AdminPanel
              grouped={grouped}
              driverLoc={driverLoc}
              requests={requests}
              statusMap={statusMap}
              logs={logs}
              etas={etas}
            />
        )}
      </main>
      {notifications.length > 0 && (
        <NotificationToast
          notifications={notifications}
          onDismiss={() => setNotifications([])}
        />
      )}
      
      {/* Login Modal for Driver/Admin */}
      {showLogin && (role === 'driver' || role === 'admin') && (
        <LoginModal
          role={role}
          theme={theme}
          onLogin={(token, user) => {
            setAuthToken(token);
            setAuthUser(user);
            setShowLogin(false);
            setPendingRole(null);
          }}
          onCancel={() => {
            setShowLogin(false);
            setPendingRole(null);
            // Go back to guest if login cancelled
            setRole('guest');
          }}
        />
      )}
    </div>
  );
}

function RoleSwitcher({ role, setRole, authToken, authUser, setShowLogin, setPendingRole }) {
  const handleRoleChange = (newRole) => {
    if (newRole === 'guest') {
      // Logout if switching from driver/admin
      if (role === 'driver' || role === 'admin') {
        localStorage.removeItem(`auth_token_${role}`);
        localStorage.removeItem(`auth_user_${role}`);
      }
      setRole('guest');
      setShowLogin(false);
      setPendingRole(null);
      return;
    }

    // For driver/admin, check if already authenticated
    if (newRole === role && authToken) {
      // Already logged in to this role
      return;
    }

    // Check if token exists for this role
    const storedToken = localStorage.getItem(`auth_token_${newRole}`);
    const storedUser = localStorage.getItem(`auth_user_${newRole}`);

    if (storedToken && storedUser) {
      // Already authenticated, switch role
      setRole(newRole);
      setShowLogin(false);
      setPendingRole(null);
    } else {
      // Need to login - set role first, then show login
      setPendingRole(newRole);
      setRole(newRole); // Set role first so useEffect triggers login modal
      setShowLogin(true);
    }
  };

  return (
    <div className="flex gap-1 bg-slate-800 rounded-full p-1">
      {roles.map((r) => (
        <button
          key={r}
          onClick={() => handleRoleChange(r)}
          className={`px-3 py-1 rounded-full text-sm transition ${
            role === r ? 'bg-indigo-500 text-white shadow' : 'text-slate-300 hover:text-white'
          }`}
        >
          {r.toUpperCase()}
          {(r === 'driver' || r === 'admin') && r === role && authToken && (
            <span className="ml-1">✓</span>
          )}
        </button>
      ))}
    </div>
  );
}

function LangSwitcher({ lang, setLang }) {
  return (
    <div className="flex gap-1.5 text-xs sm:text-sm">
      <button 
        onClick={() => setLang('en')} 
        className={`px-2 py-1 rounded-md transition-all ${lang === 'en' ? 'font-semibold text-white bg-slate-700' : 'text-slate-400 hover:text-slate-300'}`}
      >
        EN
      </button>
      <span className="text-slate-600">|</span>
      <button 
        onClick={() => setLang('es')} 
        className={`px-2 py-1 rounded-md transition-all ${lang === 'es' ? 'font-semibold text-white bg-slate-700' : 'text-slate-400 hover:text-slate-300'}`}
      >
        ES
      </button>
    </div>
  );
}

function ThemeToggle({ theme, setTheme }) {
  return (
    <button
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all flex items-center justify-center touch-manipulation"
      aria-label="Toggle theme"
    >
      {theme === 'dark' ? (
        <span className="text-xl">🌙</span>
      ) : (
        <span className="text-xl">☀️</span>
      )}
    </button>
  );
}

function WeatherDisplay({ weather }) {
  if (!weather) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700">
        <span className="text-sm">🌤️</span>
        <span className="text-xs sm:text-sm text-slate-400">--°F</span>
      </div>
    );
  }

  const getWeatherIcon = () => {
    if (weather.icon) {
      return `https://openweathermap.org/img/wn/${weather.icon}@2x.png`;
    }
    // Fallback icons based on weather code
    const code = weather.code || 0;
    if (code === 0 || code === 1) return '☀️';
    if (code >= 2 && code <= 3) return '⛅';
    if (code >= 45 && code <= 48) return '🌫️';
    if (code >= 51 && code <= 67) return '🌧️';
    if (code >= 71 && code <= 77) return '❄️';
    if (code >= 80 && code <= 86) return '⛈️';
    if (code >= 95 && code <= 99) return '⛈️';
    return '🌤️';
  };

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700">
      {weather.icon ? (
        <img src={`https://openweathermap.org/img/wn/${weather.icon}.png`} alt={weather.description || 'Weather'} className="w-6 h-6" />
      ) : (
        <span className="text-base sm:text-lg">{getWeatherIcon()}</span>
      )}
      <span className="text-xs sm:text-sm font-semibold text-slate-200">
        {weather.temp}{weather.unit || '°F'}
      </span>
    </div>
  );
}

function ConnectionPill({ state }) {
  const color = state === 'connected' ? 'bg-emerald-500' : state === 'disconnected' ? 'bg-rose-500' : 'bg-amber-500';
  return (
    <div className="flex items-center gap-2 text-sm px-3 py-1 rounded-full bg-slate-800 border border-slate-700">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`}></span>
      <span className="text-slate-200 capitalize">{state}</span>
    </div>
  );
}

function GuestPanel({ lang, requestId, setRequestId, geofenceWarning, setGuestLoc, driverLoc, requestError, setRequestError, statusMap, eta, flightInfo }) {
  const [form, setForm] = useState({
    guest_name: '',
    terminal: '',
    airline_code: '',
    voucher_code: '',
    gate_proximity: '',
    courtesy_pickup: false,
    country_code: '+1',
    phone_number: '',
    passenger_count: 1,
    selected_seats: []
  });
  const [showSeatSelection, setShowSeatSelection] = useState(false);
  const [occupiedSeats, setOccupiedSeats] = useState([]);
  const [pendingSeats, setPendingSeats] = useState([]);
  const [coords, setCoords] = useState(null);
  const [trackingId, setTrackingId] = useState(null);
  const [shareLive, setShareLive] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [localError, setLocalError] = useState(null);

  const gateOptions = ['A10', 'A39', 'B4', 'B44', 'C19', 'C24', 'D1', 'D40', 'E11', 'E35'];

  useEffect(() => {
    return () => {
      if (trackingId) navigator.geolocation.clearWatch(trackingId);
    };
  }, [trackingId]);

  // Listen for seat availability updates
  useEffect(() => {
    const handleSeatAvailability = (data) => {
      setOccupiedSeats(data.booked || []);
      setPendingSeats(data.pending || []);
    };
    socket.on('seat_availability', handleSeatAvailability);
    return () => socket.off('seat_availability', handleSeatAvailability);
  }, []);

  const startTracking = () => {
    if (!navigator.geolocation) {
      setLocalError('Geolocation not supported on this device.');
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoords(c);
        setGuestLoc(c);
        if (requestId) {
          socket.emit('update_guest_location', { request_id: requestId, coords: c });
        }
      },
      (err) => console.error(err),
      { enableHighAccuracy: true, maximumAge: 2000 }
    );
    setTrackingId(id);
    setShareLive(true);
  };

  const stopTracking = () => {
    if (trackingId) {
      navigator.geolocation.clearWatch(trackingId);
      setTrackingId(null);
    }
    setShareLive(false);
  };

  const submit = (e) => {
    e.preventDefault();
    setRequestError?.(null);
    setLocalError(null);

    // client-side validation
    if (!form.guest_name.trim()) return setLocalError('Full name is required.');
    if (!form.country_code) return setLocalError('Country code is required.');
    const phoneDigits = form.phone_number.replace(/\D/g, '');
    if (phoneDigits.length !== 10) return setLocalError('Phone number must be 10 digits.');
    if (!form.terminal) return setLocalError('Terminal selection is required.');
    const voucher = (form.voucher_code || '').toUpperCase();
    if (!voucher || voucher.length !== 5) return setLocalError('Voucher code must be exactly 5 characters.');
    const gate = form.gate_proximity;
    if (!gate || !gateOptions.includes(gate)) return setLocalError('Gate selection is required.');
    if (!form.passenger_count || form.passenger_count < 1 || form.passenger_count > 20) {
      return setLocalError('Passenger count must be between 1 and 20.');
    }
    if (!form.selected_seats || form.selected_seats.length === 0) {
      return setLocalError(`Please select ${form.passenger_count} seat(s) before submitting.`);
    }
    if (form.selected_seats.length !== form.passenger_count) {
      return setLocalError(`Please select exactly ${form.passenger_count} seat(s) for ${form.passenger_count} passenger(s).`);
    }
    const conflictSeats = form.selected_seats.filter(seat => occupiedSeats.includes(seat));
    if (conflictSeats.length > 0) {
      return setLocalError(`Seats ${conflictSeats.join(', ')} are already booked. Please select different seats.`);
    }
    if (!coords || !shareLive) return setLocalError('Please enable "Share Live Location" before submitting.');

    const payload = {
      guest_name: form.guest_name,
      phone: `${form.country_code}${phoneDigits}`,
      airline_code: form.airline_code || undefined,
      terminal: (flightInfo?.suggested_terminal || form.terminal || '').toUpperCase(),
      voucher_code: voucher || undefined,
      gate_proximity: gate,
      courtesy_pickup: form.courtesy_pickup,
      passenger_count: form.passenger_count || 1,
      selected_seats: form.selected_seats || [],
      coordinates: coords
    };
    socket.emit('join_request', payload);
    setSubmitted(true);
    if (!trackingId) startTracking();
  };

  return (
    <>
      <Card title="Guest · Request Ride" accent="from-indigo-500 to-cyan-400" icon="/bus-journey.gif">
        <div className="space-y-4 sm:space-y-6">
          {/* Journey & Status Section - Show FIRST on mobile */}
          <div className="space-y-3 sm:space-y-4 order-1">
            {/* Horizontal Journey Timeline */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 border-2 border-slate-700 rounded-xl p-4 overflow-hidden">
              <div className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
                <img src="/bus-journey.gif" alt="" className="w-6 h-6" />
                <span>Your Journey</span>
              </div>
              <HorizontalJourney 
                status={statusMap[requestId]} 
                hasRequestId={!!requestId}
                hasCoords={!!coords}
              />
            </div>

            {/* Status Cards - Stack on mobile, 3 columns on desktop */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-gradient-to-br from-emerald-500/20 to-green-600/20 border-2 border-emerald-500/50 rounded-xl p-3 sm:p-4">
                <div className="text-xs text-emerald-300 mb-2 flex items-center gap-1.5">
                  <img src="/checklist.gif" alt="" className="w-4 h-4" />
                  <span>Request</span>
                </div>
                <div className="text-base sm:text-lg font-bold text-emerald-200 flex items-center gap-2">
                  {requestId ? (
                    <>
                      <span className="text-xl">✓</span>
                      <span>Submitted</span>
                    </>
                  ) : (
                    <>
                      <span className="text-xl">⏳</span>
                      <span>Draft</span>
                    </>
                  )}
                </div>
              </div>
              <div className="bg-gradient-to-br from-blue-500/20 to-cyan-600/20 border-2 border-blue-500/50 rounded-xl p-3 sm:p-4">
                <div className="text-xs text-blue-300 mb-2 flex items-center gap-1.5">
                  <img src="/location.gif" alt="" className="w-4 h-4" />
                  <span>Tracking</span>
                </div>
                <div className="text-base sm:text-lg font-bold text-blue-200 flex items-center gap-2">
                  <img src="/location.gif" alt="" className="w-5 h-5 opacity-60" />
                  <span>{coords ? 'Active' : 'Idle'}</span>
                </div>
              </div>
              <div className="bg-gradient-to-br from-purple-500/20 to-indigo-600/20 border-2 border-purple-500/50 rounded-xl p-3 sm:p-4">
                <div className="text-xs text-purple-300 mb-2 flex items-center gap-1.5">
                  <img src="/warning.gif" alt="" className="w-4 h-4" />
                  <span>Geofence</span>
                </div>
                <div className="text-base sm:text-lg font-bold text-purple-200 flex items-center gap-2">
                  <img src={geofenceWarning ? "/warning.gif" : "/checklist.gif"} alt="" className="w-5 h-5" />
                  <span>{geofenceWarning ? 'Warning' : 'OK'}</span>
                </div>
              </div>
            </div>

            {/* ETA Display - Compact on mobile, full on desktop */}
            {requestId && (
              <div className="bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-indigo-500/20 border-2 border-cyan-500/50 rounded-xl p-4 sm:p-5 space-y-3 shadow-lg">
                <div className="flex items-center gap-3 mb-2">
                  <img src="/bus-journey.gif" alt="" className="w-8 h-8 sm:w-10 sm:h-10 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm sm:text-base font-bold text-cyan-200 mb-1">Estimated Arrival Time</div>
                    <div className="text-xs text-cyan-300/80">Based on traffic & road conditions</div>
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <div className="text-4xl sm:text-5xl font-extrabold text-cyan-100">45-50</div>
                  <div className="text-lg sm:text-xl text-cyan-300 font-semibold">minutes</div>
                </div>
                <div className="bg-gradient-to-r from-cyan-600/30 to-blue-600/30 rounded-lg p-3 sm:p-4 border border-cyan-400/40">
                  <div className="text-xs sm:text-sm text-cyan-200/90 leading-relaxed">
                    <span className="font-bold">Stay tuned</span> - our shuttle will pick you up! We're monitoring traffic conditions and will keep you updated in real-time.
                  </div>
                </div>
                {eta && (statusMap[requestId] === 'accepted' || statusMap[requestId] === 'picked_up') && (
                  <div className="pt-3 border-t border-cyan-500/30">
                    <div className="text-xs text-cyan-300/80 mb-1.5 flex items-center gap-1.5">
                      <img src="/map.gif" alt="" className="w-3.5 h-3.5" />
                      <span>Live Tracking (Updated every 30s):</span>
                    </div>
                    <div className="flex items-center justify-between bg-slate-900/40 rounded-lg px-3 py-2.5">
                      <span className="text-xs text-cyan-200 flex items-center gap-1.5">
                        <img src="/bus-journey.gif" alt="" className="w-3.5 h-3.5" />
                        <span>Current ETA:</span>
                      </span>
                      <span className="text-sm font-bold text-cyan-100">{eta.etaMinutes} min ({eta.distanceKm} km)</span>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* Tip Section */}
            <div className="bg-slate-800/60 border-2 border-slate-700 rounded-xl p-3 sm:p-4">
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed flex items-start gap-2">
                <span className="text-base sm:text-lg flex-shrink-0">💡</span>
                <span><span className="font-semibold text-slate-300">Tip:</span> Keep this tab open for live updates. Your location auto-updates to the driver and admin.</span>
              </p>
            </div>
          </div>

          {/* Form Section - Show SECOND on mobile */}
          <div className="space-y-4 order-2">
          <form className="space-y-4 sm:space-y-4" onSubmit={submit}>
            <Input 
              icon="/name-card.gif"
              value={form.guest_name} 
              onChange={(v) => setForm({ ...form, guest_name: v })} 
              placeholder="Full Name *"
              required 
            />
            {/* Phone Number - Full width on mobile, split on desktop */}
            <div className="grid grid-cols-1 sm:grid-cols-[110px,1fr] gap-3">
              <Select
                value={form.country_code}
                onChange={(v) => setForm({ ...form, country_code: v })}
                options={['+1', '+52', '+57', '+44', '+91']}
                placeholder="Code *"
                required
              />
              <Input 
                icon="/phone.gif"
                type="tel"
                value={form.phone_number} 
                onChange={(v) => setForm({ ...form, phone_number: v })} 
                placeholder="10-digit Phone Number *"
                required 
              />
            </div>
            <Input
              icon="/airplane.gif"
              value={form.airline_code}
              onChange={(v) => setForm({ ...form, airline_code: v.toUpperCase() })}
              placeholder="Flight Code (Optional)"
              required={false}
            />
            {flightInfo && flightInfo.suggested_terminal && (
              <div className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 flex items-start gap-2">
                <img src="/airplane.gif" alt="" className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium">Flight detected: Terminal {flightInfo.suggested_terminal} suggested</div>
                  {flightInfo.delayed && flightInfo.delayed > 0 && (
                    <div className="block text-amber-400 mt-1">⚠️ Flight delayed by {Math.floor(flightInfo.delayed / 60)} minutes</div>
                  )}
                </div>
              </div>
            )}
            <Select
              icon="/destination.gif"
              value={flightInfo?.suggested_terminal || form.terminal}
              onChange={(v) => setForm({ ...form, terminal: v })}
              options={['A', 'B', 'C', 'D', 'E']}
              placeholder="Select Terminal *"
              required
            />
            {/* Voucher Code - Important Notice */}
            <div className="bg-amber-500/10 border-2 border-amber-500/50 rounded-xl p-3 sm:p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-amber-200">
                <img src="/warning.gif" alt="" className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                <span className="px-2.5 py-1 rounded-full bg-amber-500/30 border border-amber-400/50 text-xs font-bold">IMPORTANT</span>
                <span className="text-xs sm:text-sm flex-1">Enter check-in code to verify reservation</span>
              </div>
              <Input 
                icon="/voucher-code.gif"
                value={form.voucher_code} 
                onChange={(v) => setForm({ ...form, voucher_code: v.toUpperCase() })} 
                placeholder="Enter 5-character Voucher Code *"
                required
              />
            </div>
            <Select
              icon="/plane-ticket.gif"
              value={form.gate_proximity}
              onChange={(v) => setForm({ ...form, gate_proximity: v })}
              options={gateOptions}
              placeholder="Select Gate Number *"
              required
            />
            
            {/* Passenger Count */}
            <Select
              icon="/total-passangers.gif"
              value={form.passenger_count?.toString() || '1'}
              onChange={(v) => {
                const count = parseInt(v) || 1;
                setForm({ 
                  ...form, 
                  passenger_count: count,
                  selected_seats: form.selected_seats?.slice(0, count) || []
                });
              }}
              options={Array.from({ length: 20 }, (_, i) => (i + 1).toString())}
              placeholder="Number of Passengers *"
              required
            />

            {/* Seat Selection Button */}
            {form.passenger_count > 0 && (
              <div className="space-y-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowSeatSelection(!showSeatSelection)}
                  className="w-full flex items-center justify-center gap-2 py-3"
                >
                  <img src="/checklist.gif" alt="" className="w-5 h-5" />
                  <span>{showSeatSelection ? 'Hide Seat Selection' : 'Select Seats *'}</span>
                  {form.selected_seats?.length > 0 && (
                    <span className="ml-2 px-2.5 py-0.5 bg-indigo-600 rounded-full text-xs font-semibold">
                      {form.selected_seats.length} selected
                    </span>
                  )}
                </Button>
                {showSeatSelection && (
                  <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                    <ShuttleSeatSelection
                      passengerCount={form.passenger_count}
                      selectedSeats={form.selected_seats || []}
                      onSeatChange={(seats) => setForm({ ...form, selected_seats: seats })}
                      occupiedSeats={occupiedSeats}
                      pendingSeats={pendingSeats}
                      readonly={!!requestId && statusMap[requestId] === 'accepted'}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Toggle Sections - Better spacing on mobile */}
            <div className="bg-slate-800/60 border-2 border-slate-700 rounded-xl p-4 sm:p-5 space-y-3">
              <Toggle
                icon="/location.gif"
                label="At Courtesy Pickup Vans?"
                description="Are you currently at Courtesy Pickup Vans?"
                checked={form.courtesy_pickup}
                onChange={(v) => setForm({ ...form, courtesy_pickup: v })}
              />
            </div>
            
            <div className="bg-slate-800/60 border-2 border-slate-700 rounded-xl p-4 sm:p-5 space-y-3">
              <Toggle
                icon="/location.gif"
                label="Share Live Location"
                description="Enable continuous location sharing for driver tracking"
                checked={shareLive}
                onChange={(v) => {
                  if (v) startTracking();
                  else stopTracking();
                }}
                required
              />
            </div>

            {/* Submit Button - Larger on mobile */}
              <Button 
                type="submit" 
                variant="primary"
              className="w-full text-base sm:text-lg py-4 sm:py-3.5 flex items-center justify-center gap-2.5 mt-2 touch-manipulation"
              >
              <img src="/bus-journey.gif" alt="" className="w-6 h-6 sm:w-5 sm:h-5" />
              <span className="font-bold">Request Ride</span>
              </Button>
          </form>
          
          {/* Form Status Messages - Better styling on mobile */}
          <div className="text-xs sm:text-sm text-slate-400 space-y-3 mt-4">
            {coords && (
              <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 break-all">
                <span className="font-semibold text-slate-300">📍 Location: </span>
                <span className="text-slate-400">{coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</span>
            </div>
            )}
          {requestId && (
              <div className="bg-emerald-500/20 border border-emerald-500/50 rounded-lg p-3">
                <span className="font-semibold text-emerald-300">✅ Request ID: </span>
                <span className="text-emerald-200 font-mono text-xs break-all">{requestId}</span>
                </div>
            )}
            {submitted && !requestId && !requestError && (
              <div className="bg-amber-500/20 border-2 border-amber-500/50 rounded-lg p-3 sm:p-4 text-amber-300 flex items-center gap-2.5">
                <span className="text-xl flex-shrink-0">⏳</span>
                <span className="text-sm sm:text-base">Waiting for request acknowledgment…</span>
                  </div>
            )}
            {requestError && (
              <div className="bg-rose-500/20 border-2 border-rose-500/50 rounded-lg p-3 sm:p-4 text-rose-300 flex items-start gap-2.5">
                <span className="text-xl flex-shrink-0">⚠️</span>
                <span className="flex-1 text-sm sm:text-base">{requestError}</span>
                  </div>
            )}
            {localError && (
              <div className="bg-rose-500/20 border-2 border-rose-500/50 rounded-lg p-3 sm:p-4 text-rose-300 flex items-start gap-2.5">
                <span className="text-xl flex-shrink-0">⚠️</span>
                <span className="flex-1 text-sm sm:text-base">{localError}</span>
                </div>
            )}
            {geofenceWarning && (
              <div className="bg-amber-500/20 border-2 border-amber-500/50 rounded-lg p-3 sm:p-4 text-amber-300 flex items-start gap-2.5">
                <span className="text-xl flex-shrink-0">📍</span>
                <div className="flex-1 text-sm sm:text-base">
                  <div className="font-semibold mb-1">GPS Warning</div>
                  <div className="text-xs sm:text-sm opacity-90">
                    Location: {geofenceWarning.coords?.lat?.toFixed?.(3)}, {geofenceWarning.coords?.lng?.toFixed?.(3)}
              </div>
                  <div className="text-xs sm:text-sm opacity-90 mt-1">
                    Terminal selected: {geofenceWarning.terminal}
              </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Live Shuttle Status Bar - Show when request submitted */}
      {requestId && (
        <div className="mt-4 sm:mt-6">
          <LiveShuttleStatus
            status={statusMap[requestId]}
            eta={eta}
            driverLoc={driverLoc && (statusMap[requestId] === 'accepted' || statusMap[requestId] === 'picked_up' || statusMap[requestId] === 'completed') ? driverLoc : null}
            guestLoc={coords}
            requestId={requestId}
          />
        </div>
      )}

      {/* Live Map - Full width on mobile, optimized height - Orange route when location shared */}
      <Card title="Live Map & Route" accent="from-blue-500 to-cyan-600" icon="/map.gif">
        <div className="space-y-3 mb-3">
          <div className="flex flex-wrap gap-2 text-xs sm:text-sm">
            <span className="px-2.5 py-1.5 rounded-full bg-green-500/20 text-green-300 border border-green-500/50 flex items-center gap-1.5">
              <img src="/hotel.gif" alt="" className="w-3.5 h-3.5" />
              <span>Hotel</span>
            </span>
            {driverLoc && (statusMap[requestId] === 'accepted' || statusMap[requestId] === 'picked_up' || statusMap[requestId] === 'completed') && (
              <span className="px-2.5 py-1.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 flex items-center gap-1.5">
                <img src="/bus-journey.gif" alt="" className="w-3.5 h-3.5" />
                <span>Shuttle</span>
              </span>
            )}
            {coords && (
              <span className="px-2.5 py-1.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/50 flex items-center gap-1.5">
                <img src="/location.gif" alt="" className="w-3.5 h-3.5" />
                <span>You</span>
              </span>
            )}
            {coords && shareLive && (
              <span className="px-2.5 py-1.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/50 flex items-center gap-1.5">
                <img src="/bus-journey.gif" alt="" className="w-3.5 h-3.5" />
                <span>Route</span>
              </span>
            )}
          </div>
        </div>
        <div className="rounded-xl border-2 border-slate-800 bg-slate-900 overflow-hidden shadow-xl" style={{ height: '350px', minHeight: '350px' }}>
          <LiveMap 
            driver={(statusMap[requestId] === 'accepted' || statusMap[requestId] === 'picked_up' || statusMap[requestId] === 'completed') ? driverLoc : null}
            guests={coords && shareLive ? [coords] : []} 
            showRoute={!!coords && !!shareLive}
            fromHotel={true}
            alwaysShowHotel={true}
          />
        </div>
      </Card>
      
      {/* Real-time Chat with Driver - Only show when request is submitted */}
      {requestId && (
        <ChatPanel 
        requestId={requestId}
        role="guest"
        userName={form.guest_name || 'Guest'}
          lang={lang}
      />
      )}
    </>
  );
}

function DriverPanel({ driverLoc, requests, statusMap, logs, etas }) {
  const [lastSent, setLastSent] = useState(null);
  const [intervalId, setIntervalId] = useState(null);
  const [selectedRequestId, setSelectedRequestId] = useState(null);

  const activeRequests = (requests || []).filter((r) => r.status !== 'completed');

  useEffect(() => {
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [intervalId]);

  const sendOnce = () => {
    if (!navigator.geolocation) {
      alert('Geolocation not supported on this device.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLastSent(c);
        socket.emit('update_driver_location', c);
        // Request ETA for all active requests
        activeRequests.forEach(req => {
          socket.emit('request_eta', { request_id: req.id });
        });
      },
      (err) => {
        console.error('Location error:', err);
        alert('Failed to get location. Please check GPS permissions.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const toggleStream = () => {
    if (intervalId) {
      clearInterval(intervalId);
      setIntervalId(null);
      return;
    }
    if (!navigator.geolocation) {
      alert('Geolocation not supported on this device.');
      return;
    }
    const id = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setLastSent(c);
          socket.emit('update_driver_location', c);
          // Request ETA for all active requests
          activeRequests.forEach(req => {
            socket.emit('request_eta', { request_id: req.id });
          });
        },
        (err) => console.error('Location error:', err),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }, 10000);
    setIntervalId(id);
  };

  const handleImHere = (requestId) => {
    socket.emit('driver_arrived', { request_id: requestId });
  };

  return (
    <>
      {/* Location Controls - Compact on mobile */}
      <Card title="Location Sharing" accent="from-cyan-500 to-emerald-400" icon="/location.gif">
        <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <Button 
            variant="primary" 
            onClick={sendOnce}
              className="flex-1 flex items-center justify-center gap-2 py-3 sm:py-2.5 text-base sm:text-base"
          >
              <img src="/location.gif" alt="" className="w-5 h-5 sm:w-4 sm:h-4" />
            <span>Send Location Once</span>
          </Button>
          <Button 
            variant={intervalId ? 'ghost' : 'secondary'} 
            onClick={toggleStream}
              className={`flex-1 flex items-center justify-center gap-2 py-3 sm:py-2.5 text-base sm:text-base ${intervalId ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}`}
          >
              <img src={intervalId ? "/checklist.gif" : "/location.gif"} alt="" className="w-5 h-5 sm:w-4 sm:h-4" />
            <span>{intervalId ? 'Stop Streaming' : 'Start Streaming (10s)'}</span>
          </Button>
        </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs sm:text-sm bg-slate-800/50 rounded-lg p-3">
          {lastSent && (
              <div className="text-slate-300 break-all">
                <span className="font-semibold text-slate-200">Last Sent:</span><br className="sm:hidden" />
                <span className="text-slate-400 ml-1 sm:ml-0">{lastSent.lat.toFixed(5)}, {lastSent.lng.toFixed(5)}</span>
            </div>
          )}
          {driverLoc && (
              <div className="text-slate-300 break-all">
                <span className="font-semibold text-slate-200">Broadcasting:</span><br className="sm:hidden" />
                <span className="text-emerald-400 ml-1 sm:ml-0">{driverLoc.lat?.toFixed?.(5)}, {driverLoc.lng?.toFixed?.(5)}</span>
            </div>
          )}
            {!lastSent && !driverLoc && (
              <div className="col-span-2 text-center text-slate-500 text-sm py-2">
                Click "Send Location Once" to start sharing your location
        </div>
            )}
      </div>
        </div>
      </Card>

      {/* Active Requests - Mobile-first layout */}
      <Card title="Active Ride Requests" accent="from-indigo-500 to-purple-600" icon="/bus-journey.gif">
        <div className="space-y-4">
          {/* Request Count Badge */}
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-slate-400">
              {activeRequests.length === 0 ? 'No requests yet' : `${activeRequests.length} ${activeRequests.length === 1 ? 'active request' : 'active requests'}`}
            </div>
            {activeRequests.length > 0 && (
              <span className="bg-indigo-500/20 text-indigo-300 text-xs font-semibold px-3 py-1 rounded-full border border-indigo-500/50">
                {activeRequests.length}
            </span>
            )}
          </div>
          
          {/* Requests List */}
          <div className="space-y-4 max-h-[calc(100vh-600px)] sm:max-h-[700px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900">
            {activeRequests.length === 0 ? (
              <div className="text-center py-16 text-slate-500 bg-slate-900/50 rounded-xl border border-slate-800">
                <div className="text-5xl mb-3">🚕</div>
                <div className="text-base font-medium text-slate-400 mb-1">No active ride requests</div>
                <div className="text-sm text-slate-500">Waiting for guest requests...</div>
              </div>
            ) : (
              activeRequests.map((req) => {
                const reqEta = etas[req.id];
                const currentStatus = statusMap[req.id] || req.status || 'pending';
                
                return (
                  <div key={req.id} className="bg-slate-900/70 border-2 border-slate-800 rounded-2xl p-4 sm:p-5 hover:border-cyan-500/50 transition-all space-y-4 shadow-lg">
                    {/* Guest Name & Status */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-800">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg sm:text-xl">
                          {req.guest_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-bold text-lg sm:text-xl text-slate-100">{req.guest_name}</div>
                          <div className="text-xs text-slate-400 mt-0.5">Request ID: {req.id.slice(0, 8)}...</div>
                        </div>
                      </div>
                      <StatusPill label="Status" value={currentStatus} tone="blue" />
                    </div>

                    {/* Request Details Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700">
                        <div className="text-xs text-slate-400 mb-1.5 flex items-center gap-1.5">
                          <img src="/destination.gif" alt="" className="w-4 h-4" />
                          <span>Terminal</span>
                        </div>
                        <div className="text-base font-bold text-slate-100">Terminal {req.terminal}</div>
                      </div>
                      <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700">
                        <div className="text-xs text-slate-400 mb-1.5 flex items-center gap-1.5">
                          <img src="/plane-ticket.gif" alt="" className="w-4 h-4" />
                          <span>Gate</span>
                        </div>
                        <div className="text-base font-bold text-slate-100">Gate {req.gate_proximity}</div>
                      </div>
                          {req.passenger_count && (
                        <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700">
                          <div className="text-xs text-slate-400 mb-1.5 flex items-center gap-1.5">
                            <img src="/total-passangers.gif" alt="" className="w-4 h-4" />
                            <span>Passengers</span>
                          </div>
                          <div className="text-base font-bold text-slate-100">
                            {req.passenger_count} {req.passenger_count === 1 ? 'passenger' : 'passengers'}
                          </div>
                          {req.selected_seats && Array.isArray(req.selected_seats) && req.selected_seats.length > 0 && (
                            <div className="text-xs text-slate-400 mt-1">Seats: {req.selected_seats.join(', ')}</div>
                          )}
                        </div>
                      )}
                      {req.voucher_code && (
                        <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700">
                          <div className="text-xs text-slate-400 mb-1.5 flex items-center gap-1.5">
                            <img src="/voucher-code.gif" alt="" className="w-4 h-4" />
                            <span>Voucher</span>
                      </div>
                          <div className="text-base font-bold text-slate-100 font-mono">{req.voucher_code}</div>
                        </div>
                      )}
                    </div>

                    {/* ETA Display */}
                    {reqEta && (
                      <div className="bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border-2 border-cyan-500/50 rounded-xl p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="text-sm text-cyan-300 mb-1 flex items-center gap-2">
                              <img src="/bus-journey.gif" alt="" className="w-4 h-4" />
                              <span>Estimated Arrival</span>
                            </div>
                            <div className="text-2xl sm:text-3xl font-extrabold text-cyan-100">{reqEta.etaMinutes} min</div>
                            <div className="text-xs sm:text-sm text-cyan-300/80 mt-1">{reqEta.distanceKm} km ({reqEta.distanceMiles} mi) away</div>
                          </div>
                          <div className="text-4xl opacity-50">🚐</div>
                        </div>
                      </div>
                    )}

                    {/* Contact - Large touch target on mobile */}
                    <div className="bg-gradient-to-r from-slate-800/80 to-slate-900/80 rounded-xl p-3 border border-slate-700">
                      <div className="text-xs text-slate-400 mb-2 flex items-center gap-1.5">
                        <img src="/phone.gif" alt="" className="w-4 h-4" />
                        <span>Contact Guest</span>
                      </div>
                      <a 
                        href={`tel:${req.phone}`} 
                        className="block text-lg sm:text-base font-bold text-cyan-400 hover:text-cyan-300 transition-colors py-2 px-2 rounded-lg hover:bg-slate-800/50"
                      >
                        <div className="flex items-center gap-2">
                          <img src="/phone.gif" alt="" className="w-5 h-5" />
                        <span>{req.phone}</span>
                        </div>
                      </a>
                    </div>

                    {/* Action Buttons - Mobile optimized */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2">
                      <Button 
                        variant="secondary" 
                        onClick={() => window.open(`tel:${req.phone}`, '_self')}
                        className="py-3 sm:py-2.5 flex items-center justify-center gap-2 text-sm sm:text-sm font-semibold touch-manipulation"
                      >
                        <img src="/phone.gif" alt="" className="w-5 h-5 sm:w-4 sm:h-4" />
                        <span className="hidden sm:inline">Call</span>
                        <span className="sm:hidden">📞 Call</span>
                      </Button>
                      <Button 
                        variant="secondary" 
                        onClick={() => setSelectedRequestId(req.id)}
                        className="py-3 sm:py-2.5 flex items-center justify-center gap-2 text-sm sm:text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white touch-manipulation"
                      >
                        <span className="text-lg sm:text-base">💬</span>
                        <span>Chat</span>
                      </Button>
                      <Button 
                        variant="ghost" 
                        onClick={() => window.open(`https://www.google.com/maps?q=${req.coordinates?.lat},${req.coordinates?.lng}`, '_blank')}
                        className="py-3 sm:py-2.5 flex items-center justify-center gap-2 text-sm sm:text-sm font-semibold touch-manipulation"
                      >
                        <img src="/map.gif" alt="" className="w-5 h-5 sm:w-4 sm:h-4" />
                        <span>Map</span>
                      </Button>
                      <Button 
                        variant="primary" 
                        onClick={() => handleImHere(req.id)}
                        className="py-3 sm:py-2.5 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 flex items-center justify-center gap-2 text-sm sm:text-sm font-semibold touch-manipulation col-span-2 sm:col-span-1"
                      >
                        <img src="/location.gif" alt="" className="w-5 h-5 sm:w-4 sm:h-4" />
                        <span>I'm Here</span>
                      </Button>
                    </div>

                    {/* Status Update - Mobile friendly */}
                    <div className="border-t-2 border-slate-800 pt-4 space-y-2">
                      <div className="space-y-2">
                        <div className="text-xs text-slate-400 font-semibold flex items-center gap-1.5 mb-1">
                          <img src="/checklist.gif" alt="" className="w-3.5 h-3.5" />
                          <span>Update Status</span>
                        </div>
                      <Select
                        icon="/checklist.gif"
                        value={currentStatus}
                        onChange={(v) => {
                          socket.emit('status_change', { request_id: req.id, status: v });
                          if (v === 'accepted') {
                            socket.emit('request_eta', { request_id: req.id });
                          }
                        }}
                        options={['pending', 'accepted', 'picked_up', 'completed']}
                        placeholder="Select status"
                          required={false}
                      />
                      </div>
                      <div className="text-xs text-slate-500 leading-relaxed pt-1">
                        <span className="font-semibold text-slate-400">Flow:</span> Pending → Accepted → Picked Up → Completed
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </Card>

      {/* Map Section - Full width on mobile, positioned after requests */}
      <Card title="Live Map - All Guests" accent="from-cyan-500 to-blue-600" icon="/map.gif">
        <div className="rounded-xl border-2 border-slate-800 bg-slate-900 overflow-hidden shadow-xl" style={{ height: '400px', minHeight: '400px' }}>
            <LiveMap 
              driver={driverLoc} 
              guests={activeRequests.map((r) => r.coordinates).filter(Boolean)}
              showRoute={true}
              fromHotel={false}
            alwaysShowHotel={true}
          />
      </div>
      </Card>
      
      {/* Real-time Chat - Show when driver selects a request */}
      {selectedRequestId && (
        <ChatPanel 
        requestId={selectedRequestId}
        role="driver"
        userName="Driver"
          lang="en"
      />
      )}
    </>
  );
}

function AdminPanel({ grouped, driverLoc, requests, statusMap, logs, etas }) {
  const groups = useMemo(() => {
    if (!grouped || grouped.length === 0) return [];
    // Update status in grouped requests from statusMap
    return grouped.map(g => ({
      ...g,
      requests: g.requests.map(r => ({
        ...r,
        status: statusMap[r.id] || r.status || 'pending'
      }))
    }));
  }, [grouped, statusMap]);

  const exportCSV = async () => {
    try {
      const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';
      const response = await fetch(`${socketUrl}/api/export/csv`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `shuttle-requests-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('CSV export failed:', err);
      alert('Failed to export CSV. Please try again.');
    }
  };

  return (
    <>
      {/* Driver Location & Export */}
      <Card title="Admin Control" accent="from-amber-400 to-pink-500" icon="/bus-journey.gif">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr,auto] gap-3 sm:gap-4">
            <div className="bg-slate-800/60 border-2 border-slate-700 rounded-xl p-4 text-sm text-slate-300 flex items-center gap-3">
              <img src="/location.gif" alt="" className="w-6 h-6 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-200 mb-1">Driver Location</div>
                <div className="text-xs sm:text-sm text-slate-400 break-all">
                {driverLoc ? `${driverLoc.lat?.toFixed?.(5)}, ${driverLoc.lng?.toFixed?.(5)}` : 'No signal yet'}
              </div>
            </div>
          </div>
            <Button 
              variant="primary" 
              onClick={exportCSV} 
              className="flex items-center justify-center gap-2 py-3 sm:py-2.5 text-base sm:text-base font-semibold touch-manipulation"
            >
              <img src="/checklist.gif" alt="" className="w-5 h-5 sm:w-4 sm:h-4" />
            <span>Export CSV</span>
          </Button>
        </div>
          </div>
      </Card>

      {/* Live Map - Full width on mobile */}
      <Card title="Live Map - All Requests" accent="from-blue-500 to-cyan-600" icon="/map.gif">
        <div className="rounded-xl border-2 border-slate-800 bg-slate-900 overflow-hidden shadow-xl" style={{ height: '400px', minHeight: '400px' }}>
          <LiveMap 
            driver={driverLoc} 
            guests={(requests || []).map((r) => r.coordinates).filter(Boolean)} 
            showRoute={false}
            fromHotel={false}
            alwaysShowHotel={true}
          />
        </div>
      </Card>

      {/* Grouped Requests - Mobile optimized */}
      <Card title="Grouped Requests by Terminal" accent="from-purple-500 to-indigo-600" icon="/destination.gif">
        <div className="space-y-4">
          {groups.length === 0 ? (
            <div className="text-center py-12 text-slate-500 bg-slate-900/50 rounded-xl border border-slate-800">
              <div className="text-4xl mb-3">📋</div>
              <div className="text-base font-medium text-slate-400 mb-1">No grouped requests yet</div>
              <div className="text-sm text-slate-500">Requests will be grouped by terminal when submitted</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {groups.map((g, idx) => (
                <div key={idx} className="bg-slate-900/70 border-2 border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3 shadow-lg">
                  <div className="flex justify-between items-center pb-3 border-b border-slate-800">
                    <div className="font-bold text-lg text-slate-100 flex items-center gap-2">
                      <img src="/destination.gif" alt="" className="w-6 h-6" />
                  <span>Terminal {g.terminal}</span>
                </div>
                    <div className="text-xs bg-indigo-500/20 text-indigo-300 rounded-full px-3 py-1.5 font-semibold border border-indigo-500/50 flex items-center gap-1.5">
                      <img src="/total-passangers.gif" alt="" className="w-4 h-4" />
                  <span>{g.count} {g.count === 1 ? 'rider' : 'riders'}</span>
                </div>
              </div>
                  <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900">
                {g.requests.map((r) => (
                      <div key={r.id} className="bg-slate-800/60 border border-slate-700 rounded-xl p-3 space-y-2">
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 pb-2 border-b border-slate-700">
                      <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-pink-500 flex items-center justify-center text-white font-bold text-sm">
                              {r.guest_name.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-semibold text-slate-100 text-sm sm:text-base">{r.guest_name}</span>
                      </div>
                      <StatusPill label="" value={r.status} tone="blue" />
                    </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-400">
                          <span className="flex items-center gap-1.5">
                            <img src="/plane-ticket.gif" alt="" className="w-3.5 h-3.5" />
                        <span>Gate: {r.gate_proximity || '—'}</span>
                      </span>
                          <span className="flex items-center gap-1.5">
                            <img src="/phone.gif" alt="" className="w-3.5 h-3.5" />
                            <span className="break-all">{r.phone}</span>
                          </span>
                          <span className="flex items-center gap-1.5">
                            <img src="/location.gif" alt="" className="w-3.5 h-3.5" />
                        <span>Courtesy: {r.courtesy_pickup ? 'Yes' : 'No'}</span>
                      </span>
                      {r.passenger_count && (
                            <span className="flex items-center gap-1.5">
                              <img src="/total-passangers.gif" alt="" className="w-3.5 h-3.5" />
                          <span>{r.passenger_count} passenger{r.passenger_count > 1 ? 's' : ''}</span>
                        </span>
                      )}
                          <span className="flex items-center gap-1.5">
                            <img src="/voucher-code.gif" alt="" className="w-3.5 h-3.5" />
                        <span>Voucher: {r.voucher_code || '—'}</span>
                      </span>
                      {r.selected_seats && Array.isArray(r.selected_seats) && r.selected_seats.length > 0 && (
                            <span className="flex items-center gap-1.5 sm:col-span-2">
                              <img src="/checklist.gif" alt="" className="w-3.5 h-3.5" />
                          <span>Seats: {r.selected_seats.join(', ')}</span>
                        </span>
                      )}
                    </div>
                    {r.coordinates && (
                          <div className="text-xs text-slate-500 flex items-center gap-1.5 pt-2 border-t border-slate-800">
                            <img src="/location.gif" alt="" className="w-3.5 h-3.5" />
                            <span className="break-all">
                              {r.coordinates?.lat?.toFixed?.(4) || '—'}, {r.coordinates?.lng?.toFixed?.(4) || '—'}
                            </span>
                      </div>
                    )}
                        {/* Admin Status Update Control */}
                        <div className="pt-2 border-t border-slate-700">
                          <div className="text-xs text-slate-400 font-semibold mb-1.5 flex items-center gap-1.5">
                            <img src="/checklist.gif" alt="" className="w-3.5 h-3.5" />
                            <span>Update Status</span>
                          </div>
                          <Select
                            icon="/checklist.gif"
                            value={r.status || 'pending'}
                            onChange={(v) => {
                              socket.emit('status_change', { request_id: r.id, status: v });
                              if (v === 'accepted') {
                                socket.emit('request_eta', { request_id: r.id });
                              }
                            }}
                            options={['pending', 'accepted', 'picked_up', 'completed', 'cancelled']}
                            placeholder="Select status"
                            required={false}
                          />
                        </div>
                      </div>
                ))}
                  </div>
            </div>
          ))}
        </div>
          )}
      </div>
    </Card>

      {/* Event Log - Collapsible on mobile */}
      {logs?.length > 0 && (
        <Card title="Event Log" accent="from-slate-600 to-slate-700" icon="/tech-support.gif">
          <div className="max-h-[300px] sm:max-h-[400px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900">
            <EventFeed logs={logs} />
          </div>
        </Card>
      )}
    </>
  );
}

function EventFeed({ logs }) {
  return (
    <div className="space-y-2 text-sm">
      {logs.slice().reverse().map((log, idx) => (
        <div key={idx} className="border border-slate-800 rounded-xl p-2 bg-slate-900/60">
          <div className="flex justify-between text-xs text-slate-500">
            <span>{log.label}</span>
            <span>{log.ts.toLocaleTimeString()}</span>
          </div>
          <pre className="text-xs whitespace-pre-wrap text-slate-200">{JSON.stringify(log.data, null, 2)}</pre>
        </div>
      ))}
      {!logs.length && <div className="text-slate-500 text-sm">Waiting for events…</div>}
    </div>
  );
}

function Card({ title, accent, children, icon }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-6 shadow-lg shadow-slate-900/40">
      <div className="flex items-center gap-3 mb-4 sm:mb-3">
        <div className={`h-2 w-10 rounded-full bg-gradient-to-r ${accent}`} />
        {icon && (
          <img src={icon} alt="" className="w-6 h-6 sm:w-7 sm:h-7 object-contain flex-shrink-0" />
        )}
        <h2 className="text-base sm:text-lg font-semibold text-white">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Input({ label, value, onChange, required, placeholder, type = "text", icon }) {
  return (
      <div className="relative">
        {icon && (
          <div className="absolute left-4 sm:left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10 flex items-center justify-center">
            <img src={icon} alt="" className="w-5 h-5 sm:w-4 sm:h-4 opacity-70 flex-shrink-0" />
          </div>
        )}
        <input
          type={type}
          className={`w-full rounded-xl border-2 border-slate-700 bg-slate-800/80 py-4 text-slate-100 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all placeholder:text-slate-400 placeholder:text-base sm:placeholder:text-sm ${icon ? 'pl-14 pr-4 sm:pl-12' : 'px-4'}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || label}
          required={required !== false}
        />
      </div>
  );
}

function Select({ label, value, onChange, options, icon, placeholder, required = true }) {
  const hasValue = value && value !== '';
  return (
      <div className="relative">
        {icon && (
          <div className="absolute left-4 sm:left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10 flex items-center justify-center">
            <img src={icon} alt="" className="w-5 h-5 sm:w-4 sm:h-4 opacity-70 flex-shrink-0" />
          </div>
        )}
        <select
          className={`w-full rounded-xl border-2 border-slate-700 bg-slate-800/80 py-4 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all appearance-none bg-[url('data:image/svg+xml;charset=UTF-8,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"%2394a3b8\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"6 9 12 15 18 9\"></polyline></svg>')] bg-no-repeat bg-right-4 bg-[length:18px] pr-12 ${icon ? 'pl-14 sm:pl-12' : 'pl-4'} ${hasValue ? 'text-slate-100' : 'text-slate-400'}`}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          required={required !== false}
        >
          <option value="" disabled className="text-slate-400 bg-slate-800">{placeholder || label || 'Select'}</option>
          {options.map((opt) => <option key={opt} value={opt} className="bg-slate-800 text-slate-100">{opt}</option>)}
        </select>
      </div>
  );
}

function Button({ children, variant = 'primary', className = '', ...props }) {
  const styles = {
    primary: 'bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white shadow-lg shadow-indigo-500/50 active:scale-[0.97]',
    secondary: 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 active:scale-[0.97]',
    ghost: 'bg-slate-800/50 hover:bg-slate-700 text-slate-100 border border-slate-700 active:scale-[0.97]'
  }[variant];
  return (
    <button
      className={`w-full rounded-xl px-4 py-4 sm:py-3 font-semibold text-base sm:text-lg transition-all transform hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 touch-manipulation ${styles} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

function StatusPill({ label, value, tone }) {
  const colors = {
    green: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/50',
    blue: 'bg-cyan-500/20 text-cyan-200 border-cyan-500/50',
    amber: 'bg-amber-500/20 text-amber-100 border-amber-500/50',
    slate: 'bg-slate-800 text-slate-200 border-slate-700'
  }[tone || 'slate'];
  return (
    <div className={`flex justify-between items-center text-sm px-3 py-2 rounded-xl border ${colors}`}>
      <span>{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function Toggle({ label, checked, onChange, icon, description, required }) {
  return (
    <div 
      className="flex items-center justify-between w-full cursor-pointer hover:opacity-90 transition-all p-3 -mx-1 rounded-xl hover:bg-slate-800/40 active:bg-slate-800/50"
      onClick={() => onChange(!checked)}
    >
      <div className="flex-1 flex items-center gap-3 min-w-0">
        {icon && (
          <div className="flex-shrink-0">
            <img src={icon} alt="" className="w-5 h-5 sm:w-6 sm:h-6 opacity-80" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm sm:text-base font-medium text-slate-200 flex items-center gap-2 flex-wrap">
            <span>{label}</span>
            {required && <span className="text-rose-400 text-xs font-bold">*</span>}
          </div>
          {description && (
            <div className="text-xs sm:text-sm text-slate-400 mt-1 leading-relaxed">{description}</div>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onChange(!checked);
        }}
        className={`w-14 h-7 sm:w-16 sm:h-8 rounded-full transition-all relative flex-shrink-0 ml-3 sm:ml-4 ${checked ? 'bg-gradient-to-r from-emerald-500 to-green-600 shadow-lg shadow-emerald-500/50' : 'bg-slate-600'}`}
        aria-label={checked ? 'Turn off' : 'Turn on'}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-6 w-6 sm:h-7 sm:w-7 rounded-full bg-white shadow-lg transition-all transform duration-200 ${checked ? 'translate-x-7 sm:translate-x-8' : 'translate-x-0'}`}
        ></span>
      </button>
    </div>
  );
}

function MapCard({ guestLoc, driverLoc, guests = [] }) {
  return (
    <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900 p-3">
      <div className="text-sm text-slate-300 mb-2">Map preview (pseudo)</div>
      <div className="relative h-56 w-full rounded-lg bg-gradient-to-br from-slate-900 to-slate-800 overflow-hidden">
        {guestLoc && <Marker label="Guest" color="bg-emerald-400" coords={guestLoc} position="left-6 bottom-6" />}
        {guests.map((g, idx) => g ? (
          <Marker key={idx} label={`Rider ${idx + 1}`} color="bg-amber-400" coords={g} position="left-6 top-6" />
        ) : null)}
        {driverLoc && <Marker label="Shuttle" color="bg-cyan-400" coords={driverLoc} position="right-6 top-6" />}
        {!guestLoc && !driverLoc && !guests.length && <div className="absolute inset-0 flex items-center justify-center text-slate-600 text-sm">No locations yet</div>}
      </div>
      <div className="text-xs text-slate-500 mt-2 space-y-1">
        <div>Guest: {guestLoc ? `${guestLoc.lat?.toFixed?.(5)}, ${guestLoc.lng?.toFixed?.(5)}` : '—'}</div>
        <div>Riders: {guests.length ? `${guests.length} shown` : '—'}</div>
        <div>Shuttle: {driverLoc ? `${driverLoc.lat?.toFixed?.(5)}, ${driverLoc.lng?.toFixed?.(5)}` : '—'}</div>
      </div>
    </div>
  );
}

function Marker({ label, color, coords, position }) {
  return (
    <div className={`absolute ${position}`}>
      <div className={`h-4 w-4 rounded-full ${color} shadow-lg shadow-black/40`} />
      <div className="text-xs text-slate-200 mt-1">{label}</div>
      <div className="text-[10px] text-slate-500">{coords.lat?.toFixed?.(3)}, {coords.lng?.toFixed?.(3)}</div>
    </div>
  );
}

function upsertRequest(prev, payload) {
  const existing = prev.findIndex((r) => r.id === payload.id);
  if (existing >= 0) {
    const clone = [...prev];
    clone[existing] = { ...clone[existing], ...payload };
    return clone;
  }
  return [payload, ...prev].slice(0, 100);
}

function pushLog(setter, label, data) {
  setter((prev) => [...prev, { label, data, ts: new Date() }].slice(-100));
}
