import { useEffect, useState, type FormEvent } from 'react';
import { Calendar, CheckCircle2, Users, X, AlertCircle } from 'lucide-react';
import type { AuthUser, Booking, Room, RoomPricing } from '../types';

interface BookingModalProps {
  room: Room | null;
  initialCheckIn: string;
  initialCheckOut: string;
  initialGuests: number;
  minDate: string;
  user: AuthUser | null;
  token: string | null;
  onClose: () => void;
  onRequireAuth: () => void;
  onBooked: (booking: Booking) => void;
  onToast: (type: 'success' | 'error' | 'warning', text: string) => void;
}

export function BookingModal({
  room,
  initialCheckIn,
  initialCheckOut,
  initialGuests,
  minDate,
  user,
  token,
  onClose,
  onRequireAuth,
  onBooked,
  onToast,
}: BookingModalProps) {
  const [checkIn, setCheckIn] = useState(initialCheckIn);
  const [checkOut, setCheckOut] = useState(initialCheckOut);
  const [guestCount, setGuestCount] = useState(initialGuests);
  const [guestName, setGuestName] = useState(user?.full_name || '');
  const [guestEmail, setGuestEmail] = useState(user?.email || '');
  const [specialRequests, setSpecialRequests] = useState('');

  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState(true);
  const [availabilityMessage, setAvailabilityMessage] = useState('Checking availability...');
  const [pricing, setPricing] = useState<RoomPricing | null>(room?.pricing || null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!room) return;
    setCheckIn(initialCheckIn);
    setCheckOut(initialCheckOut);
    setGuestCount(Math.min(initialGuests, room.capacity));
    setGuestName(user?.full_name || '');
    setGuestEmail(user?.email || '');
    setSpecialRequests('');
  }, [room, initialCheckIn, initialCheckOut, initialGuests, user]);

  useEffect(() => {
    if (!room) return;
    let active = true;
    const verify = async () => {
      setChecking(true);
      try {
        const params = new URLSearchParams({
          room_id: String(room.id),
          check_in: checkIn,
          check_out: checkOut,
          guests: String(guestCount),
        });
        const res = await fetch(`/api/rooms/availability?${params.toString()}`);
        const data = await res.json();
        if (!active) return;

        if (!res.ok || !data.available) {
          setAvailable(false);
          setAvailabilityMessage(data.error || data.message || 'Unavailable for selected dates.');
          if (data.pricing) setPricing(data.pricing);
        } else {
          setAvailable(true);
          setAvailabilityMessage(data.message);
          setPricing(data.pricing);
        }
      } catch {
        if (active) {
          setAvailable(false);
          setAvailabilityMessage('Unable to verify live availability.');
        }
      } finally {
        if (active) setChecking(false);
      }
    };
    verify();
    return () => {
      active = false;
    };
  }, [room, checkIn, checkOut, guestCount]);

  if (!room) return null;

  const amenities = room.amenities_list || room.amenities.split(',').map((s) => s.trim()).filter(Boolean);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !token) {
      onRequireAuth();
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          room_id: room.id,
          check_in: checkIn,
          check_out: checkOut,
          guest_count: guestCount,
          guest_name: guestName,
          guest_email: guestEmail,
          special_requests: specialRequests,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        onToast('error', data.error || 'Could not complete reservation.');
        return;
      }
      onBooked(data.booking);
    } catch {
      onToast('error', 'Network error while submitting booking.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-sm flex justify-end" role="dialog" aria-modal="true">
      <div className="bg-white w-full max-w-xl h-full overflow-y-auto shadow-2xl border-l border-stone-200 flex flex-col">
        {/* Sticky Drawer Header */}
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur px-6 py-4 border-b border-stone-200 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-stone-500">
              {room.room_type} &middot; Room {room.room_number} &middot; {room.size_sqft} sq ft
            </p>
            <h3 className="font-display text-xl font-bold text-stone-900">{room.name}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            className="p-2 rounded-lg text-stone-500 hover:text-stone-900 hover:bg-stone-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Room Overview & Amenities */}
        <div className="p-6 space-y-6 flex-1">
          <div className="aspect-[16/10] rounded-2xl overflow-hidden bg-stone-100">
            <img
              src={room.image_url}
              alt={room.name}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-600">
              <span>{room.bed_config} &middot; Up to {room.capacity} guests</span>
              <span className="font-mono text-base font-bold text-stone-900 tabular-nums">
                ${room.price_per_night.toFixed(0)} <span className="font-sans text-xs font-normal text-stone-500">/ night</span>
              </span>
            </div>
            <p className="text-sm text-stone-600 leading-relaxed">{room.description}</p>
            <p className="text-xs text-stone-500 pt-1">{amenities.join(' · ')}</p>
          </div>

          <hr className="border-stone-200" />

          {/* Contiguous Booking Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-stone-700 mb-1">
                  <Calendar className="w-3.5 h-3.5 text-blue-700" /> Check-in
                </label>
                <input
                  type="date"
                  min={minDate}
                  value={checkIn}
                  onChange={(e) => setCheckIn(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-stone-700 mb-1">
                  <Calendar className="w-3.5 h-3.5 text-blue-700" /> Check-out
                </label>
                <input
                  type="date"
                  min={minDate}
                  value={checkOut}
                  onChange={(e) => setCheckOut(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-stone-700 mb-1">
                  <Users className="w-3.5 h-3.5 text-blue-700" /> Guests
                </label>
                <input
                  type="number"
                  min={1}
                  max={room.capacity}
                  value={guestCount}
                  onChange={(e) => setGuestCount(Number(e.target.value) || 1)}
                  required
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Primary Guest Name</label>
                <input
                  type="text"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  required
                  placeholder="Full name"
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Confirmation Email</label>
                <input
                  type="email"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-xl"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Special Requests (Optional)</label>
              <input
                type="text"
                maxLength={300}
                value={specialRequests}
                onChange={(e) => setSpecialRequests(e.target.value)}
                placeholder="Late arrival, extra pillows, high floor..."
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-xl"
              />
            </div>

            {/* Live Availability & Cost Breakdown */}
            <div className="bg-[#F8F7F4] border border-stone-200 rounded-2xl p-4 space-y-2.5 text-sm">
              <div className={`flex items-center gap-2 text-xs font-semibold ${checking ? 'text-stone-500' : available ? 'text-emerald-700' : 'text-rose-700'}`}>
                {!checking && (available ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />)}
                <span>{checking ? 'Checking real-time room availability...' : availabilityMessage}</span>
              </div>

              {pricing && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-stone-600">
                    <span>
                      {pricing.nights} night{pricing.nights > 1 ? 's' : ''} &times; ${pricing.nightly_rate.toFixed(2)}
                    </span>
                    <span className="font-mono tabular-nums">${pricing.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-stone-600">
                    <span>Occupancy Tax (12%)</span>
                    <span className="font-mono tabular-nums">${pricing.tax_amount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-stone-600">
                    <span>Amenity &amp; Service Fee</span>
                    <span className="font-mono tabular-nums">${pricing.service_fee.toFixed(2)}</span>
                  </div>
                  <div className="pt-2.5 border-t border-stone-200 flex justify-between font-bold text-stone-900 text-base">
                    <span>Total Due</span>
                    <span className="font-mono tabular-nums">${pricing.total_price.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>

            {user ? (
              <button
                type="submit"
                disabled={!available || checking || submitting}
                className="w-full py-3.5 bg-orange-600 hover:bg-orange-700 disabled:bg-stone-300 text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer"
              >
                {submitting ? 'Confirming Reservation...' : 'Confirm Instant Reservation'}
              </button>
            ) : (
              <button
                type="button"
                onClick={onRequireAuth}
                className="w-full py-3.5 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Sign In to Complete Booking
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
