import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Plus, Search, X } from 'lucide-react';
import type { AdminMetrics, Booking, Room } from '../types';

interface AdminDashboardProps {
  token: string;
  onToast: (type: 'success' | 'error' | 'warning', text: string) => void;
}

export function AdminDashboard({ token, onToast }: AdminDashboardProps) {
  const [metrics, setMetrics] = useState<AdminMetrics>({
    total_rooms: 0,
    available_today: 0,
    active_bookings: 0,
    estimated_revenue: 0,
  });
  const [rooms, setRooms] = useState<Room[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState<'reservations' | 'inventory'>('reservations');
  const [bookingSearch, setBookingSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [newRoom, setNewRoom] = useState({
    room_number: '',
    name: '',
    room_type: 'Deluxe' as Room['room_type'],
    price_per_night: 225,
    capacity: 2,
    amenities: 'High-Speed Wi-Fi, Espresso Bar, Rain Shower',
    description: '',
  });
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/overview', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        onToast('error', data.error || 'Could not load reception overview.');
        return;
      }
      setMetrics(data.metrics);
      setRooms(data.rooms);
      setBookings(data.bookings);
    } catch {
      onToast('error', 'Failed to load admin overview.');
    } finally {
      setLoading(false);
    }
  }, [token, onToast]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const handleCreateRoom = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(newRoom),
      });
      const data = await res.json();
      if (!res.ok) {
        onToast('error', data.error || 'Unable to add room.');
        return;
      }
      onToast('success', `Room ${data.room.room_number} (${data.room.name}) added.`);
      setAddOpen(false);
      setNewRoom({
        room_number: '',
        name: '',
        room_type: 'Deluxe',
        price_per_night: 225,
        capacity: 2,
        amenities: 'High-Speed Wi-Fi, Espresso Bar, Rain Shower',
        description: '',
      });
      await loadOverview();
    } catch {
      onToast('error', 'Network error creating room.');
    }
  };

  const handleQuickStatusChange = async (room: Room, nextStatus: Room['status']) => {
    try {
      const res = await fetch(`/api/admin/rooms/${room.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        onToast('error', data.error || 'Unable to update status.');
        return;
      }
      onToast('success', `Room ${room.room_number} marked ${nextStatus}.`);
      await loadOverview();
    } catch {
      onToast('error', 'Network error updating room status.');
    }
  };

  const handleSaveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingRoom) return;
    try {
      const res = await fetch(`/api/admin/rooms/${editingRoom.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(editingRoom),
      });
      const data = await res.json();
      if (!res.ok) {
        onToast('error', data.error || 'Unable to update room.');
        return;
      }
      onToast('success', `Updated Room ${data.room.room_number}.`);
      setEditingRoom(null);
      await loadOverview();
    } catch {
      onToast('error', 'Network error updating room.');
    }
  };

  const handleBookingAction = async (bookingId: number, action: 'complete' | 'cancel') => {
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        onToast('error', data.error || 'Action failed.');
        return;
      }
      onToast('success', data.message);
      await loadOverview();
    } catch {
      onToast('error', 'Network error updating booking.');
    }
  };

  const filteredBookings = bookings.filter((b) => {
    if (!bookingSearch.trim()) return true;
    const q = bookingSearch.toLowerCase();
    return (
      b.confirmation_code.toLowerCase().includes(q) ||
      b.guest_name.toLowerCase().includes(q) ||
      b.guest_email.toLowerCase().includes(q) ||
      b.room_name.toLowerCase().includes(q) ||
      b.room_number.toLowerCase().includes(q)
    );
  });

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-stone-900">Reception Operations</h1>
          <p className="text-sm text-stone-600 mt-1">
            Live occupancy snapshot, instant room status control, and guest reservations.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-xl transition-colors whitespace-nowrap cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Add New Room
        </button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white border border-stone-200 rounded-2xl p-5">
          <div className="text-xs font-medium text-stone-500">Total Inventory</div>
          <div className="font-mono text-3xl font-bold text-stone-900 mt-2 tabular-nums">
            {loading ? '—' : metrics.total_rooms}
          </div>
          <div className="text-xs text-stone-500 mt-1">Configured rooms &amp; suites</div>
        </div>
        <div className="bg-white border border-stone-200 rounded-2xl p-5">
          <div className="text-xs font-medium text-stone-500">Available Today</div>
          <div className="font-mono text-3xl font-bold text-emerald-700 mt-2 tabular-nums">
            {loading ? '—' : metrics.available_today}
          </div>
          <div className="text-xs text-stone-500 mt-1">Ready for check-in</div>
        </div>
        <div className="bg-white border border-stone-200 rounded-2xl p-5">
          <div className="text-xs font-medium text-stone-500">Active Bookings</div>
          <div className="font-mono text-3xl font-bold text-blue-700 mt-2 tabular-nums">
            {loading ? '—' : metrics.active_bookings}
          </div>
          <div className="text-xs text-stone-500 mt-1">Confirmed current &amp; upcoming</div>
        </div>
        <div className="bg-white border border-stone-200 rounded-2xl p-5">
          <div className="text-xs font-medium text-stone-500">Estimated Revenue</div>
          <div className="font-mono text-3xl font-bold text-stone-900 mt-2 tabular-nums">
            {loading ? '—' : `$${metrics.estimated_revenue.toFixed(2)}`}
          </div>
          <div className="text-xs text-stone-500 mt-1">Confirmed &amp; completed stays</div>
        </div>
      </div>

      {/* Workspace Segmented Tabs + Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="inline-flex items-center gap-1 p-1 bg-stone-200/70 rounded-xl self-start">
          <button
            type="button"
            onClick={() => setTab('reservations')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              tab === 'reservations' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            Guest Reservations ({bookings.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('inventory')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              tab === 'inventory' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            Room Inventory ({rooms.length})
          </button>
        </div>

        {tab === 'reservations' && (
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={bookingSearch}
              onChange={(e) => setBookingSearch(e.target.value)}
              placeholder="Search code, guest, or room..."
              className="w-full pl-9 pr-3.5 py-2 text-xs bg-white border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
        )}
      </div>

      {tab === 'reservations' ? (
        <div className="bg-white border border-stone-200 rounded-2xl overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-200 text-xs text-stone-500 bg-stone-50">
              <tr>
                <th className="py-3.5 px-4 font-semibold">Code</th>
                <th className="py-3.5 px-4 font-semibold">Guest</th>
                <th className="py-3.5 px-4 font-semibold">Room</th>
                <th className="py-3.5 px-4 font-semibold">Stay Dates</th>
                <th className="py-3.5 px-4 font-semibold">Status</th>
                <th className="py-3.5 px-4 font-semibold text-right">Total</th>
                <th className="py-3.5 px-4 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredBookings.map((b) => (
                <tr key={b.id} className="hover:bg-stone-50/70">
                  <td className="py-3.5 px-4 font-mono text-xs font-semibold text-blue-700">{b.confirmation_code}</td>
                  <td className="py-3.5 px-4">
                    <div className="font-medium text-stone-900">{b.guest_name}</div>
                    <div className="text-xs text-stone-500">{b.guest_email}</div>
                  </td>
                  <td className="py-3.5 px-4 text-stone-700">
                    {b.room_number} &middot; {b.room_name}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-xs text-stone-600 tabular-nums">
                    {b.check_in} &rarr; {b.check_out}
                  </td>
                  <td
                    className={`py-3.5 px-4 text-xs font-semibold capitalize ${
                      b.status === 'confirmed'
                        ? 'text-emerald-700'
                        : b.status === 'completed'
                          ? 'text-stone-600'
                          : 'text-rose-700'
                    }`}
                  >
                    {b.status}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-right text-stone-900 tabular-nums">${b.total_price.toFixed(2)}</td>
                  <td className="py-3.5 px-4 text-right whitespace-nowrap space-x-1.5">
                    {b.status === 'confirmed' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleBookingAction(b.id, 'complete')}
                          className="px-2.5 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg cursor-pointer"
                        >
                          Check Out
                        </button>
                        <button
                          type="button"
                          onClick={() => handleBookingAction(b.id, 'cancel')}
                          className="px-2.5 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg cursor-pointer"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-stone-400">Archived</span>
                    )}
                  </td>
                </tr>
              ))}
              {filteredBookings.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-stone-500">
                    No reservations match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white border border-stone-200 rounded-2xl overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-200 text-xs text-stone-500 bg-stone-50">
              <tr>
                <th className="py-3.5 px-4 font-semibold">Room #</th>
                <th className="py-3.5 px-4 font-semibold">Name</th>
                <th className="py-3.5 px-4 font-semibold">Category</th>
                <th className="py-3.5 px-4 font-semibold">Capacity</th>
                <th className="py-3.5 px-4 font-semibold">Quick Status</th>
                <th className="py-3.5 px-4 font-semibold text-right">Rate / Night</th>
                <th className="py-3.5 px-4 font-semibold text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rooms.map((r) => (
                <tr key={r.id} className="hover:bg-stone-50/70">
                  <td className="py-3.5 px-4 font-mono text-xs font-semibold text-stone-900">{r.room_number}</td>
                  <td className="py-3.5 px-4 font-medium text-stone-900">{r.name}</td>
                  <td className="py-3.5 px-4 text-stone-600">{r.room_type}</td>
                  <td className="py-3.5 px-4 text-stone-600 tabular-nums">{r.capacity} guests</td>
                  <td className="py-3.5 px-4">
                    <select
                      aria-label={`Status for room ${r.room_number}`}
                      value={r.status}
                      onChange={(e) => handleQuickStatusChange(r, e.target.value as Room['status'])}
                      className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white cursor-pointer ${
                        r.status === 'available'
                          ? 'text-emerald-700'
                          : r.status === 'maintenance'
                            ? 'text-amber-700'
                            : 'text-rose-700'
                      }`}
                    >
                      <option value="available">Available</option>
                      <option value="occupied">Occupied</option>
                      <option value="maintenance">Maintenance</option>
                    </select>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-right text-stone-900 tabular-nums">
                    ${r.price_per_night.toFixed(2)}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => setEditingRoom({ ...r })}
                      className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Room Modal */}
      {addOpen && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-stone-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex justify-between items-center pb-3 border-b border-stone-100">
              <h3 className="font-display text-xl font-bold text-stone-900">Add New Room</h3>
              <button type="button" onClick={() => setAddOpen(false)} className="text-stone-400 hover:text-stone-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateRoom} className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-600 mb-1">Room Number</label>
                  <input
                    required
                    value={newRoom.room_number}
                    onChange={(e) => setNewRoom({ ...newRoom, room_number: e.target.value })}
                    placeholder="e.g. 212"
                    className="w-full px-3 py-2 text-sm border border-stone-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-600 mb-1">Category</label>
                  <select
                    value={newRoom.room_type}
                    onChange={(e) => setNewRoom({ ...newRoom, room_type: e.target.value as Room['room_type'] })}
                    className="w-full px-3 py-2 text-sm border border-stone-300 rounded-xl bg-white"
                  >
                    <option value="Standard">Standard</option>
                    <option value="Deluxe">Deluxe</option>
                    <option value="Suite">Suite</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Room Title</label>
                <input
                  required
                  value={newRoom.name}
                  onChange={(e) => setNewRoom({ ...newRoom, name: e.target.value })}
                  placeholder="Harbor Corner Deluxe"
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-xl"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-600 mb-1">Nightly Rate ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min={20}
                    required
                    value={newRoom.price_per_night}
                    onChange={(e) => setNewRoom({ ...newRoom, price_per_night: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-sm border border-stone-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-600 mb-1">Max Guests</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    required
                    value={newRoom.capacity}
                    onChange={(e) => setNewRoom({ ...newRoom, capacity: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-sm border border-stone-300 rounded-xl"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Amenities</label>
                <input
                  value={newRoom.amenities}
                  onChange={(e) => setNewRoom({ ...newRoom, amenities: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={newRoom.description}
                  onChange={(e) => setNewRoom({ ...newRoom, description: e.target.value })}
                  placeholder="Room highlights..."
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-xl"
                />
              </div>
              <button type="submit" className="w-full py-2.5 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-xl cursor-pointer">
                Create Room
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Room Modal */}
      {editingRoom && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-stone-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex justify-between items-center pb-3 border-b border-stone-100">
              <h3 className="font-display text-xl font-bold text-stone-900">Edit Room {editingRoom.room_number}</h3>
              <button type="button" onClick={() => setEditingRoom(null)} className="text-stone-400 hover:text-stone-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveEdit} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Room Title</label>
                <input
                  required
                  value={editingRoom.name}
                  onChange={(e) => setEditingRoom({ ...editingRoom, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-xl"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-600 mb-1">Category</label>
                  <select
                    value={editingRoom.room_type}
                    onChange={(e) => setEditingRoom({ ...editingRoom, room_type: e.target.value as Room['room_type'] })}
                    className="w-full px-3 py-2 text-sm border border-stone-300 rounded-xl bg-white"
                  >
                    <option value="Standard">Standard</option>
                    <option value="Deluxe">Deluxe</option>
                    <option value="Suite">Suite</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-600 mb-1">Rate ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min={20}
                    required
                    value={editingRoom.price_per_night}
                    onChange={(e) => setEditingRoom({ ...editingRoom, price_per_night: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-sm border border-stone-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-600 mb-1">Capacity</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    required
                    value={editingRoom.capacity}
                    onChange={(e) => setEditingRoom({ ...editingRoom, capacity: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-sm border border-stone-300 rounded-xl"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Operational Status</label>
                <select
                  value={editingRoom.status}
                  onChange={(e) => setEditingRoom({ ...editingRoom, status: e.target.value as Room['status'] })}
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-xl bg-white"
                >
                  <option value="available">Available</option>
                  <option value="occupied">Occupied</option>
                  <option value="maintenance">Maintenance</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Amenities</label>
                <input
                  value={editingRoom.amenities}
                  onChange={(e) => setEditingRoom({ ...editingRoom, amenities: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={editingRoom.description}
                  onChange={(e) => setEditingRoom({ ...editingRoom, description: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded-xl"
                />
              </div>
              <button type="submit" className="w-full py-2.5 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-xl cursor-pointer">
                Save Room Changes
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
