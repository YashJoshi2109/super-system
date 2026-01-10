import React, { useEffect, useState } from 'react';

export default function NotificationToast({ notifications, onDismiss }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (notifications.length === 0) return;
    setVisible(true);
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss?.(), 300);
    }, 5000);
    return () => clearTimeout(timer);
  }, [notifications.length, onDismiss]);

  if (notifications.length === 0 || !visible) return null;

  const latest = notifications[notifications.length - 1];

  return (
    <div className="fixed top-20 right-4 z-50 animate-slide-in">
      <div className={`rounded-lg shadow-2xl p-4 max-w-sm border ${
        latest.type === 'driver_arrived' 
          ? 'bg-emerald-600 border-emerald-500 text-white'
          : latest.type === 'accepted'
          ? 'bg-blue-600 border-blue-500 text-white'
          : latest.type === 'picked_up'
          ? 'bg-indigo-600 border-indigo-500 text-white'
          : 'bg-slate-800 border-slate-700 text-slate-100'
      }`}>
        <div className="flex justify-between items-start gap-2">
          <div className="flex-1">
            <div className="font-semibold mb-1">{latest.message}</div>
            <div className="text-xs opacity-90">
              {new Date(latest.ts).toLocaleTimeString()}
            </div>
          </div>
          <button
            onClick={() => {
              setVisible(false);
              setTimeout(() => onDismiss?.(), 300);
            }}
            className="text-white/80 hover:text-white"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
