import React, { useEffect, useMemo, useState } from 'react';
import { socket } from './lib/socket.js';
import LiveMap from './components/LiveMap.jsx';
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
      ['request_error', (payload) => { setRequestError(payload?.message || 'Request failed'); pushLog(setLogs, 'Request error', payload); }]
    ];
    handlers.forEach(([evt, fn]) => socket.on(evt, fn));
    return () => handlers.forEach(([evt, fn]) => socket.off(evt, fn));
  }, []);

  const isGuest = role === 'guest';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur px-4 py-3 flex flex-wrap gap-3 justify-between items-center">
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

      <main className={`p-4 grid gap-4 ${isGuest ? '' : 'lg:grid-cols-[2fr,1fr]'}`}>
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
            />
          )}
          {role === 'driver' && (
            <DriverPanel
              driverLoc={driverLoc}
              requests={requests}
              statusMap={statusMap}
              logs={logs.slice(-5)}
            />
          )}
          {role === 'admin' && (
            <AdminPanel
              grouped={grouped}
              driverLoc={driverLoc}
              requests={requests}
              logs={logs}
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

function GuestPanel({ lang, requestId, setRequestId, geofenceWarning, setGuestLoc, driverLoc, requestError, setRequestError, statusMap }) {
  const [form, setForm] = useState({
    guest_name: '',
    terminal: '',
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
      terminal: (form.terminal || '').toUpperCase(),
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
    <Card title="Guest · Request & Live Tracking" accent="from-indigo-500 to-cyan-400">
      <div className="grid gap-4 lg:grid-cols-[1.2fr,1fr]">
        <div className="space-y-3">
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
            <Select
              label={t(lang, 'terminal')}
              value={form.terminal}
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

        <div className="space-y-3">
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
            <p className="text-xs text-slate-500">
              After submitting, keep this tab open. Your location will auto-update to the driver and admin once the request ID is assigned.
            </p>
          </div>
        </div>
      </div>
      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900 p-3 h-72">
        <div className="text-sm text-slate-300 mb-2">Live map</div>
        <LiveMap driver={driverLoc} guests={coords ? [coords] : []} />
      </div>
    </Card>
  );
}

function DriverPanel({ driverLoc, requests, statusMap, logs }) {
  const [lastSent, setLastSent] = useState(null);
  const [intervalId, setIntervalId] = useState(null);

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
        },
        (err) => console.error(err),
        { enableHighAccuracy: true }
      );
    }, 10000);
    setIntervalId(id);
  };

  const activeRequests = (requests || []).filter((r) => r.status !== 'completed');

  return (
    <Card title="Driver · Pilot Console" accent="from-cyan-500 to-emerald-400">
      <div className="grid gap-4 lg:grid-cols-[1.2fr,1fr]">
        <div className="space-y-3">
          <div className="space-y-2">
            <Button variant="primary" onClick={sendOnce}>Send my location once</Button>
            <Button variant={intervalId ? 'ghost' : 'secondary'} onClick={toggleStream}>
              {intervalId ? 'Stop streaming' : 'Start streaming (10s)'}
            </Button>
            {lastSent && <div className="text-xs text-slate-400">Last sent: {lastSent.lat.toFixed(5)}, {lastSent.lng.toFixed(5)}</div>}
            {driverLoc && <div className="text-xs text-slate-400">Broadcasted: {driverLoc.lat?.toFixed?.(5)}, {driverLoc.lng?.toFixed?.(5)}</div>}
          </div>

        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-3 h-72">
            <div className="text-sm text-slate-300 mb-2">Live map</div>
            <LiveMap driver={driverLoc} guests={activeRequests.map((r) => r.coordinates).filter(Boolean)} />
          </div>
          <div className="text-sm text-slate-300">Ride requests</div>
          <div className="space-y-2 max-h-[320px] overflow-auto pr-1">
            {activeRequests.map((req) => (
              <div key={req.id} className="rounded-xl border border-slate-800 bg-slate-900 p-3 space-y-2">
                <div className="flex justify-between">
                  <div>
                    <div className="font-semibold text-slate-100">{req.guest_name}</div>
                    <div className="text-xs text-slate-400">Terminal {req.terminal} · Gate {req.gate_proximity}</div>
                  </div>
                  <StatusPill label="" value={statusMap[req.id] || req.status || 'pending'} tone="blue" />
                </div>
                <div className="text-xs text-slate-400">Phone: {req.phone}</div>
                <div className="text-xs text-slate-400">Phone: {req.phone}</div>
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => window.open(`tel:${req.phone}`, '_self')}>Call</Button>
                    <Button variant="ghost" onClick={() => window.open(`https://www.google.com/maps?q=${req.coordinates?.lat},${req.coordinates?.lng}`, '_blank')}>Get location</Button>
                  </div>
                  <Select
                    label="Change status"
                    value={statusMap[req.id] || req.status || 'pending'}
                    onChange={(v) => socket.emit('status_change', { request_id: req.id, status: v })}
                    options={['accepted', 'picked_up', 'completed']}
                  />
                </div>
              </div>
            ))}
            {!activeRequests.length && <div className="text-xs text-slate-500">No active requests.</div>}
          </div>
        </div>
      </div>
      {logs?.length ? (
        <div className="mt-3">
          <div className="text-sm text-slate-300 mb-1">Recent events</div>
          <EventFeed logs={logs.slice(-5)} />
        </div>
      ) : null}
    </Card>
  );
}

function AdminPanel({ grouped, driverLoc, requests, logs }) {
  const groups = useMemo(() => grouped || [], [grouped]);
  return (
    <Card title="Admin · Control Tower" accent="from-amber-400 to-pink-500">
      <div className="space-y-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-3 text-sm text-slate-300">
          Driver location: {driverLoc ? `${driverLoc.lat?.toFixed?.(5)}, ${driverLoc.lng?.toFixed?.(5)}` : 'No signal yet'}
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
