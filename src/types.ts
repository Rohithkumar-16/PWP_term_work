export type UserRole = 'guest' | 'admin';

export interface AuthUser {
  id: number;
  full_name: string;
  email: string;
  role: UserRole;
}

export interface RoomPricing {
  nights: number;
  nightly_rate: number;
  subtotal: number;
  tax_amount: number;
  service_fee: number;
  total_price: number;
}

export interface Room {
  id: number;
  room_number: string;
  name: string;
  room_type: 'Standard' | 'Deluxe' | 'Suite';
  price_per_night: number;
  capacity: number;
  bed_config: string;
  size_sqft: number;
  description: string;
  amenities: string;
  amenities_list?: string[];
  image_url: string;
  status: 'available' | 'occupied' | 'maintenance';
  available_for_dates?: boolean;
  pricing?: RoomPricing;
}

export interface Booking {
  id: number;
  confirmation_code: string;
  user_id: number;
  room_id: number;
  room_number: string;
  room_name: string;
  room_type: string;
  room_image?: string;
  guest_name: string;
  guest_email: string;
  guest_count: number;
  check_in: string;
  check_out: string;
  nights: number;
  nightly_rate: number;
  subtotal: number;
  tax_amount: number;
  service_fee: number;
  total_price: number;
  special_requests: string;
  status: 'confirmed' | 'cancelled' | 'completed';
  created_at: string;
}

export interface AdminMetrics {
  total_rooms: number;
  available_today: number;
  active_bookings: number;
  estimated_revenue: number;
}

export type ActiveView = 'catalog' | 'my-bookings' | 'admin';

export interface ToastMessage {
  id: number;
  type: 'success' | 'error' | 'warning';
  text: string;
}
