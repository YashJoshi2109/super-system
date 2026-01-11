import React, { useState } from 'react';

export default function LoginModal({ role, onLogin, onCancel, theme = 'dark' }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';
      const response = await fetch(`${socketUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username,
          password,
          role
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Store token in localStorage
        localStorage.setItem(`auth_token_${role}`, data.token);
        localStorage.setItem(`auth_user_${role}`, JSON.stringify(data.user));
        onLogin(data.token, data.user);
        // Clear form
        setUsername('');
        setPassword('');
      } else {
        setError(data.error || 'Login failed');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const bgClass = theme === 'dark' ? 'bg-slate-900' : 'bg-white';
  const textClass = theme === 'dark' ? 'text-slate-100' : 'text-slate-900';
  const inputClass = theme === 'dark' 
    ? 'bg-slate-800 border-slate-700 text-slate-100' 
    : 'bg-slate-50 border-slate-300 text-slate-900';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className={`${bgClass} ${textClass} rounded-2xl border-2 border-slate-700 shadow-2xl w-full max-w-md p-6 sm:p-8`}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold flex items-center gap-3">
            <span className="text-3xl">
              {role === 'admin' ? '👑' : '🚗'}
            </span>
            <span>{role === 'admin' ? 'Admin' : 'Driver'} Login</span>
          </h2>
          {onCancel && (
            <button
              onClick={onCancel}
              className="text-slate-400 hover:text-slate-200 text-2xl font-bold"
            >
              ×
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={`w-full rounded-xl border-2 ${inputClass} px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all`}
              placeholder="Enter username"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`w-full rounded-xl border-2 ${inputClass} px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all`}
              placeholder="Enter password"
              required
            />
          </div>

          {error && (
            <div className="bg-rose-500/20 border-2 border-rose-500/50 rounded-xl p-3 text-rose-300 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-semibold py-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Logging in...' : 'Login'}
            </button>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="px-6 bg-slate-800 hover:bg-slate-700 text-white font-semibold py-3 rounded-xl transition-all"
              >
                Cancel
              </button>
            )}
          </div>
        </form>

        <div className="mt-6 pt-6 border-t border-slate-700 text-xs text-slate-400">
          <p>Default credentials:</p>
          <p className="mt-1">
            <strong>Driver:</strong> username: driver, password: driver123
          </p>
          <p className="mt-1">
            <strong>Admin:</strong> username: admin, password: admin123
          </p>
          <p className="mt-3 text-slate-500">
            Change these in environment variables for production
          </p>
        </div>
      </div>
    </div>
  );
}
