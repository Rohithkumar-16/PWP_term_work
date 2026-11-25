import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import type { ActiveView, AuthUser } from '../types';

interface NavbarProps {
  user: AuthUser | null;
  activeView: ActiveView;
  onNavigate: (view: ActiveView) => void;
  onOpenAuth: () => void;
  onSignOut: () => void;
}

export function Navbar({ user, activeView, onNavigate, onOpenAuth, onSignOut }: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const linkClass = (view: ActiveView) =>
    `text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer pb-0.5 ${
      activeView === view
        ? 'text-blue-700 border-b-2 border-blue-700'
        : 'text-stone-600 hover:text-stone-900'
    }`;

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-stone-200/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single-line Wordmark */}
        <button
          type="button"
          onClick={() => onNavigate('catalog')}
          className="font-display text-xl font-bold tracking-tight text-stone-900 whitespace-nowrap shrink-0 cursor-pointer"
        >
          The Halcyon
        </button>

        {/* Zone 2: Clean Single-Line Nav Links */}
        <nav className="hidden md:flex items-center gap-8">
          <button type="button" onClick={() => onNavigate('catalog')} className={linkClass('catalog')}>
            Rooms
          </button>
          <a
            href="#amenities"
            onClick={() => onNavigate('catalog')}
            className="text-sm font-medium text-stone-600 hover:text-stone-900 transition-colors whitespace-nowrap shrink-0 pb-0.5"
          >
            Experience
          </a>
          {user && (
            <button type="button" onClick={() => onNavigate('my-bookings')} className={linkClass('my-bookings')}>
              My Bookings
            </button>
          )}
          {user?.role === 'admin' && (
            <button
              type="button"
              onClick={() => onNavigate('admin')}
              className={`text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer pb-0.5 ${
                activeView === 'admin'
                  ? 'text-orange-600 border-b-2 border-orange-600'
                  : 'text-orange-600 hover:text-orange-700'
              }`}
            >
              Reception Desk
            </button>
          )}
        </nav>

        {/* Zone 3: Primary Action */}
        <div className="flex items-center gap-3 shrink-0">
          {user ? (
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline text-xs font-medium text-stone-500 truncate max-w-[160px]">
                {user.full_name}
              </span>
              <button
                type="button"
                onClick={onSignOut}
                className="px-4 py-2 text-xs font-semibold text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenAuth}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Sign In
            </button>
          )}

          <button
            type="button"
            aria-label="Toggle navigation"
            onClick={() => setMobileOpen((prev) => !prev)}
            className="md:hidden p-2 rounded-lg text-stone-700 hover:bg-stone-100"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-stone-200 bg-white px-4 py-3 space-y-2 text-sm font-medium">
          <button
            type="button"
            onClick={() => {
              onNavigate('catalog');
              setMobileOpen(false);
            }}
            className="block w-full text-left py-2 text-stone-800"
          >
            Rooms
          </button>
          {user && (
            <button
              type="button"
              onClick={() => {
                onNavigate('my-bookings');
                setMobileOpen(false);
              }}
              className="block w-full text-left py-2 text-stone-800"
            >
              My Bookings
            </button>
          )}
          {user?.role === 'admin' && (
            <button
              type="button"
              onClick={() => {
                onNavigate('admin');
                setMobileOpen(false);
              }}
              className="block w-full text-left py-2 text-orange-600 font-semibold"
            >
              Reception Desk
            </button>
          )}
        </div>
      )}
    </header>
  );
}
