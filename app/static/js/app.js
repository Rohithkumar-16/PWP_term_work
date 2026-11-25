// Lightweight Vanilla JS for The Halcyon Hotel Flask App

const mobileBtn = document.getElementById('mobile-menu-btn');
const mobileMenu = document.getElementById('mobile-menu');
if (mobileBtn && mobileMenu) {
  mobileBtn.addEventListener('click', () => {
    mobileMenu.classList.toggle('hidden');
  });
}

// Auto-dismiss flash toasts after 5 seconds
setTimeout(() => {
  document.querySelectorAll('.toast-item').forEach((el) => {
    el.style.transition = 'opacity 250ms ease';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 260);
  });
}, 5000);

let activeRoomId = null;

function openBookingModal(
  roomId,
  roomName,
  roomNumber,
  roomType,
  nightlyRate,
  capacity,
  sizeSqft,
  bedConfig,
  description,
  amenities,
  imageUrl,
  checkIn,
  checkOut,
  guests
) {
  activeRoomId = roomId;
  const modal = document.getElementById('booking-modal');
  const form = document.getElementById('booking-form');
  if (!modal || !form) return;

  form.action = `/book/${roomId}`;
  document.getElementById('modal-room-meta').textContent = `${roomType} · Room ${roomNumber} · ${sizeSqft} sq ft`;
  document.getElementById('modal-room-title').textContent = roomName;
  document.getElementById('modal-room-specs').textContent = `${bedConfig} · Up to ${capacity} guests`;
  document.getElementById('modal-room-rate').textContent = `$${nightlyRate.toFixed(0)} / night`;
  document.getElementById('modal-room-desc').textContent = description;
  document.getElementById('modal-room-amenities').textContent = amenities.split(',').map((s) => s.trim()).filter(Boolean).join(' · ');

  const imgEl = document.getElementById('modal-room-img');
  if (imgEl) {
    imgEl.src = imageUrl;
    imgEl.alt = roomName;
  }

  const ciInput = document.getElementById('modal-checkin');
  const coInput = document.getElementById('modal-checkout');
  const guestsInput = document.getElementById('modal-guests');

  ciInput.value = checkIn;
  coInput.value = checkOut;
  guestsInput.max = capacity;
  guestsInput.value = Math.min(guests || 1, capacity);

  modal.classList.remove('hidden');
  refreshLiveAvailability();
}

function closeBookingModal() {
  const modal = document.getElementById('booking-modal');
  if (modal) modal.classList.add('hidden');
}

async function refreshLiveAvailability() {
  if (!activeRoomId) return;
  const checkIn = document.getElementById('modal-checkin').value;
  const checkOut = document.getElementById('modal-checkout').value;
  const guests = document.getElementById('modal-guests').value;

  const banner = document.getElementById('modal-availability-banner');
  const submitBtn = document.getElementById('modal-submit-btn');

  banner.textContent = 'Checking real-time room availability...';
  banner.className = 'text-xs font-semibold text-stone-500';

  try {
    const params = new URLSearchParams({
      room_id: String(activeRoomId),
      check_in: checkIn,
      check_out: checkOut,
      guests: String(guests),
    });
    const res = await fetch(`/api/rooms/availability?${params.toString()}`);
    const data = await res.json();

    if (!res.ok || !data.available) {
      banner.textContent = data.error || data.message || 'Not available for selected dates.';
      banner.className = 'text-xs font-semibold text-rose-700';
      if (submitBtn) submitBtn.disabled = true;
      return;
    }

    const p = data.pricing;
    document.getElementById('modal-rate-line').textContent = `${p.nights} night(s) × $${p.nightly_rate.toFixed(2)}`;
    document.getElementById('modal-subtotal').textContent = `$${p.subtotal.toFixed(2)}`;
    document.getElementById('modal-tax').textContent = `$${p.tax_amount.toFixed(2)}`;
    document.getElementById('modal-fee').textContent = `$${p.service_fee.toFixed(2)}`;
    document.getElementById('modal-total').textContent = `$${p.total_price.toFixed(2)}`;

    banner.textContent = 'Available for your dates — ready to confirm.';
    banner.className = 'text-xs font-semibold text-emerald-700';
    if (submitBtn) submitBtn.disabled = false;
  } catch (err) {
    banner.textContent = 'Could not verify availability. Please retry.';
    banner.className = 'text-xs font-semibold text-rose-700';
    if (submitBtn) submitBtn.disabled = true;
  }
}

['modal-checkin', 'modal-checkout', 'modal-guests'].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('change', refreshLiveAvailability);
});

function fillDemoCredentials(email, password) {
  const emailEl = document.getElementById('login-email');
  const passEl = document.getElementById('login-password');
  if (emailEl && passEl) {
    emailEl.value = email;
    passEl.value = password;
  }
}

function openEditRoomModal(id, name, roomType, price, capacity, status, description, amenities) {
  const modal = document.getElementById('edit-room-modal');
  const form = document.getElementById('edit-room-form');
  if (!modal || !form) return;

  form.action = `/admin/rooms/${id}/edit`;
  document.getElementById('edit-room-name').value = name;
  document.getElementById('edit-room-type').value = roomType;
  document.getElementById('edit-room-price').value = price;
  document.getElementById('edit-room-capacity').value = capacity;
  document.getElementById('edit-room-status').value = status;
  document.getElementById('edit-room-desc').value = description;
  document.getElementById('edit-room-amenities').value = amenities;
  modal.classList.remove('hidden');
}
