import React, { useEffect, useMemo, useState } from 'react';
import { socket } from './lib/socket.js';
import LiveMap from './components/LiveMap.jsx';
import ChatPanel from './components/ChatPanel.jsx';
import NotificationToast from './components/NotificationToast.jsx';
import { t } from './i18n.js';

const roles = ['guest', 'driver', 'admin'];
const driverPin = import.meta.env.VITE_DRIVER_PIN || 'driver123';
const adminPin = import.meta.env.VITE_ADMIN_PIN || 'admin123';

export default function App() {
  const [role, setRole] = useState('guest');
  const [lang, setLang] = useState('en');
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

  const isGuest = role === 'guest';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur px-3 sm:px-4 py-2 sm:py-3 flex flex-wrap gap-2 sm:gap-3 justify-between items-center sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-400 flex items-center justify-center font-bold text-slate-950">HT</div>
          <div>
            <div className="text-lg font-semibold">Hotel Transport RTA</div>
            <div className="text-xs text-slate-400">Micro-logistics · live</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <ConnectionPill state={connection} />
          <RoleSwitcher role={role} setRole={setRole} />
          <LangSwitcher lang={lang} setLang={setLang} />
        </div>
      </header>

      <main className={`p-3 sm:p-4 grid gap-4 ${isGuest ? '' : 'lg:grid-cols-[2fr,1fr]'}`}>
        <div className="space-y-4">
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
          {role === 'driver' && (
            <DriverPanel
              driverLoc={driverLoc}
              requests={requests}
              statusMap={statusMap}
              logs={logs.slice(-5)}
              etas={etas}
            />
          )}
          {role === 'admin' && (
            <AdminPanel
              grouped={grouped}
              driverLoc={driverLoc}
              requests={requests}
              logs={logs}
              etas={etas}
            />
          )}
        </div>

        {!isGuest && (
          <aside className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 max-h-[85vh] overflow-auto shadow-lg shadow-slate-900/40">
            {role === 'driver' && (
              <>
                <h3 className="font-semibold mb-2 text-slate-100">Live events (driver)</h3>
                <EventFeed logs={logs.slice(-5)} />
              </>
            )}
            {role === 'admin' && (
              <>
                <h3 className="font-semibold mb-2 text-slate-100">Live events</h3>
                <EventFeed logs={logs} />
              </>
            )}
            {driverLoc && guestLoc && (
              <div className="mt-3 text-xs text-slate-400">
                Driver: {driverLoc.lat?.toFixed?.(5)}, {driverLoc.lng?.toFixed?.(5)} · Guest: {guestLoc.lat?.toFixed?.(5)}, {guestLoc.lng?.toFixed?.(5)}
              </div>
            )}
          </aside>
        )}
      </main>
      {notifications.length > 0 && (
        <NotificationToast
          notifications={notifications}
          onDismiss={() => setNotifications([])}
        />
      )}
    </div>
  );
}

function RoleSwitcher({ role, setRole }) {
  return (
    <div className="flex gap-1 bg-slate-800 rounded-full p-1">
      {roles.map((r) => (
        <button
          key={r}
          onClick={() => {
            if (r === 'guest') return setRole(r);
            const pin = r === 'driver' ? driverPin : adminPin;
            const input = window.prompt(`Enter ${r} access code`);
            if (input === pin) {
              setRole(r);
            } else {
              alert('Invalid access code');
            }
          }}
          className={`px-3 py-1 rounded-full text-sm transition ${
            role === r ? 'bg-indigo-500 text-white shadow' : 'text-slate-300 hover:text-white'
          }`}
        >
          {r.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function LangSwitcher({ lang, setLang }) {
  return (
    <div className="flex gap-2 text-sm">
      <button onClick={() => setLang('en')} className={lang === 'en' ? 'font-semibold text-white' : 'text-slate-400'}>EN</button>
      <span className="text-slate-600">|</span>
      <button onClick={() => setLang('es')} className={lang === 'es' ? 'font-semibold text-white' : 'text-slate-400'}>ES</button>
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
    phone_number: ''
  });
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
    if (!coords || !shareLive) return setLocalError('Please turn on "Share Live Location" before submitting.');
    if (!form.guest_name.trim()) return setLocalError('Name is required.');
    if (!form.terminal) return setLocalError('Terminal is required.');
    if (!form.gate_proximity) return setLocalError('Gate is required.');
    const phoneDigits = form.phone_number.replace(/\D/g, '');
    if (phoneDigits.length !== 10) return setLocalError('Phone must be 10 digits.');
    const voucher = (form.voucher_code || '').toUpperCase();
    if (voucher.length !== 5) return setLocalError('Voucher must be exactly 5 characters.');
    const gate = form.gate_proximity;
    if (!gateOptions.includes(gate)) return setLocalError('Select a gate from the list.');

    const payload = {
      guest_name: form.guest_name,
      phone: `${form.country_code}${phoneDigits}`,
      airline_code: form.airline_code || undefined,
      terminal: (flightInfo?.suggested_terminal || form.terminal || '').toUpperCase(),
      voucher_code: voucher || undefined,
      gate_proximity: gate,
      courtesy_pickup: form.courtesy_pickup,
      coordinates: coords
    };
    socket.emit('join_request', payload);
    setSubmitted(true);
    if (!trackingId) startTracking();
  };

  return (
    <Card title="👤 Guest · Request Ride" accent="from-indigo-500 to-cyan-400">
      <div className="grid gap-4 lg:grid-cols-[1.2fr,1fr]">
        <div className="space-y-3 order-2 lg:order-1">
          <form className="space-y-3" onSubmit={submit}>
            <Input label={t(lang, 'name')} value={form.guest_name} onChange={(v) => setForm({ ...form, guest_name: v })} required />
            <div className="grid grid-cols-[120px,1fr] gap-2">
              <Select
                label={t(lang, 'country')}
                value={form.country_code}
                onChange={(v) => setForm({ ...form, country_code: v })}
                options={['+1', '+52', '+57', '+44', '+91']}
              />
              <Input label={t(lang, 'phone_hint')} value={form.phone_number} onChange={(v) => setForm({ ...form, phone_number: v })} required />
            </div>
            <Input
              label="Flight Code (e.g., AA1234) - Optional"
              value={form.airline_code}
              onChange={(v) => setForm({ ...form, airline_code: v.toUpperCase() })}
              placeholder="AA1234 (optional, auto-detects terminal)"
            />
            {flightInfo && flightInfo.suggested_terminal && (
              <div className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded p-2">
                ✈️ Flight detected: Terminal {flightInfo.suggested_terminal} suggested
                {flightInfo.delayed && flightInfo.delayed > 0 && (
                  <span className="block text-amber-400">⚠️ Flight delayed by {Math.floor(flightInfo.delayed / 60)} minutes</span>
                )}
              </div>
            )}
            <Select
              label={t(lang, 'terminal')}
              value={flightInfo?.suggested_terminal || form.terminal}
              onChange={(v) => setForm({ ...form, terminal: v })}
              options={['A', 'B', 'C', 'D', 'E']}
            />
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-amber-200">
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/50 text-[11px] font-semibold">IMPORTANT</span>
                <span>Enter check-in code to verify your reservation</span>
              </div>
              <Input label={t(lang, 'voucher')} value={form.voucher_code} onChange={(v) => setForm({ ...form, voucher_code: v.toUpperCase() })} />
            </div>
            <Select
              label={t(lang, 'gate')}
              value={form.gate_proximity}
              onChange={(v) => setForm({ ...form, gate_proximity: v })}
              options={gateOptions}
            />
            <Toggle
              label={t(lang, 'courtesy')}
              checked={form.courtesy_pickup}
              onChange={(v) => setForm({ ...form, courtesy_pickup: v })}
            />
            <Toggle
              label="Share live location"
              checked={shareLive}
              onChange={(v) => {
                if (v) startTracking();
                else stopTracking();
              }}
            />
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={shareLive ? stopTracking : startTracking}>
                {shareLive ? '🛑 Stop Sharing' : '📍 Start Sharing'}
              </Button>
              <Button type="submit" variant="primary">{t(lang, 'submit')}</Button>
            </div>
          </form>
          <div className="text-xs text-slate-400 space-y-1">
            {coords && <div>My location: {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</div>}
            {requestId && <div>Request ID: {requestId}</div>}
            {submitted && !requestId && !requestError && <div className="text-amber-400">Waiting for request acknowledgment…</div>}
            {requestError && <div className="text-rose-400">Error: {requestError}</div>}
            {localError && <div className="text-rose-400">Error: {localError}</div>}
            {geofenceWarning && (
              <div className="text-amber-300">
                GPS shows {geofenceWarning.coords?.lat?.toFixed?.(3)}, {geofenceWarning.coords?.lng?.toFixed?.(3)}; terminal selected {geofenceWarning.terminal}.
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3 order-1 lg:order-2">
          <Timeline
            steps={[
              { label: 'Submitted', done: !!requestId },
              { label: 'Tracking on', done: !!coords },
              { label: 'Accepted', done: statusMap[requestId] === 'accepted' || statusMap[requestId] === 'picked_up' || statusMap[requestId] === 'completed' },
              { label: 'Picked up', done: statusMap[requestId] === 'picked_up' || statusMap[requestId] === 'completed' },
              { label: 'Completed', done: statusMap[requestId] === 'completed' }
            ]}
          />
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-3 space-y-2">
            <div className="text-sm text-slate-300">Live status</div>
            <StatusPill label="Request" value={requestId ? 'Submitted' : 'Draft'} tone={requestId ? 'green' : 'slate'} />
            <StatusPill label="Tracking" value={coords ? 'GPS active' : 'Idle'} tone={coords ? 'blue' : 'slate'} />
            <StatusPill label="Geofence" value={geofenceWarning ? 'Mismatch' : 'OK'} tone={geofenceWarning ? 'amber' : 'green'} />
            {eta && (
              <div className="bg-cyan-500/20 border border-cyan-500/50 rounded-lg p-2 space-y-1">
                <div className="text-xs font-semibold text-cyan-200">Estimated Arrival</div>
                <div className="text-lg font-bold text-cyan-100">{eta.etaMinutes} min</div>
                <div className="text-xs text-cyan-300">{eta.distanceKm} km ({eta.distanceMiles} mi) away</div>
              </div>
            )}
            <p className="text-xs text-slate-500">
              After submitting, keep this tab open. Your location will auto-update to the driver and admin once the request ID is assigned.
            </p>
          </div>
        </div>
      </div>
      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900 overflow-hidden" style={{ height: '400px', minHeight: '400px' }}>
        <div className="bg-slate-800/50 px-4 py-2 border-b border-slate-700 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-300">📍 Live Map & Route</div>
          {driverLoc && (
            <div className="text-xs text-slate-400">
              🚐 Shuttle tracking active
            </div>
          )}
        </div>
        <LiveMap 
          driver={driverLoc} 
          guests={coords ? [coords] : []} 
          showRoute={!!driverLoc && !!coords}
          fromHotel={true}
        />
      </div>
      {requestId && <ChatPanel requestId={requestId} role="guest" userName={form.guest_name || 'Guest'} lang={lang} />}
    </Card>
  );
}

function DriverPanel({ driverLoc, requests, statusMap, logs, etas }) {
  const [lastSent, setLastSent] = useState(null);
  const [intervalId, setIntervalId] = useState(null);
  const [selectedRequestId, setSelectedRequestId] = useState(null);

  useEffect(() => {
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [intervalId]);

  const sendOnce = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLastSent(c);
        socket.emit('update_driver_location', c);
      },
      (err) => console.error(err),
      { enableHighAccuracy: true }
    );
  };

  const toggleStream = () => {
    if (intervalId) {
      clearInterval(intervalId);
      setIntervalId(null);
      return;
    }
    if (!navigator.geolocation) return;
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
        (err) => console.error(err),
        { enableHighAccuracy: true }
      );
    }, 10000);
    setIntervalId(id);
  };

  const handleImHere = (requestId) => {
    socket.emit('driver_arrived', { request_id: requestId });
  };

  const activeRequests = (requests || []).filter((r) => r.status !== 'completed');

  return (
    <Card title="🚐 Driver Dashboard" accent="from-cyan-500 to-emerald-400">
      {/* Location Controls */}
      <div className="bg-gradient-to-r from-cyan-500/10 to-emerald-500/10 border border-cyan-500/30 rounded-xl p-4 mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <Button 
            variant="primary" 
            onClick={sendOnce}
            className="flex-1 sm:flex-none"
          >
            📍 Send Location Once
          </Button>
          <Button 
            variant={intervalId ? 'ghost' : 'secondary'} 
            onClick={toggleStream}
            className="flex-1 sm:flex-none"
          >
            {intervalId ? '⏸️ Stop Streaming' : '▶️ Start Streaming (10s)'}
          </Button>
        </div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          {lastSent && (
            <div className="text-slate-400">
              <span className="font-semibold text-slate-300">Last Sent:</span> {lastSent.lat.toFixed(5)}, {lastSent.lng.toFixed(5)}
            </div>
          )}
          {driverLoc && (
            <div className="text-slate-400">
              <span className="font-semibold text-slate-300">Broadcasting:</span> {driverLoc.lat?.toFixed?.(5)}, {driverLoc.lng?.toFixed?.(5)}
            </div>
          )}
        </div>
      </div>

      {/* Main Grid Layout */}
      <div className="grid gap-4 lg:grid-cols-[1.5fr,1fr]">
        {/* Left: Requests List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold text-slate-100">Active Ride Requests</h3>
            <span className="bg-cyan-500/20 text-cyan-300 text-xs font-semibold px-2 py-1 rounded-full">
              {activeRequests.length} {activeRequests.length === 1 ? 'request' : 'requests'}
            </span>
          </div>
          
          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900">
            {activeRequests.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <div className="text-4xl mb-2">🚕</div>
                <div className="text-sm">No active ride requests</div>
                <div className="text-xs mt-1">Waiting for guest requests...</div>
              </div>
            ) : (
              activeRequests.map((req) => {
                const reqEta = etas[req.id];
                const currentStatus = statusMap[req.id] || req.status || 'pending';
                
                return (
                  <div key={req.id} className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 hover:border-cyan-500/50 transition-all space-y-3">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="font-bold text-lg text-slate-100">{req.guest_name}</div>
                          <StatusPill label="" value={currentStatus} tone="blue" />
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
                          <span>✈️ Terminal {req.terminal}</span>
                          <span>🚪 Gate {req.gate_proximity}</span>
                          {req.voucher_code && <span>🎫 {req.voucher_code}</span>}
                        </div>
                      </div>
                    </div>

                    {/* ETA Display */}
                    {reqEta && (
                      <div className="bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/50 rounded-lg p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-bold text-cyan-200">ETA: {reqEta.etaMinutes} minutes</div>
                            <div className="text-xs text-cyan-300 mt-0.5">{reqEta.distanceKm} km ({reqEta.distanceMiles} mi) away</div>
                          </div>
                          <div className="text-2xl">⏱️</div>
                        </div>
                      </div>
                    )}

                    {/* Contact Info */}
                    <div className="bg-slate-800/50 rounded-lg p-2">
                      <div className="text-xs text-slate-400 mb-1">Contact</div>
                      <a href={`tel:${req.phone}`} className="text-sm text-cyan-400 hover:text-cyan-300 font-medium">
                        📞 {req.phone}
                      </a>
                    </div>

                    {/* Action Buttons */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <Button 
                        variant="secondary" 
                        onClick={() => window.open(`tel:${req.phone}`, '_self')}
                        className="text-xs py-2"
                      >
                        📞 Call
                      </Button>
                      <Button 
                        variant="ghost" 
                        onClick={() => window.open(`https://www.google.com/maps?q=${req.coordinates?.lat},${req.coordinates?.lng}`, '_blank')}
                        className="text-xs py-2"
                      >
                        🗺️ Map
                      </Button>
                      <Button 
                        variant="primary" 
                        onClick={() => handleImHere(req.id)}
                        className="text-xs py-2 bg-emerald-600 hover:bg-emerald-700"
                      >
                        ✅ I'm Here
                      </Button>
                      <Button 
                        variant="ghost" 
                        onClick={() => setSelectedRequestId(selectedRequestId === req.id ? null : req.id)}
                        className={`text-xs py-2 ${selectedRequestId === req.id ? 'bg-indigo-600 text-white' : ''}`}
                      >
                        💬 Chat
                      </Button>
                    </div>

                    {/* Status Selector */}
                    <div className="border-t border-slate-800 pt-3">
                      <Select
                        label="Update Status"
                        value={currentStatus}
                        onChange={(v) => {
                          socket.emit('status_change', { request_id: req.id, status: v });
                          if (v === 'accepted') {
                            socket.emit('request_eta', { request_id: req.id });
                          }
                        }}
                        options={['accepted', 'picked_up', 'completed']}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Map */}
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden" style={{ height: '400px', minHeight: '400px' }}>
            <LiveMap 
              driver={driverLoc} 
              guests={activeRequests.map((r) => r.coordinates).filter(Boolean)}
              showRoute={true}
              fromHotel={false}
            />
          </div>
          
          {logs?.length > 0 && (
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-3">
              <div className="text-sm font-semibold text-slate-300 mb-2">Recent Activity</div>
              <EventFeed logs={logs.slice(-3)} />
            </div>
          )}
        </div>
      </div>

      {/* Chat Panel */}
      {selectedRequestId && (
        <ChatPanel
          requestId={selectedRequestId}
          role="driver"
          userName="Driver"
          lang="en"
        />
      )}
    </Card>
  );
}

function AdminPanel({ grouped, driverLoc, requests, logs, etas }) {
  const groups = useMemo(() => grouped || [], [grouped]);

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
    <Card title="Admin · Control Tower" accent="from-amber-400 to-pink-500">
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-3 text-sm text-slate-300 flex-1">
            Driver location: {driverLoc ? `${driverLoc.lat?.toFixed?.(5)}, ${driverLoc.lng?.toFixed?.(5)}` : 'No signal yet'}
          </div>
          <Button variant="primary" onClick={exportCSV} className="ml-2">
            📥 Export CSV
          </Button>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-3 h-72">
          <div className="text-sm text-slate-300 mb-2">Live map</div>
          <LiveMap driver={driverLoc} guests={(requests || []).map((r) => r.coordinates).filter(Boolean)} />
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          {groups.map((g, idx) => (
            <div key={idx} className="rounded-xl border border-slate-800 bg-slate-900 p-3 space-y-2">
              <div className="flex justify-between items-center">
                <div className="font-semibold text-slate-100">Terminal {g.terminal}</div>
                <div className="text-xs bg-slate-800 rounded-full px-2 py-1 text-slate-200">{g.count} riders</div>
              </div>
              <ul className="text-sm text-slate-300 space-y-1">
                {g.requests.map((r) => (
                  <li key={r.id} className="space-y-1 border-b border-slate-800 pb-2 last:border-none last:pb-0">
                    <div className="flex justify-between">
                      <span>{r.guest_name}</span>
                      <span className="text-xs text-slate-400">{r.status}</span>
                    </div>
                    <div className="text-xs text-slate-500">
                      Gate: {r.gate_proximity || '—'} · Courtesy: {r.courtesy_pickup ? 'Yes' : 'No'} · Phone: {r.phone}
                    </div>
                    <div className="text-xs text-slate-500">Voucher: {r.voucher_code || '—'}</div>
                    <div className="text-xs text-slate-500">
                      Coords: {r.coordinates?.lat?.toFixed?.(4) || '—'}, {r.coordinates?.lng?.toFixed?.(4) || '—'}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        {!groups.length && <div className="text-slate-500 text-sm">No grouped requests yet.</div>}
      </div>
    </Card>
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

function Card({ title, accent, children }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-lg shadow-slate-900/40">
      <div className="flex items-center gap-2 mb-3">
        <div className={`h-2 w-10 rounded-full bg-gradient-to-r ${accent}`} />
        <h2 className="text-lg font-semibold text-white">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Input({ label, value, onChange, required }) {
  return (
    <label className="text-sm text-slate-200 block space-y-1">
      <span>{label}{required && <span className="text-rose-400"> *</span>}</span>
      <input
        className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      />
    </label>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="text-sm text-slate-200 block space-y-1">
      <span>{label}</span>
      <select
        className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Select</option>
        {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    </label>
  );
}

function Button({ children, variant = 'primary', ...props }) {
  const styles = {
    primary: 'bg-indigo-500 hover:bg-indigo-600 text-white',
    secondary: 'bg-slate-800 hover:bg-slate-700 text-white',
    ghost: 'bg-slate-800/50 hover:bg-slate-700 text-slate-100 border border-slate-700'
  }[variant];
  return (
    <button
      className={`w-full rounded-lg px-3 py-2 font-semibold transition ${styles}`}
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

function Timeline({ steps }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-3 space-y-2">
      <div className="text-sm text-slate-300">Journey</div>
      <div className="space-y-2">
        {steps.map((s, idx) => (
          <div key={idx} className="flex items-center gap-2 text-sm text-slate-200">
            <span className={`h-3 w-3 rounded-full ${s.done ? 'bg-emerald-400' : 'bg-slate-700'} border border-slate-800`}></span>
            <span className={s.done ? 'text-slate-100' : 'text-slate-500'}>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center justify-between text-sm text-slate-200 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2">
      <span>{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`w-12 h-6 rounded-full transition ${checked ? 'bg-emerald-500' : 'bg-slate-700'} relative`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${checked ? 'right-0.5' : 'left-0.5'}`}
        ></span>
      </button>
    </label>
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
