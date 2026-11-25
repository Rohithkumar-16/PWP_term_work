import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const TOKEN_SECRET = process.env.SECRET_KEY || crypto.randomBytes(32).toString('hex');

const TAX_RATE = 0.12;
const SERVICE_FEE = 25.0;

const db = new DatabaseSync(path.join(__dirname, 'hotel_preview.db'));
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'guest',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_number TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    room_type TEXT NOT NULL,
    price_per_night REAL NOT NULL,
    capacity INTEGER NOT NULL,
    bed_config TEXT NOT NULL,
    size_sqft INTEGER NOT NULL,
    description TEXT NOT NULL,
    amenities TEXT NOT NULL,
    image_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'available',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    confirmation_code TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    guest_name TEXT NOT NULL,
    guest_email TEXT NOT NULL,
    guest_count INTEGER NOT NULL,
    check_in TEXT NOT NULL,
    check_out TEXT NOT NULL,
    nights INTEGER NOT NULL,
    nightly_rate REAL NOT NULL,
    subtotal REAL NOT NULL,
    tax_amount REAL NOT NULL,
    service_fee REAL NOT NULL,
    total_price REAL NOT NULL,
    special_requests TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'confirmed',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derived = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derived.length) return false;
  return crypto.timingSafeEqual(keyBuf, derived);
}

function signToken(payload: { id: number; email: string; role: string }): string {
  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const body = Buffer.from(JSON.stringify({ ...payload, exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token: string): { id: number; email: string; role: string } | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', TOKEN_SECRET).update(body).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
      id: number;
      email: string;
      role: string;
      exp: number;
    };
    if (!parsed.exp || parsed.exp < Date.now()) return null;
    return { id: parsed.id, email: parsed.email, role: parsed.role };
  } catch {
    return null;
  }
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function calculatePricing(nightlyRate: number, nights: number) {
  const subtotal = roundMoney(nightlyRate * nights);
  const taxAmount = roundMoney(subtotal * TAX_RATE);
  const totalPrice = roundMoney(subtotal + taxAmount + SERVICE_FEE);
  return {
    nights,
    nightly_rate: roundMoney(nightlyRate),
    subtotal,
    tax_amount: taxAmount,
    service_fee: SERVICE_FEE,
    total_price: totalPrice,
  };
}

function todayIso(offsetDays = 0): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function isValidIsoDate(val: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) return false;
  const d = new Date(`${val}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === val;
}

function daysBetween(startIso: string, endIso: string): number {
  const start = new Date(`${startIso}T00:00:00Z`).getTime();
  const end = new Date(`${endIso}T00:00:00Z`).getTime();
  return Math.round((end - start) / (1000 * 60 * 60 * 24));
}

function generateConfirmationCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let token = '';
  for (let i = 0; i < 6; i += 1) {
    token += chars[crypto.randomInt(0, chars.length)];
  }
  return `HLC-${token}`;
}

function sanitizeText(raw: unknown, maxLen = 200): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().replace(/\s+/g, ' ').slice(0, maxLen);
}

function isValidEmail(email: string): boolean {
  return email.length <= 160 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

function seedDatabase(): void {
  const userCountRow = db.prepare('SELECT COUNT(*) AS cnt FROM users').get() as { cnt: number };
  if (userCountRow.cnt === 0) {
    const adminEmail = (process.env.ADMIN_EMAIL || 'admin@halcyonhotel.com').toLowerCase();
    const adminPass = process.env.ADMIN_PASSWORD || 'AdminPass2026!';
    const guestEmail = (process.env.GUEST_EMAIL || 'guest@halcyonhotel.com').toLowerCase();
    const guestPass = process.env.GUEST_PASSWORD || 'GuestPass2026!';

    const insertUser = db.prepare(
      'INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, ?)'
    );
    insertUser.run('Clara Vance (Reception Admin)', adminEmail, hashPassword(adminPass), 'admin');
    insertUser.run('Maya Lin', guestEmail, hashPassword(guestPass), 'guest');
  }

  const roomCountRow = db.prepare('SELECT COUNT(*) AS cnt FROM rooms').get() as { cnt: number };
  if (roomCountRow.cnt === 0) {
    const insertRoom = db.prepare(`
      INSERT INTO rooms (
        room_number, name, room_type, price_per_night, capacity, bed_config,
        size_sqft, description, amenities, image_url, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const seedRooms = [
      [
        '101',
        'Courtyard Standard King',
        'Standard',
        159,
        2,
        '1 King Bed',
        320,
        'Quiet garden-level sanctuary featuring bespoke oak millwork, organic cotton linens, rain shower, and morning light through linen drapes.',
        'High-Speed Wi-Fi, Espresso Bar, Rain Shower, Smart TV, Workspace Desk',
        '/src/assets/images/room_standard_king_1795627761331.jpg',
        'available',
      ],
      [
        '104',
        'Sunlit Standard Twin',
        'Standard',
        145,
        2,
        '2 Twin Beds',
        310,
        'Warm minimalist twin room ideal for companions or business travelers, complete with acoustic glazing and ceramic bedside lighting.',
        'High-Speed Wi-Fi, Walk-in Shower, Tea Kettle, Climate Control, Safe',
        '/src/assets/images/room_standard_king_1795627761331.jpg',
        'available',
      ],
      [
        '202',
        'Terrace Deluxe King',
        'Deluxe',
        235,
        3,
        '1 King Bed + Lounge Sofa',
        460,
        'Expansive glass doors open onto a private furnished terrace overlooking the coastal rooftops with woven lounge seating and bespoke bath amenities.',
        'Private Terrace, High-Speed Wi-Fi, Espresso Bar, Robes & Slippers, Mini Bar',
        '/src/assets/images/room_deluxe_terrace_1795627761635.jpg',
        'available',
      ],
      [
        '208',
        'Botanical Deluxe Queen',
        'Deluxe',
        219,
        4,
        '2 Queen Beds',
        490,
        'Generously proportioned corner room designed for families or small groups, blending sunlit oak floors with terracotta textiles and dual vanities.',
        'Private Balcony, Dual Vanity, High-Speed Wi-Fi, Smart TV, Lounge Seating',
        '/src/assets/images/room_deluxe_terrace_1795627761635.jpg',
        'available',
      ],
      [
        '305',
        'Walnut Salon Executive Suite',
        'Suite',
        365,
        4,
        '1 King Bed + Sofa Bed',
        680,
        'Separate living salon framed by warm walnut archways, curved boucle sofa, travertine entertaining table, and deep soaking tub.',
        'Separate Salon, Soaking Tub, Complimentary Breakfast, Late Checkout, Espresso Bar',
        '/src/assets/images/room_executive_suite_1795627763024.jpg',
        'available',
      ],
      [
        '401',
        'Skyline Penthouse Loft',
        'Suite',
        520,
        4,
        '1 California King Bed',
        920,
        'Top-floor architectural showcase with wraparound skyline windows, sculptural timber ceiling, private dining nook, and concierge service.',
        'Panoramic Skyline View, Private Dining Nook, Concierge Service, Soaking Tub, Welcome Champagne',
        '/src/assets/images/room_penthouse_loft_1795627762875.jpg',
        'available',
      ],
    ] as const;

    for (const r of seedRooms) {
      insertRoom.run(...r);
    }
  }

  const bookingCountRow = db.prepare('SELECT COUNT(*) AS cnt FROM bookings').get() as { cnt: number };
  if (bookingCountRow.cnt === 0) {
    const guest = db.prepare("SELECT id, full_name, email FROM users WHERE role = 'guest' LIMIT 1").get() as
      | { id: number; full_name: string; email: string }
      | undefined;

    const r202 = db.prepare("SELECT id, price_per_night FROM rooms WHERE room_number = '202'").get() as
      | { id: number; price_per_night: number }
      | undefined;
    const r305 = db.prepare("SELECT id, price_per_night FROM rooms WHERE room_number = '305'").get() as
      | { id: number; price_per_night: number }
      | undefined;
    const r101 = db.prepare("SELECT id, price_per_night FROM rooms WHERE room_number = '101'").get() as
      | { id: number; price_per_night: number }
      | undefined;

    if (guest && r202 && r305 && r101) {
      const insertBooking = db.prepare(`
        INSERT INTO bookings (
          confirmation_code, user_id, room_id, guest_name, guest_email, guest_count,
          check_in, check_out, nights, nightly_rate, subtotal, tax_amount, service_fee,
          total_price, special_requests, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const samples = [
        { code: 'HLC-48291A', room: r202, ci: todayIso(5), co: todayIso(8), guests: 2, status: 'confirmed', req: 'High floor quiet corner if available.' },
        { code: 'HLC-91042B', room: r305, ci: todayIso(0), co: todayIso(2), guests: 2, status: 'confirmed', req: 'Celebrating an anniversary.' },
        { code: 'HLC-30517C', room: r101, ci: todayIso(-12), co: todayIso(-10), guests: 1, status: 'completed', req: 'Early check-in requested.' },
      ];

      for (const s of samples) {
        const nights = daysBetween(s.ci, s.co);
        const p = calculatePricing(s.room.price_per_night, nights);
        insertBooking.run(
          s.code,
          guest.id,
          s.room.id,
          guest.full_name,
          guest.email,
          s.guests,
          s.ci,
          s.co,
          nights,
          p.nightly_rate,
          p.subtotal,
          p.tax_amount,
          p.service_fee,
          p.total_price,
          s.req,
          s.status
        );
      }
    }
  }
}

seedDatabase();

interface RoomRow {
  id: number;
  room_number: string;
  name: string;
  room_type: string;
  price_per_night: number;
  capacity: number;
  bed_config: string;
  size_sqft: number;
  description: string;
  amenities: string;
  image_url: string;
  status: string;
}

function isRoomAvailableForDates(room: RoomRow, checkIn: string, checkOut: string): boolean {
  if (room.status === 'maintenance') return false;
  const conflict = db
    .prepare(
      `SELECT id FROM bookings
       WHERE room_id = ? AND status = 'confirmed' AND check_in < ? AND check_out > ?
       LIMIT 1`
    )
    .get(room.id, checkOut, checkIn);
  return !conflict;
}

interface AuthedRequest extends Request {
  authUser?: { id: number; full_name: string; email: string; role: string };
}

function attachUser(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    const token = header.slice(7).trim();
    const claims = verifyToken(token);
    if (claims) {
      const user = db
        .prepare('SELECT id, full_name, email, role FROM users WHERE id = ?')
        .get(claims.id) as { id: number; full_name: string; email: string; role: string } | undefined;
      if (user) {
        req.authUser = user;
      }
    }
  }
  next();
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.authUser) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  next();
}

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.authUser) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  if (req.authUser.role !== 'admin') {
    res.status(403).json({ error: 'Reception admin privileges required.' });
    return;
  }
  next();
}

const rateBuckets = new Map<string, { count: number; resetAt: number }>();
function rateLimit(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || bucket.resetAt < now) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    if (bucket.count >= maxRequests) {
      res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
      return;
    }
    bucket.count += 1;
    next();
  };
}

const DEFAULT_IMAGE_BY_TYPE: Record<string, string> = {
  Standard: '/src/assets/images/room_standard_king_1795627761331.jpg',
  Deluxe: '/src/assets/images/room_deluxe_terrace_1795627761635.jpg',
  Suite: '/src/assets/images/room_executive_suite_1795627763024.jpg',
};

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '100kb' }));
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });
  app.use(attachUser);

  // Auth routes
  app.post('/api/auth/login', rateLimit(20, 60_000), (req: Request, res: Response) => {
    const email = sanitizeText(req.body?.email, 160).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!isValidEmail(email) || !password) {
      res.status(400).json({ error: 'Please enter a valid email and password.' });
      return;
    }

    const user = db
      .prepare('SELECT id, full_name, email, password_hash, role FROM users WHERE email = ?')
      .get(email) as
      | { id: number; full_name: string; email: string; password_hash: string; role: string }
      | undefined;

    if (!user || !verifyPassword(password, user.password_hash)) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const token = signToken({ id: user.id, email: user.email, role: user.role });
    res.json({
      token,
      user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role },
    });
  });

  app.post('/api/auth/register', rateLimit(10, 60_000), (req: Request, res: Response) => {
    const fullName = sanitizeText(req.body?.full_name, 120);
    const email = sanitizeText(req.body?.email, 160).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (fullName.length < 2) {
      res.status(400).json({ error: 'Full name must be at least 2 characters.' });
      return;
    }
    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters.' });
      return;
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const result = db
      .prepare('INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, ?)')
      .run(fullName, email, hashPassword(password), 'guest');

    const userId = Number(result.lastInsertRowid);
    const token = signToken({ id: userId, email, role: 'guest' });
    res.status(201).json({
      token,
      user: { id: userId, full_name: fullName, email, role: 'guest' },
    });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res: Response) => {
    res.json({ user: req.authUser });
  });

  // Catalog & Live Availability
  app.get('/api/rooms', (req: Request, res: Response) => {
    const today = todayIso(0);
    const checkIn = typeof req.query.check_in === 'string' ? req.query.check_in : todayIso(1);
    const checkOut = typeof req.query.check_out === 'string' ? req.query.check_out : todayIso(3);
    const guests = Math.max(1, Math.min(10, Number(req.query.guests) || 1));
    const roomType = sanitizeText(req.query.room_type, 30);
    const maxPrice = Number(req.query.max_price) || null;

    if (!isValidIsoDate(checkIn) || !isValidIsoDate(checkOut) || checkIn < today || checkOut <= checkIn) {
      res.status(400).json({ error: 'Check-out must be after check-in and dates cannot be in the past.' });
      return;
    }

    const nights = daysBetween(checkIn, checkOut);
    if (nights > 60) {
      res.status(400).json({ error: 'Reservations are limited to 60 nights.' });
      return;
    }

    let sql = 'SELECT * FROM rooms WHERE capacity >= ?';
    const params: (string | number)[] = [guests];

    if (roomType && ['Standard', 'Deluxe', 'Suite'].includes(roomType)) {
      sql += ' AND room_type = ?';
      params.push(roomType);
    }
    if (maxPrice && maxPrice > 0) {
      sql += ' AND price_per_night <= ?';
      params.push(maxPrice);
    }
    sql += ' ORDER BY price_per_night ASC';

    const rows = db.prepare(sql).all(...params) as unknown as RoomRow[];
    const rooms = rows.map((r) => ({
      ...r,
      amenities_list: r.amenities.split(',').map((s) => s.trim()).filter(Boolean),
      available_for_dates: isRoomAvailableForDates(r, checkIn, checkOut),
      pricing: calculatePricing(r.price_per_night, nights),
    }));

    res.json({ rooms, check_in: checkIn, check_out: checkOut, nights });
  });

  app.get('/api/rooms/availability', (req: Request, res: Response) => {
    const roomId = Number(req.query.room_id);
    const checkIn = String(req.query.check_in || '');
    const checkOut = String(req.query.check_out || '');
    const guests = Math.max(1, Number(req.query.guests) || 1);
    const today = todayIso(0);

    if (!Number.isInteger(roomId) || roomId <= 0) {
      res.status(400).json({ available: false, error: 'Invalid room ID.' });
      return;
    }
    if (!isValidIsoDate(checkIn) || !isValidIsoDate(checkOut) || checkIn < today || checkOut <= checkIn) {
      res.status(400).json({
        available: false,
        error: 'Check-out must be at least one night after check-in (today or later).',
      });
      return;
    }

    const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId) as RoomRow | undefined;
    if (!room) {
      res.status(404).json({ available: false, error: 'Room not found.' });
      return;
    }
    if (guests > room.capacity) {
      res.status(400).json({
        available: false,
        error: `This room accommodates up to ${room.capacity} guests.`,
      });
      return;
    }

    const available = isRoomAvailableForDates(room, checkIn, checkOut);
    const nights = daysBetween(checkIn, checkOut);
    res.json({
      available,
      room_id: room.id,
      pricing: calculatePricing(room.price_per_night, nights),
      message: available
        ? 'Available for your dates — ready to confirm.'
        : 'Already booked or in maintenance for these dates.',
    });
  });

  // Guest Bookings
  app.get('/api/bookings', requireAuth, (req: AuthedRequest, res: Response) => {
    const rows = db
      .prepare(
        `SELECT b.*, r.room_number, r.name AS room_name, r.room_type, r.image_url AS room_image
         FROM bookings b
         JOIN rooms r ON r.id = b.room_id
         WHERE b.user_id = ?
         ORDER BY b.check_in DESC, b.id DESC`
      )
      .all(req.authUser!.id);
    res.json({ bookings: rows });
  });

  app.post('/api/bookings', requireAuth, rateLimit(15, 60_000), (req: AuthedRequest, res: Response) => {
    const roomId = Number(req.body?.room_id);
    const checkIn = String(req.body?.check_in || '');
    const checkOut = String(req.body?.check_out || '');
    const guestCount = Number(req.body?.guest_count);
    const guestName = sanitizeText(req.body?.guest_name || req.authUser!.full_name, 120);
    const guestEmail = sanitizeText(req.body?.guest_email || req.authUser!.email, 160).toLowerCase();
    const specialRequests = sanitizeText(req.body?.special_requests, 400);
    const today = todayIso(0);

    if (!Number.isInteger(roomId) || roomId <= 0) {
      res.status(400).json({ error: 'Invalid room selected.' });
      return;
    }
    if (!isValidIsoDate(checkIn) || !isValidIsoDate(checkOut) || checkIn < today || checkOut <= checkIn) {
      res.status(400).json({ error: 'Please select valid check-in and check-out dates.' });
      return;
    }

    const nights = daysBetween(checkIn, checkOut);
    if (nights > 60) {
      res.status(400).json({ error: 'Online reservations are limited to 60 nights.' });
      return;
    }
    if (guestName.length < 2 || !isValidEmail(guestEmail)) {
      res.status(400).json({ error: 'Please enter a valid primary guest name and email.' });
      return;
    }

    const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId) as RoomRow | undefined;
    if (!room) {
      res.status(404).json({ error: 'Selected room was not found.' });
      return;
    }
    if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > room.capacity) {
      res.status(400).json({ error: `Guest count must be between 1 and ${room.capacity}.` });
      return;
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      if (!isRoomAvailableForDates(room, checkIn, checkOut)) {
        db.exec('ROLLBACK');
        res.status(409).json({
          error: `${room.name} is no longer available for ${checkIn} to ${checkOut}.`,
        });
        return;
      }

      const pricing = calculatePricing(room.price_per_night, nights);
      let code = generateConfirmationCode();
      while (db.prepare('SELECT id FROM bookings WHERE confirmation_code = ?').get(code)) {
        code = generateConfirmationCode();
      }

      const insertRes = db
        .prepare(
          `INSERT INTO bookings (
            confirmation_code, user_id, room_id, guest_name, guest_email, guest_count,
            check_in, check_out, nights, nightly_rate, subtotal, tax_amount, service_fee,
            total_price, special_requests, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed')`
        )
        .run(
          code,
          req.authUser!.id,
          room.id,
          guestName,
          guestEmail,
          guestCount,
          checkIn,
          checkOut,
          nights,
          pricing.nightly_rate,
          pricing.subtotal,
          pricing.tax_amount,
          pricing.service_fee,
          pricing.total_price,
          specialRequests
        );

      db.exec('COMMIT');

      const created = db
        .prepare(
          `SELECT b.*, r.room_number, r.name AS room_name, r.room_type, r.image_url AS room_image
           FROM bookings b JOIN rooms r ON r.id = b.room_id WHERE b.id = ?`
        )
        .get(Number(insertRes.lastInsertRowid));

      res.status(201).json({ booking: created });
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  });

  app.post('/api/bookings/:id/cancel', requireAuth, (req: AuthedRequest, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid booking ID.' });
      return;
    }

    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id) as
      | { id: number; user_id: number; status: string; confirmation_code: string }
      | undefined;

    if (!booking) {
      res.status(404).json({ error: 'Booking not found.' });
      return;
    }
    if (booking.user_id !== req.authUser!.id && req.authUser!.role !== 'admin') {
      res.status(403).json({ error: 'You are not authorized to cancel this reservation.' });
      return;
    }
    if (booking.status !== 'confirmed') {
      res.status(400).json({ error: 'Only confirmed reservations can be cancelled.' });
      return;
    }

    db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(id);
    res.json({ message: `Reservation ${booking.confirmation_code} cancelled.` });
  });

  // Admin Dashboard & Operations
  app.get('/api/admin/overview', requireAdmin, (_req: AuthedRequest, res: Response) => {
    const today = todayIso(0);
    const rooms = db.prepare('SELECT * FROM rooms ORDER BY room_number ASC').all() as unknown as RoomRow[];
    const bookings = db
      .prepare(
        `SELECT b.*, r.room_number, r.name AS room_name, r.room_type
         FROM bookings b JOIN rooms r ON r.id = b.room_id
         ORDER BY b.id DESC`
      )
      .all() as unknown as Array<{
      id: number;
      room_id: number;
      status: string;
      check_in: string;
      check_out: string;
      total_price: number;
    }>;

    const availableToday = rooms.filter((r) => {
      if (r.status !== 'available') return false;
      const busy = bookings.some(
        (b) =>
          b.room_id === r.id &&
          b.status === 'confirmed' &&
          b.check_in <= today &&
          b.check_out > today
      );
      return !busy;
    }).length;

    const activeBookings = bookings.filter(
      (b) => b.status === 'confirmed' && b.check_out >= today
    ).length;

    const estimatedRevenue = roundMoney(
      bookings
        .filter((b) => b.status === 'confirmed' || b.status === 'completed')
        .reduce((sum, b) => sum + b.total_price, 0)
    );

    res.json({
      metrics: {
        total_rooms: rooms.length,
        available_today: availableToday,
        active_bookings: activeBookings,
        estimated_revenue: estimatedRevenue,
      },
      rooms,
      bookings,
    });
  });

  app.post('/api/admin/rooms', requireAdmin, (req: AuthedRequest, res: Response) => {
    const roomNumber = sanitizeText(req.body?.room_number, 20);
    const name = sanitizeText(req.body?.name, 120);
    const roomType = sanitizeText(req.body?.room_type, 30);
    const price = Number(req.body?.price_per_night);
    const capacity = Number(req.body?.capacity);
    const bedConfig = sanitizeText(req.body?.bed_config, 80) || '1 King Bed';
    const sizeSqft = Number(req.body?.size_sqft) || 350;
    const description =
      sanitizeText(req.body?.description, 600) || 'Thoughtfully appointed boutique guest room.';
    const amenities =
      sanitizeText(req.body?.amenities, 300) || 'High-Speed Wi-Fi, Espresso Bar, Rain Shower';
    const status = ['available', 'occupied', 'maintenance'].includes(req.body?.status)
      ? req.body.status
      : 'available';

    if (
      !roomNumber ||
      !name ||
      !['Standard', 'Deluxe', 'Suite'].includes(roomType) ||
      !Number.isFinite(price) ||
      price < 20 ||
      price > 15000 ||
      !Number.isInteger(capacity) ||
      capacity < 1 ||
      capacity > 12
    ) {
      res.status(400).json({ error: 'Please provide valid room details, price, and capacity.' });
      return;
    }

    if (db.prepare('SELECT id FROM rooms WHERE room_number = ?').get(roomNumber)) {
      res.status(409).json({ error: `Room ${roomNumber} already exists.` });
      return;
    }

    const insertRes = db
      .prepare(
        `INSERT INTO rooms (
          room_number, name, room_type, price_per_night, capacity, bed_config,
          size_sqft, description, amenities, image_url, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        roomNumber,
        name,
        roomType,
        roundMoney(price),
        capacity,
        bedConfig,
        sizeSqft,
        description,
        amenities,
        DEFAULT_IMAGE_BY_TYPE[roomType] || DEFAULT_IMAGE_BY_TYPE.Standard,
        status
      );

    const created = db.prepare('SELECT * FROM rooms WHERE id = ?').get(Number(insertRes.lastInsertRowid));
    res.status(201).json({ room: created });
  });

  app.patch('/api/admin/rooms/:id', requireAdmin, (req: AuthedRequest, res: Response) => {
    const id = Number(req.params.id);
    const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(id) as RoomRow | undefined;
    if (!room) {
      res.status(404).json({ error: 'Room not found.' });
      return;
    }

    const name = sanitizeText(req.body?.name ?? room.name, 120);
    const roomType = sanitizeText(req.body?.room_type ?? room.room_type, 30);
    const price = Number(req.body?.price_per_night ?? room.price_per_night);
    const capacity = Number(req.body?.capacity ?? room.capacity);
    const status = sanitizeText(req.body?.status ?? room.status, 20);
    const description = sanitizeText(req.body?.description ?? room.description, 600);
    const amenities = sanitizeText(req.body?.amenities ?? room.amenities, 300);

    if (
      !name ||
      !['Standard', 'Deluxe', 'Suite'].includes(roomType) ||
      !['available', 'occupied', 'maintenance'].includes(status) ||
      !Number.isFinite(price) ||
      price < 20 ||
      !Number.isInteger(capacity) ||
      capacity < 1
    ) {
      res.status(400).json({ error: 'Invalid room update details.' });
      return;
    }

    db.prepare(
      `UPDATE rooms
       SET name = ?, room_type = ?, price_per_night = ?, capacity = ?, status = ?, description = ?, amenities = ?
       WHERE id = ?`
    ).run(name, roomType, roundMoney(price), capacity, status, description, amenities, id);

    const updated = db.prepare('SELECT * FROM rooms WHERE id = ?').get(id);
    res.json({ room: updated });
  });

  app.post('/api/admin/bookings/:id/complete', requireAdmin, (req: AuthedRequest, res: Response) => {
    const id = Number(req.params.id);
    const booking = db.prepare('SELECT id, status FROM bookings WHERE id = ?').get(id) as
      | { id: number; status: string }
      | undefined;
    if (!booking) {
      res.status(404).json({ error: 'Booking not found.' });
      return;
    }
    if (booking.status !== 'confirmed') {
      res.status(400).json({ error: 'Only confirmed bookings can be completed.' });
      return;
    }
    db.prepare("UPDATE bookings SET status = 'completed' WHERE id = ?").run(id);
    res.json({ message: 'Booking marked completed.' });
  });

  app.post('/api/admin/bookings/:id/cancel', requireAdmin, (req: AuthedRequest, res: Response) => {
    const id = Number(req.params.id);
    const booking = db.prepare('SELECT id, status FROM bookings WHERE id = ?').get(id) as
      | { id: number; status: string }
      | undefined;
    if (!booking) {
      res.status(404).json({ error: 'Booking not found.' });
      return;
    }
    if (booking.status !== 'confirmed') {
      res.status(400).json({ error: 'Only confirmed bookings can be cancelled.' });
      return;
    }
    db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(id);
    res.json({ message: 'Booking cancelled by reception.' });
  });

  // Error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (!IS_PRODUCTION) {
      console.error(err);
    }
    res.status(500).json({ error: 'An unexpected server error occurred.' });
  });

  // Vite dev middleware or static dist serving
  if (!IS_PRODUCTION) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`The Halcyon Hotel preview server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
