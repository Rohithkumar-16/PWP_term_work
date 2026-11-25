import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowRight, BedDouble, Calendar, SlidersHorizontal, Users, X } from 'lucide-react';
import { AdminDashboard } from './components/AdminDashboard';
import { AuthModal } from './components/AuthModal';
import { BookingModal } from './components/BookingModal';
import { MyBookings } from './components/MyBookings';
import { Navbar } from './components/Navbar';
import type { ActiveView, AuthUser, Booking, Room, ToastMessage } from './types';

function addDaysIso(days: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

type SortMode = 'price-asc' | 'price-desc' | 'capacity-desc';

export default function App() {
  const minDate = addDaysIso(0);
  const [checkIn, setCheckIn] = useState(addDaysIso(1));
  const [checkOut, setCheckOut] = useState(addDaysIso(3));
  const [guests, setGuests] = useState(1);
  const [roomType, setRoomType] = useState('All');
  const [maxPrice, setMaxPrice] = useState('');
  const [availableOnly, setAvailableOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortMode>('price-asc');

  const [rooms, setRooms] = useState<Room[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [failedImages, setFailedImages] = useState<Record<number, boolean>>({});

  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ActiveView>('catalog');
  const [highlightCode, setHighlightCode] = useState<string>('');

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [bookingRoom, setBookingRoom] = useState<Room | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const pushToast = useCallback((type: ToastMessage['type'], text: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const fetchRooms = useCallback(
    async (paramsOverride?: {
      checkIn?: string;
      checkOut?: string;
      guests?: number;
      roomType?: string;
      maxPrice?: string;
    }) => {
      setLoadingRooms(true);
      try {
        const ci = paramsOverride?.checkIn ?? checkIn;
        const co = paramsOverride?.checkOut ?? checkOut;
        const g = paramsOverride?.guests ?? guests;
        const rt = paramsOverride?.roomType ?? roomType;
        const mp = paramsOverride?.maxPrice ?? maxPrice;

        const qs = new URLSearchParams({
          check_in: ci,
          check_out: co,
          guests: String(g),
          room_type: rt,
        });
        if (mp) qs.set('max_price', mp);

        const res = await fetch(`/api/rooms?${qs.toString()}`);
        const data = await res.json();
        if (!res.ok) {
          pushToast('warning', data.error || 'Please adjust your date selection.');
          return;
        }
        setRooms(data.rooms || []);
      } catch {
        pushToast('error', 'Could not load rooms. Please try again.');
      } finally {
        setLoadingRooms(false);
      }
    },
    [checkIn, checkOut, guests, roomType, maxPrice, pushToast]
  );

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  const handleFilterSubmit = (e: FormEvent) => {
    e.preventDefault();
    fetchRooms();
  };

  const handleCategoryTab = (category: string) => {
    setRoomType(category);
    fetchRooms({ roomType: category });
  };

  const handleResetFilters = () => {
    const ci = addDaysIso(1);
    const co = addDaysIso(3);
    setCheckIn(ci);
    setCheckOut(co);
    setGuests(1);
    setRoomType('All');
    setMaxPrice('');
    setAvailableOnly(false);
    setSortBy('price-asc');
    fetchRooms({ checkIn: ci, checkOut: co, guests: 1, roomType: 'All', maxPrice: '' });
  };

  const displayedRooms = useMemo(() => {
    let list = [...rooms];
    if (availableOnly) {
      list = list.filter((r) => Boolean(r.available_for_dates));
    }
    list.sort((a, b) => {
      if (sortBy === 'price-desc') return b.price_per_night - a.price_per_night;
      if (sortBy === 'capacity-desc') return b.capacity - a.capacity || a.price_per_night - b.price_per_night;
      return a.price_per_night - b.price_per_night;
    });
    return list;
  }, [rooms, availableOnly, sortBy]);

  const handleAuthSuccess = (nextUser: AuthUser, nextToken: string) => {
    setUser(nextUser);
    setToken(nextToken);
    pushToast('success', `Welcome back, ${nextUser.full_name}.`);
    if (nextUser.role === 'admin' && !bookingRoom) {
      setActiveView('admin');
    }
  };

  const handleSignOut = () => {
    setUser(null);
    setToken(null);
    setActiveView('catalog');
    pushToast('success', 'You have been signed out.');
  };

  const handleBooked = (booking: Booking) => {
    setBookingRoom(null);
    setHighlightCode(booking.confirmation_code);
    setActiveView('my-bookings');
    pushToast('success', `Reservation confirmed! Code: ${booking.confirmation_code}`);
    fetchRooms();
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F7F4] text-stone-900">
      <Navbar
        user={user}
        activeView={activeView}
        onNavigate={(v) => {
          setActiveView(v);
          if (v === 'catalog') fetchRooms();
        }}
        onOpenAuth={() => setAuthModalOpen(true)}
        onSignOut={handleSignOut}
      />

      <main className="flex-1">
        {activeView === 'catalog' && (
          <>
            {/* Full-Bleed Architectural Hero */}
            <section className="relative bg-stone-900 overflow-hidden">
              <img
                src="/src/assets/images/hero_hotel_lobby_1795627761479.jpg"
                alt="Sunlit architectural hotel lobby at The Halcyon"
                referrerPolicy="no-referrer"
                className="w-full h-[460px] sm:h-[520px] object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-stone-950/85 via-stone-950/40 to-stone-950/20" />
              <div className="absolute inset-0 flex items-center">
                <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 pb-12">
                  <div className="max-w-2xl space-y-4">
                    <p className="text-xs font-semibold tracking-wide text-amber-300">
                      Harbor Terrace &middot; Instant Confirmation &middot; Zero Booking Fees
                    </p>
                    <h1
                      className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-[1.08]"
                      style={{ textWrap: 'balance' }}
                    >
                      Sunlit coastal stays, reserved in seconds.
                    </h1>
                    <p className="text-stone-200 text-base sm:text-lg max-w-xl leading-relaxed">
                      Explore curated Standard, Deluxe, and Penthouse rooms with live date availability and transparent nightly pricing.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Floating Search & Date Dock */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-12 relative z-10">
              <form
                onSubmit={handleFilterSubmit}
                className="bg-white border border-stone-200 rounded-2xl shadow-lg p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 items-end"
              >
                <div>
                  <label htmlFor="filter-checkin" className="flex items-center gap-1.5 text-xs font-semibold text-stone-700 mb-1.5">
                    <Calendar className="w-3.5 h-3.5 text-blue-700" /> Check-in
                  </label>
                  <input
                    id="filter-checkin"
                    type="date"
                    min={minDate}
                    value={checkIn}
                    onChange={(e) => setCheckIn(e.target.value)}
                    required
                    className="w-full px-3 py-2.5 text-sm border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label htmlFor="filter-checkout" className="flex items-center gap-1.5 text-xs font-semibold text-stone-700 mb-1.5">
                    <Calendar className="w-3.5 h-3.5 text-blue-700" /> Check-out
                  </label>
                  <input
                    id="filter-checkout"
                    type="date"
                    min={minDate}
                    value={checkOut}
                    onChange={(e) => setCheckOut(e.target.value)}
                    required
                    className="w-full px-3 py-2.5 text-sm border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label htmlFor="filter-guests" className="flex items-center gap-1.5 text-xs font-semibold text-stone-700 mb-1.5">
                    <Users className="w-3.5 h-3.5 text-blue-700" /> Guests
                  </label>
                  <select
                    id="filter-guests"
                    value={guests}
                    onChange={(e) => setGuests(Number(e.target.value))}
                    className="w-full px-3 py-2.5 text-sm border border-stone-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    {[1, 2, 3, 4].map((c) => (
                      <option key={c} value={c}>
                        {c} Guest{c > 1 ? 's' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="filter-type" className="flex items-center gap-1.5 text-xs font-semibold text-stone-700 mb-1.5">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-blue-700" /> Category
                  </label>
                  <select
                    id="filter-type"
                    value={roomType}
                    onChange={(e) => setRoomType(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border border-stone-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="All">All Categories</option>
                    <option value="Standard">Standard</option>
                    <option value="Deluxe">Deluxe</option>
                    <option value="Suite">Suite</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="filter-price" className="block text-xs font-semibold text-stone-700 mb-1.5">
                    Max Nightly Rate
                  </label>
                  <input
                    id="filter-price"
                    type="number"
                    min={50}
                    step={10}
                    placeholder="Any price"
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <button
                    type="submit"
                    className="w-full py-2.5 px-4 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-xl transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Search Rooms
                  </button>
                </div>
              </form>
            </section>

            {/* Room Catalog & Interactive Filter Toolbar */}
            <section id="rooms" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-7">
              <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
                <div>
                  <h2 className="font-display text-3xl font-bold text-stone-900">Available Accommodations</h2>
                  <p className="text-sm text-stone-600 mt-1">
                    Stay dates <span className="font-mono font-medium text-stone-900">{checkIn}</span> to{' '}
                    <span className="font-mono font-medium text-stone-900">{checkOut}</span> &middot; {guests} guest
                    {guests > 1 ? 's' : ''}
                  </p>
                </div>

                {/* Interactive Category Tabs, Available Toggle, & Sort */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="inline-flex items-center gap-1 p-1 bg-stone-200/70 rounded-xl">
                    {['All', 'Standard', 'Deluxe', 'Suite'].map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => handleCategoryTab(cat)}
                        className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                          roomType === cat
                            ? 'bg-white text-stone-900 shadow-sm'
                            : 'text-stone-600 hover:text-stone-900'
                        }`}
                      >
                        {cat === 'All' ? 'All Rooms' : cat}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => setAvailableOnly((v) => !v)}
                    className={`px-3.5 py-2 text-xs font-semibold rounded-xl border transition-colors whitespace-nowrap cursor-pointer ${
                      availableOnly
                        ? 'bg-emerald-50 border-emerald-600 text-emerald-800'
                        : 'bg-white border-stone-300 text-stone-700 hover:bg-stone-50'
                    }`}
                  >
                    {availableOnly ? 'Showing Available Only' : 'Available Only'}
                  </button>

                  <select
                    aria-label="Sort rooms"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortMode)}
                    className="px-3 py-2 text-xs font-semibold bg-white border border-stone-300 rounded-xl text-stone-700 cursor-pointer"
                  >
                    <option value="price-asc">Price: Low to High</option>
                    <option value="price-desc">Price: High to Low</option>
                    <option value="capacity-desc">Largest Capacity</option>
                  </select>
                </div>
              </div>

              {loadingRooms ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="bg-white border border-stone-200 rounded-2xl h-96 animate-pulse" />
                  ))}
                </div>
              ) : displayedRooms.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
                  {displayedRooms.map((room) => {
                    const available = Boolean(room.available_for_dates);
                    const pricing = room.pricing;
                    const amenities = room.amenities_list || room.amenities.split(',').map((s) => s.trim());

                    return (
                      <article
                        key={room.id}
                        className="group bg-white border border-stone-200 rounded-2xl overflow-hidden flex flex-col transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
                      >
                        <div className="relative aspect-[4/3] bg-stone-100 overflow-hidden">
                          {failedImages[room.id] ? (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-stone-100 to-stone-200 text-stone-500 p-6 text-center">
                              <BedDouble className="w-8 h-8 mb-2" />
                              <span className="text-xs font-medium">{room.name}</span>
                            </div>
                          ) : (
                            <img
                              src={room.image_url}
                              alt={room.name}
                              referrerPolicy="no-referrer"
                              onError={() => setFailedImages((prev) => ({ ...prev, [room.id]: true }))}
                              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                            />
                          )}
                        </div>

                        <div className="p-6 flex-1 flex flex-col">
                          <div className="flex items-center justify-between gap-2 text-xs font-medium mb-2">
                            <span className="text-stone-500">
                              {room.room_type} &middot; Room {room.room_number}
                            </span>
                            {room.status === 'maintenance' ? (
                              <span className="text-amber-700 font-semibold">Maintenance</span>
                            ) : available ? (
                              <span className="text-emerald-700 font-semibold">Available</span>
                            ) : (
                              <span className="text-rose-700 font-semibold">Booked for Dates</span>
                            )}
                          </div>

                          <h3 className="font-display text-xl font-bold text-stone-900">{room.name}</h3>
                          <p className="text-xs text-stone-500 mt-1">
                            {room.bed_config} &middot; Up to {room.capacity} guests &middot; {room.size_sqft} sq ft
                          </p>
                          <p className="text-sm text-stone-600 mt-3 line-clamp-2 leading-relaxed">{room.description}</p>

                          <div className="mt-4 pt-4 border-t border-stone-100 text-xs text-stone-500">
                            {amenities.slice(0, 4).join(' · ')}
                          </div>

                          <div className="mt-auto pt-5 flex items-center justify-between gap-4">
                            <div>
                              <div className="font-mono text-xl font-bold text-stone-900 tabular-nums">
                                ${room.price_per_night.toFixed(0)}
                                <span className="text-xs font-sans font-normal text-stone-500"> / night</span>
                              </div>
                              {pricing && (
                                <div className="text-xs text-stone-500 tabular-nums">
                                  {pricing.nights} night{pricing.nights > 1 ? 's' : ''} est. ${pricing.total_price.toFixed(2)}
                                </div>
                              )}
                            </div>

                            {available ? (
                              <button
                                type="button"
                                onClick={() => setBookingRoom(room)}
                                className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                Inspect &amp; Book <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setBookingRoom(room)}
                                className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                View Dates
                              </button>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-white border border-stone-200 rounded-2xl p-12 text-center">
                  <h3 className="font-display text-xl font-bold text-stone-900">No rooms match those filters</h3>
                  <p className="text-sm text-stone-600 mt-2">
                    Try showing booked dates, lowering the guest count, or viewing all room categories.
                  </p>
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="inline-block mt-5 px-5 py-2.5 bg-blue-700 text-white text-xs font-semibold rounded-xl cursor-pointer"
                  >
                    Reset Filters
                  </button>
                </div>
              )}
            </section>

            {/* Experience Highlights */}
            <section id="amenities" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
              <div className="bg-white border border-stone-200 rounded-2xl p-8 grid grid-cols-1 sm:grid-cols-3 gap-8">
                <div>
                  <h3 className="font-display text-lg font-bold text-stone-900">Overlap-Proof Availability</h3>
                  <p className="text-sm text-stone-600 mt-1.5">
                    Every date check validates live confirmed stay intervals to prevent double-bookings.
                  </p>
                </div>
                <div>
                  <h3 className="font-display text-lg font-bold text-stone-900">Itemized Stay Totals</h3>
                  <p className="text-sm text-stone-600 mt-1.5">
                    Review nightly rates, 12% occupancy tax, and a flat $25 amenity fee upfront.
                  </p>
                </div>
                <div>
                  <h3 className="font-display text-lg font-bold text-stone-900">Self-Service Reservations</h3>
                  <p className="text-sm text-stone-600 mt-1.5">
                    Access confirmation codes and cancel upcoming stays anytime in My Bookings.
                  </p>
                </div>
              </div>
            </section>
          </>
        )}

        {activeView === 'my-bookings' && token && (
          <MyBookings
            token={token}
            highlightCode={highlightCode}
            onBrowseRooms={() => setActiveView('catalog')}
            onToast={pushToast}
          />
        )}

        {activeView === 'admin' && token && user?.role === 'admin' && (
          <AdminDashboard token={token} onToast={pushToast} />
        )}
      </main>

      <footer className="border-t border-stone-200 bg-white mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-stone-500">
          <div className="flex items-center gap-3">
            <span className="font-display text-sm font-bold text-stone-900">The Halcyon</span>
            <span aria-hidden="true">&middot;</span>
            <span>420 Harbor Terrace, Coastal District</span>
          </div>
          <div className="flex items-center gap-5">
            <button type="button" onClick={() => setActiveView('catalog')} className="hover:text-stone-900 cursor-pointer">
              Browse Rooms
            </button>
            {user && (
              <button type="button" onClick={() => setActiveView('my-bookings')} className="hover:text-stone-900 cursor-pointer">
                Manage Reservations
              </button>
            )}
            <span>&copy; 2026 The Halcyon Hotel</span>
          </div>
        </div>
      </footer>

      {/* Toast Stack */}
      {toasts.length > 0 && (
        <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full px-4 sm:px-0">
          {toasts.map((t) => (
            <div
              key={t.id}
              role="status"
              className={`flex items-start justify-between gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${
                t.type === 'success' ? 'bg-emerald-700' : t.type === 'warning' ? 'bg-amber-600' : 'bg-rose-700'
              }`}
            >
              <span>{t.text}</span>
              <button
                type="button"
                onClick={() => setToasts((prev) => prev.filter((item) => item.id !== t.id))}
                className="opacity-80 hover:opacity-100 shrink-0 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <BookingModal
        room={bookingRoom}
        initialCheckIn={checkIn}
        initialCheckOut={checkOut}
        initialGuests={guests}
        minDate={minDate}
        user={user}
        token={token}
        onClose={() => setBookingRoom(null)}
        onRequireAuth={() => setAuthModalOpen(true)}
        onBooked={handleBooked}
        onToast={pushToast}
      />

      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={handleAuthSuccess}
        onToast={pushToast}
      />
    </div>
  );
}
