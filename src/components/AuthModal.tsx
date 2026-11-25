import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import type { AuthUser } from '../types';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (user: AuthUser, token: string) => void;
  onToast: (type: 'success' | 'error' | 'warning', text: string) => void;
}

export function AuthModal({ open, onClose, onSuccess, onToast }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const payload =
        mode === 'login' ? { email, password } : { full_name: fullName, email, password };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        onToast('error', data.error || 'Authentication failed.');
        return;
      }
      onSuccess(data.user, data.token);
      onClose();
    } catch {
      onToast('error', 'Network error while signing in.');
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (demoEmail: string, demoPassword: string) => {
    setMode('login');
    setEmail(demoEmail);
    setPassword(demoPassword);
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="bg-white border border-stone-200 rounded-2xl max-w-md w-full p-7 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-stone-900">
              {mode === 'login' ? 'Welcome back' : 'Create guest account'}
            </h2>
            <p className="text-sm text-stone-600 mt-1">
              {mode === 'login'
                ? 'Sign in to reserve rooms or open the reception desk.'
                : 'Book suites in seconds and manage stays online.'}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close modal" className="text-stone-400 hover:text-stone-700 p-1 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="grid grid-cols-2 gap-1 p-1 bg-stone-100 rounded-xl mt-5">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              mode === 'login' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setMode('register')}
            className={`py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              mode === 'register' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            Create Account
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Full Name</label>
              <input
                type="text"
                required
                minLength={2}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Maya Lin"
                className="w-full px-3.5 py-2.5 text-sm border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-3.5 py-2.5 text-sm border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Password {mode === 'register' ? '(min 8 chars)' : ''}
            </label>
            <input
              type="password"
              required
              minLength={mode === 'register' ? 8 : 1}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full px-3.5 py-2.5 text-sm border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-blue-700 hover:bg-blue-800 disabled:bg-stone-300 text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer"
          >
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Guest Account'}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-stone-200 space-y-2.5">
          <p className="text-xs font-semibold text-stone-500">Quick-Fill Demo Accounts</p>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => fillDemo('guest@halcyonhotel.com', 'GuestPass2026!')}
              className="px-3 py-2 text-xs font-semibold bg-blue-50 text-blue-800 hover:bg-blue-100 rounded-xl transition-colors cursor-pointer"
            >
              Demo Guest
            </button>
            <button
              type="button"
              onClick={() => fillDemo('admin@halcyonhotel.com', 'AdminPass2026!')}
              className="px-3 py-2 text-xs font-semibold bg-orange-50 text-orange-800 hover:bg-orange-100 rounded-xl transition-colors cursor-pointer"
            >
              Demo Reception Admin
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
