import { useCallback, useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import type { Booking } from '../types';

interface MyBookingsProps {
  token: string;
  highlightCode?: string;
  onBrowseRooms: () => void;
  onToast: (type: 'success' | 'error' | 'warning', text: string) => void;
}

export function MyBookings({ token, highlightCode, onBrowseRooms, onToast }: MyBookingsProps) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'upcoming' | 'history'>('upcoming');
  const [confirmCancelId, setConfirmCancelId] = useState<number | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [copiedCode, setCopiedCode] = useState<string>('');

  const loadBookings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/bookings', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setBookings(data.bookings || []);
      } else {
        onToast('error', data.error || 'Could not load reservations.');
      }
    } catch {
      onToast('error', 'Failed to load bookings.');
    } finally {
      setLoading(false);
    }
  }, [token, onToast]);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(''), 2000);
    } catch {
      onToast('warning', `Confirmation code: ${code}`);
    }
  };

  const handleCancel = async (booking: Booking) => {
    setCancellingId(booking.id);
    try {
      const res = await fetch(`/api/bookings/${booking.id}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        onToast('error', data.error || 'Unable to cancel booking.');
        return;
      }
      setConfirmCancelId(null);
      onToast('success', data.message);
      await loadBookings();
    } catch {
      onToast('error', 'Network error while cancelling reservation.');
    } finally {
      setCancellingId(null);
    }
  };

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = bookings.filter((b) => b.status === 'confirmed' && b.check_out >= today);
  const pastOrCancelled = bookings.filter((b) => !(b.status === 'confirmed' && b.check_out >= today));

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-stone-900">My Reservations</h1>
          <p className="text-sm text-stone-600 mt-1">
            Review upcoming stays, copy confirmation codes, or cancel flexibly.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-stone-200/70 rounded-xl">
            <button
              type="button"
              onClick={() => setTab('upcoming')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                tab === 'upcoming' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Upcoming ({upcoming.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('history')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                tab === 'history' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              History ({pastOrCancelled.length})
            </button>
          </div>

          <button
            type="button"
            onClick={onBrowseRooms}
            className="px-4 py-2.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-xl transition-colors whitespace-nowrap cursor-pointer"
          >
            Book Another Room
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((n) => (
            <div key={n} className="bg-white border border-stone-200 rounded-2xl p-6 h-40 animate-pulse" />
          ))}
        </div>
      ) : tab === 'upcoming' ? (
        upcoming.length > 0 ? (
          <div className="grid grid-cols-1 gap-5">
            {upcoming.map((b) => (
              <article
                key={b.id}
                className={`bg-white border rounded-2xl p-5 sm:p-6 flex flex-col md:flex-row gap-6 items-start ${
                  highlightCode === b.confirmation_code
                    ? 'border-emerald-500 ring-2 ring-emerald-100'
                    : 'border-stone-200'
                }`}
              >
                <img
                  src={b.room_image || '/src/assets/images/room_standard_king_1795627761331.jpg'}
                  alt={b.room_name}
                  referrerPolicy="no-referrer"
                  className="w-full md:w-56 h-44 object-cover rounded-xl shrink-0 bg-stone-100"
                />
                <div className="flex-1 min-w-0 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs text-stone-500">
                      <span>Room {b.room_number}</span>
                      <span aria-hidden="true">&middot;</span>
                      <button
                        type="button"
                        onClick={() => handleCopyCode(b.confirmation_code)}
                        className="inline-flex items-center gap-1.5 font-mono font-semibold text-blue-700 hover:text-blue-900 cursor-pointer"
                      >
                        {b.confirmation_code}
                        {copiedCode === b.confirmation_code ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                    <span className="text-xs font-semibold text-emerald-700">Confirmed Stay</span>
                  </div>

                  <h3 className="font-display text-2xl font-bold text-stone-900">{b.room_name}</h3>

                  <p className="text-sm text-stone-700 font-mono tabular-nums">
                    {b.check_in} &rarr; {b.check_out} &middot; {b.nights} night{b.nights > 1 ? 's' : ''} &middot; {b.guest_count} guest{b.guest_count > 1 ? 's' : ''}
                  </p>

                  <div className="text-xs text-stone-500 tabular-nums">
                    Subtotal ${b.subtotal.toFixed(2)} &middot; Tax ${b.tax_amount.toFixed(2)} &middot; Service Fee ${b.service_fee.toFixed(2)}
                  </div>

                  {b.special_requests && <p className="text-xs text-stone-600 pt-1">Note: {b.special_requests}</p>}
                </div>

                <div className="w-full md:w-auto md:text-right flex md:flex-col items-center md:items-end justify-between gap-3 pt-4 md:pt-0 border-t md:border-t-0 border-stone-100 shrink-0">
                  <div>
                    <div className="font-mono text-2xl font-bold text-stone-900 tabular-nums">${b.total_price.toFixed(2)}</div>
                    <div className="text-xs text-stone-500">Total paid / due</div>
                  </div>

                  {confirmCancelId === b.id ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={cancellingId === b.id}
                        onClick={() => handleCancel(b)}
                        className="px-3.5 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
                      >
                        {cancellingId === b.id ? 'Cancelling...' : 'Confirm Cancel'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmCancelId(null)}
                        className="px-3 py-2 text-xs font-semibold text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
                      >
                        Keep Stay
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmCancelId(b.id)}
                      className="px-4 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
                    >
                      Cancel Reservation
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="bg-white border border-stone-200 rounded-2xl p-12 text-center">
            <h3 className="font-display text-xl font-bold text-stone-900">No upcoming reservations</h3>
            <p className="text-sm text-stone-600 mt-1.5">Explore our sunlit rooms and lock in your next dates.</p>
            <button
              type="button"
              onClick={onBrowseRooms}
              className="inline-block mt-5 px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-xl cursor-pointer"
            >
              Browse Available Rooms
            </button>
          </div>
        )
      ) : pastOrCancelled.length > 0 ? (
        <div className="bg-white border border-stone-200 rounded-2xl overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-200 text-xs text-stone-500 bg-stone-50">
              <tr>
                <th className="py-3.5 px-4 font-semibold">Code</th>
                <th className="py-3.5 px-4 font-semibold">Room</th>
                <th className="py-3.5 px-4 font-semibold">Stay Dates</th>
                <th className="py-3.5 px-4 font-semibold">Status</th>
                <th className="py-3.5 px-4 font-semibold text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {pastOrCancelled.map((b) => (
                <tr key={b.id} className="hover:bg-stone-50/70">
                  <td className="py-3.5 px-4 font-mono text-xs text-stone-700">{b.confirmation_code}</td>
                  <td className="py-3.5 px-4 font-medium text-stone-900">{b.room_name}</td>
                  <td className="py-3.5 px-4 font-mono text-xs text-stone-600 tabular-nums">
                    {b.check_in} &rarr; {b.check_out}
                  </td>
                  <td className={`py-3.5 px-4 text-xs font-semibold capitalize ${b.status === 'completed' ? 'text-stone-600' : 'text-rose-700'}`}>
                    {b.status}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-right text-stone-900 tabular-nums">${b.total_price.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white border border-stone-200 rounded-2xl p-12 text-center">
          <p className="text-sm text-stone-600">No past or cancelled stays on record yet.</p>
        </div>
      )}
    </section>
  );
}
