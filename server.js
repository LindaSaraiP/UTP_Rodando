'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const PUBLIC_ROOT = path.join(ROOT, 'public');
const DB_DIR = path.join(ROOT, 'data');
const DB_PATH = process.env.DATABASE_FILE ? path.resolve(process.env.DATABASE_FILE) : path.join(DB_DIR, 'rodando-utp.db');
const PORT = Number(process.env.PORT || 3000);
const NODE_ENV = process.env.NODE_ENV || 'development';
const SESSION_DAYS = Number(process.env.SESSION_DAYS || 7);
const ALLOWED_EMAIL_DOMAIN = (process.env.ALLOWED_EMAIL_DOMAIN || 'utpuebla.edu.mx').toLowerCase();
const MAX_BODY_BYTES = 64 * 1024;
const ECO_CO2_KG_PER_SHARED_SEAT = 1.8;
const APP_VERSION = '5.1.0-admin-panel';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@utpuebla.edu.mx').trim().toLowerCase();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || 'RodandoParking2026');
const ADMIN_NAME = process.env.ADMIN_NAME || 'Administrador Rodando UTP';

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');

function nowIso() { return new Date().toISOString(); }
function daysFromNow(days) { return new Date(Date.now() + days * 86400000).toISOString(); }
function randomToken(bytes = 32) { return crypto.randomBytes(bytes).toString('base64url'); }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function normalizeEmail(v = '') { return String(v).trim().toLowerCase(); }
function cleanText(v = '', max = 120) { return String(v || '').trim().replace(/\s+/g, ' ').slice(0, max); }
function isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
function isAllowedEmail(email) { return !ALLOWED_EMAIL_DOMAIN || email.endsWith('@' + ALLOWED_EMAIL_DOMAIN); }
function isValidStudentId(id) { return /^[A-Za-z0-9-]{4,24}$/.test(id); }
function parsePositiveInt(v, min, max) { const n = Number(v); return Number.isInteger(n) && n >= min && n <= max ? n : null; }
function parseMoneyToCents(v) { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= 500 ? Math.round(n * 100) : null; }
function safeDateTime(v) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getTime() < Date.now() - 10 * 60 * 1000) return null;
  if (d.getTime() > Date.now() + 180 * 86400000) return null;
  return d.toISOString();
}
function maskEmail(email) {
  const [local, domain] = String(email || '').split('@');
  if (!domain) return '';
  return `${local.slice(0, 2)}***@${domain}`;
}
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  try {
    const [salt, expectedHex] = String(stored).split(':');
    const actual = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(expectedHex, 'hex');
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    studentId: row.student_id,
    email: row.email,
    verified: !!row.verified,
    role: row.role || 'user',
    createdAt: row.created_at
  };
}

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      student_id TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      verified INTEGER NOT NULL DEFAULT 0,
      role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      token_hash TEXT NOT NULL UNIQUE,
      csrf_token TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS rides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      driver_id INTEGER NOT NULL,
      origin TEXT NOT NULL,
      destination TEXT NOT NULL DEFAULT 'Universidad Tecnológica de Puebla',
      pickup_point TEXT NOT NULL,
      departure_at TEXT NOT NULL,
      seats_total INTEGER NOT NULL CHECK (seats_total BETWEEN 1 AND 6),
      contribution_cents INTEGER NOT NULL CHECK (contribution_cents BETWEEN 0 AND 50000),
      vehicle TEXT NOT NULL,
      color TEXT NOT NULL,
      plate_last4 TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      connection_mode TEXT NOT NULL DEFAULT 'direct' CHECK (connection_mode IN ('direct','hub')),
      connection_hub TEXT NOT NULL DEFAULT '',
      parking_eligible INTEGER NOT NULL DEFAULT 0,
      parking_code TEXT NOT NULL DEFAULT '',
      parking_generated_at TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled','completed')),
      created_at TEXT NOT NULL,
      FOREIGN KEY (driver_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ride_id INTEGER NOT NULL,
      passenger_id INTEGER NOT NULL,
      seats INTEGER NOT NULL CHECK (seats BETWEEN 1 AND 4),
      status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','cancelled')),
      created_at TEXT NOT NULL,
      UNIQUE (ride_id, passenger_id),
      FOREIGN KEY (ride_id) REFERENCES rides(id) ON DELETE CASCADE,
      FOREIGN KEY (passenger_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
    CREATE INDEX IF NOT EXISTS idx_rides_departure ON rides(departure_at);
    CREATE INDEX IF NOT EXISTS idx_rides_origin ON rides(origin);
    CREATE INDEX IF NOT EXISTS idx_reservations_ride ON reservations(ride_id);
  `);

  const admin = db.prepare('SELECT id FROM users WHERE email = ?').get(ADMIN_EMAIL);
  if (!admin) {
    db.prepare(`INSERT INTO users (name, student_id, email, password_hash, verified, role, created_at)
                VALUES (?, ?, ?, ?, 1, 'admin', ?)`)
      .run(ADMIN_NAME, 'ADMIN-UTP', ADMIN_EMAIL, hashPassword(ADMIN_PASSWORD), nowIso());
  } else {
    db.prepare("UPDATE users SET role='admin', verified=1 WHERE id=?").run(admin.id);
  }

  const userCount = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role='user'").get().c;
  const rideCount = db.prepare('SELECT COUNT(*) AS c FROM rides').get().c;
  if (!userCount) seedUsers();
  if (!rideCount) seedRides();
}

function seedUsers() {
  const insertUser = db.prepare(`INSERT INTO users (name, student_id, email, password_hash, verified, role, created_at)
                                 VALUES (?, ?, ?, ?, 1, 'user', ?)`);
  const demo = [
    ['Mariana López', 'UTP-DEMO-01', 'mariana.demo@utpuebla.edu.mx'],
    ['Diego Hernández', 'UTP-DEMO-02', 'diego.demo@utpuebla.edu.mx'],
    ['Valeria Cruz', 'UTP-DEMO-03', 'valeria.demo@utpuebla.edu.mx']
  ];
  for (const [name, studentId, email] of demo) {
    insertUser.run(name, studentId, email, hashPassword('DemoSeguro2026'), nowIso());
  }
}

function userIdByEmail(email) {
  const row = db.prepare('SELECT id FROM users WHERE email=?').get(email);
  return row ? row.id : null;
}

function seedRides() {
  const ids = [
    userIdByEmail('mariana.demo@utpuebla.edu.mx'),
    userIdByEmail('diego.demo@utpuebla.edu.mx'),
    userIdByEmail('valeria.demo@utpuebla.edu.mx')
  ];
  const insertRide = db.prepare(`INSERT INTO rides
    (driver_id, origin, destination, pickup_point, departure_at, seats_total, contribution_cents, vehicle, color, plate_last4, notes, connection_mode, connection_hub, parking_eligible, status, created_at)
    VALUES (?, ?, 'Universidad Tecnológica de Puebla', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const tomorrow = new Date(Date.now() + 86400000);
  const at = (h, m) => { const d = new Date(tomorrow); d.setHours(h, m, 0, 0); return d.toISOString(); };
  insertRide.run(ids[0], 'Cholula', 'Explanada Puebla, acceso principal', at(6, 45), 3, 3500, 'Nissan Versa 2020', 'Gris', '4K2M', 'Viaje directo de mañana.', 'direct', '', 0, 'active', nowIso());
  insertRide.run(ids[1], 'Angelópolis', 'Parada frente a Solesta', at(7, 10), 3, 3000, 'Kia Rio 2021', 'Azul', '9P7R', 'Ruta con pase de estacionamiento colaborativo.', 'direct', '', 1, 'active', nowIso());
  insertRide.run(ids[2], 'Amozoc', 'Parque Puebla, acceso norte', at(12, 40), 4, 2500, 'Chevrolet Aveo 2019', 'Blanco', '2M8A', 'Ruta flexible con punto de conexión.', 'hub', 'Parque Puebla', 1, 'active', nowIso());

  const completedAt = (days, h, m) => { const d = new Date(Date.now() - days * 86400000); d.setHours(h, m, 0, 0); return d.toISOString(); };
  const r1 = Number(insertRide.run(ids[0], 'Cholula', 'Explanada Puebla', completedAt(5, 6, 45), 3, 3500, 'Nissan Versa 2020', 'Gris', '4K2M', 'Histórico de muestra.', 'direct', '', 0, 'completed', completedAt(6, 6, 0)).lastInsertRowid);
  const r2 = Number(insertRide.run(ids[1], 'Angelópolis', 'Solesta', completedAt(3, 7, 10), 3, 3000, 'Kia Rio 2021', 'Azul', '9P7R', 'Histórico de muestra.', 'direct', '', 1, 'completed', completedAt(4, 6, 0)).lastInsertRowid);
  const r3 = Number(insertRide.run(ids[2], 'Amozoc', 'Parque Puebla', completedAt(1, 12, 40), 4, 2500, 'Chevrolet Aveo 2019', 'Blanco', '2M8A', 'Histórico de muestra.', 'hub', 'Parque Puebla', 1, 'completed', completedAt(2, 6, 0)).lastInsertRowid);

  const insertReservation = db.prepare("INSERT INTO reservations (ride_id, passenger_id, seats, status, created_at) VALUES (?, ?, ?, 'confirmed', ?)");
  insertReservation.run(r1, ids[1], 1, completedAt(6, 7, 0));
  insertReservation.run(r1, ids[2], 1, completedAt(6, 7, 5));
  insertReservation.run(r2, ids[0], 1, completedAt(4, 7, 0));
  insertReservation.run(r3, ids[0], 1, completedAt(2, 7, 0));
  insertReservation.run(r3, ids[1], 1, completedAt(2, 7, 5));
}

initDb();

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.txt': 'text/plain; charset=utf-8'
};

const rate = new Map();
function rateLimit(ip, bucket, limit, windowMs) {
  const key = `${ip}:${bucket}`;
  const now = Date.now();
  const rec = rate.get(key);
  if (!rec || now > rec.reset) {
    rate.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  if (rec.count >= limit) return false;
  rec.count += 1;
  return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rate) if (v.reset < now) rate.delete(k);
}, 10 * 60 * 1000).unref();

function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "media-src 'self'",
    "connect-src 'self'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    "worker-src 'self'"
  ].join('; '));
  if (NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}
function json(res, status, payload, extraHeaders = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v);
  res.end(JSON.stringify(payload));
}
function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}
function createSession(res, userId = null) {
  const token = randomToken(32);
  const csrf = randomToken(24);
  db.prepare('INSERT INTO sessions (user_id, token_hash, csrf_token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(userId, sha256(token), csrf, daysFromNow(SESSION_DAYS), nowIso());
  const secure = NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `rodando_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}${secure}`);
  return { token, csrf };
}
function sessionFromReq(req) {
  const token = parseCookies(req).rodando_session;
  if (!token) return null;
  const row = db.prepare(`SELECT s.*, u.name, u.student_id, u.email, u.verified, u.role, u.created_at AS user_created_at
                          FROM sessions s LEFT JOIN users u ON u.id = s.user_id
                          WHERE s.token_hash = ? AND s.expires_at > ?`).get(sha256(token), nowIso());
  if (!row) return null;
  return { token, row };
}
function ensureSession(req, res) {
  const existing = sessionFromReq(req);
  if (existing) return existing;
  const fresh = createSession(res, null);
  return { token: fresh.token, row: { user_id: null, csrf_token: fresh.csrf } };
}
function rotateSession(res, oldSession, userId) {
  if (oldSession) db.prepare('DELETE FROM sessions WHERE id=?').run(oldSession.row.id);
  return createSession(res, userId);
}
function requireAuth(req, res) {
  const s = sessionFromReq(req);
  if (!s || !s.row.user_id) {
    json(res, 401, { error: 'Debes iniciar sesión.' });
    return null;
  }
  return s;
}
function requireAdmin(req, res) {
  const s = requireAuth(req, res);
  if (!s) return null;
  if (s.row.role !== 'admin') {
    json(res, 403, { error: 'Acceso reservado al administrador.' });
    return null;
  }
  return s;
}
function requireCsrf(req, res, session) {
  const provided = String(req.headers['x-csrf-token'] || '');
  const expected = String(session?.row?.csrf_token || '');
  if (!provided || !expected || provided.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
    json(res, 403, { error: 'Solicitud rechazada por protección CSRF. Recarga la aplicación.' });
    return false;
  }
  return true;
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('too_large'), { code: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('invalid_json'), { code: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function ecoLevel(points) {
  if (points >= 1000) return { name: 'Embajador Verde', code: 'EV', nextAt: null };
  if (points >= 500) return { name: 'Conductor Verde', code: 'CV', nextAt: 1000 };
  if (points >= 250) return { name: 'Ruta Verde', code: 'RV', nextAt: 500 };
  if (points >= 100) return { name: 'Brote', code: 'BR', nextAt: 250 };
  return { name: 'Semilla', code: 'SE', nextAt: 100 };
}
function ecoBadges({ completedTrips, driverTrips, sharedSeats, companions }) {
  return [
    { id: 'first-trip', code: 'P1', name: 'Primer viaje', description: 'Completa tu primer viaje compartido.', unlocked: completedTrips >= 1 },
    { id: 'active-rider', code: 'RA', name: 'Rodador activo', description: 'Completa 5 viajes compartidos.', unlocked: completedTrips >= 5 },
    { id: 'green-impact', code: 'IV', name: 'Impacto verde', description: 'Comparte 10 lugares acumulados.', unlocked: sharedSeats >= 10 },
    { id: 'frequent-driver', code: 'CF', name: 'Conductor frecuente', description: 'Completa 5 viajes como conductor.', unlocked: driverTrips >= 5 },
    { id: 'community', code: 'IC', name: 'Impulso comunitario', description: 'Transporta a 20 compañeros.', unlocked: companions >= 20 }
  ];
}
function ecoStatsForUser(userId) {
  const driver = db.prepare(`SELECT COUNT(*) AS trips,
    COALESCE(SUM((SELECT COALESCE(SUM(rs.seats),0) FROM reservations rs WHERE rs.ride_id=r.id AND rs.status='confirmed')),0) AS companions,
    COALESCE(SUM(r.contribution_cents * (SELECT COALESCE(SUM(rs.seats),0) FROM reservations rs WHERE rs.ride_id=r.id AND rs.status='confirmed')),0) AS contribution_cents
    FROM rides r WHERE r.driver_id=? AND r.status='completed'`).get(userId);
  const passenger = db.prepare(`SELECT COUNT(DISTINCT r.id) AS trips,
    COALESCE(SUM(rs.seats),0) AS seats,
    COALESCE(SUM(r.contribution_cents * rs.seats),0) AS contribution_cents
    FROM reservations rs JOIN rides r ON r.id=rs.ride_id
    WHERE rs.passenger_id=? AND rs.status='confirmed' AND r.status='completed'`).get(userId);
  const driverTrips = Number(driver.trips || 0);
  const passengerTrips = Number(passenger.trips || 0);
  const companions = Number(driver.companions || 0);
  const passengerSeats = Number(passenger.seats || 0);
  const sharedSeats = companions + passengerSeats;
  const completedTrips = driverTrips + passengerTrips;
  const ecoPoints = completedTrips * 50 + sharedSeats * 15 + companions * 10;
  const level = ecoLevel(ecoPoints);
  const contributionCents = Number(driver.contribution_cents || 0) + Number(passenger.contribution_cents || 0);
  return {
    completedTrips,
    driverTrips,
    passengerTrips,
    sharedSeats,
    companions,
    contribution: contributionCents / 100,
    co2Kg: Number((sharedSeats * ECO_CO2_KG_PER_SHARED_SEAT).toFixed(1)),
    ecoPoints,
    level,
    badges: ecoBadges({ completedTrips, driverTrips, sharedSeats, companions }),
    methodology: `Estimación académica con factor configurable de ${ECO_CO2_KG_PER_SHARED_SEAT.toFixed(1)} kg CO₂e por plaza compartida finalizada.`
  };
}
function communityEcoStats() {
  const row = db.prepare(`SELECT COUNT(DISTINCT r.id) AS completed_trips,
    COUNT(DISTINCT r.driver_id) AS drivers,
    COALESCE(SUM(rs.seats),0) AS shared_seats,
    COALESCE(SUM(r.contribution_cents * rs.seats),0) AS contribution_cents,
    COUNT(DISTINCT rs.passenger_id) AS passengers
    FROM rides r LEFT JOIN reservations rs ON rs.ride_id=r.id AND rs.status='confirmed'
    WHERE r.status='completed'`).get();
  const sharedSeats = Number(row.shared_seats || 0);
  return {
    completedTrips: Number(row.completed_trips || 0),
    drivers: Number(row.drivers || 0),
    passengers: Number(row.passengers || 0),
    sharedSeats,
    co2Kg: Number((sharedSeats * ECO_CO2_KG_PER_SHARED_SEAT).toFixed(1)),
    contribution: Number(row.contribution_cents || 0) / 100,
    methodology: `Factor pedagógico: ${ECO_CO2_KG_PER_SHARED_SEAT.toFixed(1)} kg CO₂e por plaza compartida finalizada.`
  };
}

function routeRowToPublic(r) {
  return {
    id: r.id,
    origin: r.origin,
    destination: r.destination,
    pickupPoint: r.pickup_point,
    departureAt: r.departure_at,
    seatsTotal: r.seats_total,
    seatsAvailable: Number(r.seats_available),
    contribution: r.contribution_cents / 100,
    vehicle: r.vehicle,
    color: r.color,
    plateLast4: r.plate_last4,
    notes: r.notes,
    connectionMode: r.connection_mode,
    connectionHub: r.connection_hub,
    parkingEligible: !!r.parking_eligible,
    parkingCode: r.parking_code || '',
    parkingGeneratedAt: r.parking_generated_at || null,
    status: r.status,
    driver: {
      id: r.driver_id,
      name: r.driver_name,
      emailMasked: maskEmail(r.driver_email),
      verified: !!r.driver_verified
    },
    createdAt: r.created_at
  };
}
function listRides(where = '', params = []) {
  return db.prepare(`SELECT r.*, u.name AS driver_name, u.email AS driver_email, u.verified AS driver_verified,
    (r.seats_total - COALESCE((SELECT SUM(rs.seats) FROM reservations rs WHERE rs.ride_id = r.id AND rs.status='confirmed'),0)) AS seats_available
    FROM rides r JOIN users u ON u.id = r.driver_id
    ${where} ORDER BY r.departure_at ASC`).all(...params).map(routeRowToPublic);
}

async function handleApi(req, res, url, ip) {
  if (req.method === 'GET' && url.pathname === '/api/health') {
    return json(res, 200, { ok: true, time: nowIso(), version: APP_VERSION });
  }

  if (req.method === 'GET' && url.pathname === '/api/session') {
    const s = ensureSession(req, res);
    let user = null;
    if (s.row.user_id) {
      user = publicUser({ id: s.row.user_id, name: s.row.name, student_id: s.row.student_id, email: s.row.email, verified: s.row.verified, role: s.row.role, created_at: s.row.user_created_at });
    }
    return json(res, 200, { user, csrfToken: s.row.csrf_token, allowedEmailDomain: ALLOWED_EMAIL_DOMAIN, adminEmail: ADMIN_EMAIL });
  }

  if (req.method === 'GET' && url.pathname === '/api/eco/community') {
    return json(res, 200, { eco: communityEcoStats() });
  }

  if (req.method === 'GET' && url.pathname === '/api/eco/me') {
    const s = requireAuth(req, res); if (!s) return;
    return json(res, 200, { eco: ecoStatsForUser(s.row.user_id) });
  }

  if (req.method === 'POST' && url.pathname === '/api/register') {
    if (!rateLimit(ip, 'register', 8, 15 * 60 * 1000)) return json(res, 429, { error: 'Demasiados intentos. Intenta más tarde.' });
    const s = ensureSession(req, res); if (!requireCsrf(req, res, s)) return;
    const b = await readBody(req);
    const name = cleanText(b.name, 80);
    const studentId = cleanText(b.studentId, 24).toUpperCase();
    const email = normalizeEmail(b.email);
    const password = String(b.password || '');
    if (name.length < 3) return json(res, 400, { error: 'Escribe tu nombre completo.' });
    if (!isValidStudentId(studentId)) return json(res, 400, { error: 'La matrícula debe tener entre 4 y 24 caracteres.' });
    if (!isValidEmail(email) || !isAllowedEmail(email)) return json(res, 400, { error: `Usa un correo institucional @${ALLOWED_EMAIL_DOMAIN}.` });
    if (password.length < 10 || password.length > 128 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) return json(res, 400, { error: 'La contraseña debe tener al menos 10 caracteres, mayúscula, minúscula y número.' });
    try {
      const info = db.prepare(`INSERT INTO users (name, student_id, email, password_hash, verified, role, created_at)
                               VALUES (?, ?, ?, ?, 1, 'user', ?)`)
        .run(name, studentId, email, hashPassword(password), nowIso());
      const fresh = rotateSession(res, s, Number(info.lastInsertRowid));
      return json(res, 201, { user: publicUser({ id: Number(info.lastInsertRowid), name, student_id: studentId, email, verified: 1, role: 'user', created_at: nowIso() }), csrfToken: fresh.csrf });
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) return json(res, 409, { error: 'La matrícula o el correo ya están registrados.' });
      throw e;
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/login') {
    if (!rateLimit(ip, 'login', 12, 15 * 60 * 1000)) return json(res, 429, { error: 'Demasiados intentos de inicio de sesión. Intenta más tarde.' });
    const s = ensureSession(req, res); if (!requireCsrf(req, res, s)) return;
    const b = await readBody(req);
    const email = normalizeEmail(b.email);
    const password = String(b.password || '');
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !verifyPassword(password, user.password_hash)) return json(res, 401, { error: 'Correo o contraseña incorrectos.' });
    const fresh = rotateSession(res, s, user.id);
    return json(res, 200, { user: publicUser(user), csrfToken: fresh.csrf });
  }

  if (req.method === 'POST' && url.pathname === '/api/logout') {
    const s = requireAuth(req, res); if (!s) return; if (!requireCsrf(req, res, s)) return;
    db.prepare('DELETE FROM sessions WHERE id = ?').run(s.row.id);
    const secure = NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `rodando_session=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0${secure}`);
    return json(res, 200, { ok: true });
  }

  if (req.method === 'GET' && url.pathname === '/api/rides') {
    const origin = cleanText(url.searchParams.get('origin') || '', 60);
    const hub = cleanText(url.searchParams.get('hub') || '', 60);
    const mode = cleanText(url.searchParams.get('mode') || '', 10);
    const seats = parsePositiveInt(url.searchParams.get('seats') || 1, 1, 4) || 1;
    const date = cleanText(url.searchParams.get('date') || '', 10);
    const from = cleanText(url.searchParams.get('from') || '', 40);
    const to = cleanText(url.searchParams.get('to') || '', 40);
    const conditions = ["r.status='active'", 'r.departure_at >= ?'];
    const params = [new Date(Date.now() - 5 * 60 * 1000).toISOString()];
    if (origin) { conditions.push('LOWER(r.origin) LIKE LOWER(?)'); params.push(`%${origin}%`); }
    if (hub) { conditions.push('LOWER(r.connection_hub) LIKE LOWER(?)'); params.push(`%${hub}%`); }
    if (mode === 'hub' || mode === 'direct') { conditions.push('r.connection_mode=?'); params.push(mode); }
    if (from && to && !Number.isNaN(new Date(from).getTime()) && !Number.isNaN(new Date(to).getTime())) {
      conditions.push('r.departure_at >= ? AND r.departure_at < ?');
      params.push(new Date(from).toISOString(), new Date(to).toISOString());
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      conditions.push('substr(r.departure_at,1,10)=?');
      params.push(date);
    }
    conditions.push(`(r.seats_total - COALESCE((SELECT SUM(rs.seats) FROM reservations rs WHERE rs.ride_id=r.id AND rs.status='confirmed'),0)) >= ?`);
    params.push(seats);
    return json(res, 200, { rides: listRides('WHERE ' + conditions.join(' AND '), params) });
  }

  if (req.method === 'POST' && url.pathname === '/api/rides') {
    const s = requireAuth(req, res); if (!s) return; if (!requireCsrf(req, res, s)) return;
    if (!rateLimit(ip, 'publish', 20, 60 * 60 * 1000)) return json(res, 429, { error: 'Límite de publicaciones alcanzado temporalmente.' });
    const b = await readBody(req);
    const origin = cleanText(b.origin, 60);
    const pickupPoint = cleanText(b.pickupPoint, 120);
    const departureAt = safeDateTime(b.departureAt);
    const seatsTotal = parsePositiveInt(b.seatsTotal, 1, 6);
    const contribution = parseMoneyToCents(b.contribution);
    const vehicle = cleanText(b.vehicle, 60);
    const color = cleanText(b.color, 30);
    const plateLast4 = cleanText(b.plateLast4, 4).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const notes = cleanText(b.notes, 240);
    const connectionMode = cleanText(b.connectionMode || 'direct', 10) === 'hub' ? 'hub' : 'direct';
    const connectionHub = cleanText(b.connectionHub || '', 80);
    const parkingEligible = b.parkingEligible ? 1 : 0;
    if (origin.length < 2 || pickupPoint.length < 4 || !departureAt || !seatsTotal || contribution === null || vehicle.length < 3 || color.length < 3 || plateLast4.length < 3) {
      return json(res, 400, { error: 'Revisa los datos de la ruta. Hay campos incompletos o inválidos.' });
    }
    if (connectionMode === 'hub' && connectionHub.length < 3) {
      return json(res, 400, { error: 'Indica el punto de conexión o hub de abordaje.' });
    }
    const info = db.prepare(`INSERT INTO rides
      (driver_id, origin, destination, pickup_point, departure_at, seats_total, contribution_cents, vehicle, color, plate_last4, notes, connection_mode, connection_hub, parking_eligible, status, created_at)
      VALUES (?, ?, 'Universidad Tecnológica de Puebla', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`)
      .run(s.row.user_id, origin, pickupPoint, departureAt, seatsTotal, contribution, vehicle, color, plateLast4, notes, connectionMode, connectionMode === 'hub' ? connectionHub : '', parkingEligible, nowIso());
    return json(res, 201, { ride: listRides('WHERE r.id=?', [Number(info.lastInsertRowid)])[0] });
  }

  const completeRideMatch = url.pathname.match(/^\/api\/rides\/(\d+)\/complete$/);
  if (req.method === 'POST' && completeRideMatch) {
    const s = requireAuth(req, res); if (!s) return; if (!requireCsrf(req, res, s)) return;
    const rideId = Number(completeRideMatch[1]);
    try {
      db.exec('BEGIN IMMEDIATE');
      const ride = db.prepare(`SELECT r.*, COALESCE((SELECT SUM(rs.seats) FROM reservations rs WHERE rs.ride_id=r.id AND rs.status='confirmed'),0) AS confirmed_seats FROM rides r WHERE r.id=?`).get(rideId);
      if (!ride || ride.driver_id !== s.row.user_id) throw Object.assign(new Error('Solo el conductor puede finalizar este viaje.'), { status: 403 });
      if (ride.status !== 'active') throw Object.assign(new Error('Este viaje ya no está activo.'), { status: 409 });
      if (new Date(ride.departure_at).getTime() > Date.now()) throw Object.assign(new Error('Podrás finalizar el viaje después de la hora de salida.'), { status: 400 });
      if (Number(ride.confirmed_seats || 0) < 1) throw Object.assign(new Error('Debe existir al menos una reservación confirmada.'), { status: 400 });
      db.prepare("UPDATE rides SET status='completed' WHERE id=?").run(rideId);
      db.exec('COMMIT');
      return json(res, 200, { ok: true, eco: ecoStatsForUser(s.row.user_id), community: communityEcoStats() });
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch {}
      return json(res, e.status || 500, { error: e.status ? e.message : 'No se pudo finalizar el viaje.' });
    }
  }

  const parkingMatch = url.pathname.match(/^\/api\/rides\/(\d+)\/parking-pass$/);
  if (req.method === 'POST' && parkingMatch) {
    const s = requireAuth(req, res); if (!s) return; if (!requireCsrf(req, res, s)) return;
    const rideId = Number(parkingMatch[1]);
    try {
      db.exec('BEGIN IMMEDIATE');
      const ride = db.prepare(`SELECT r.*, COALESCE((SELECT SUM(rs.seats) FROM reservations rs WHERE rs.ride_id=r.id AND rs.status='confirmed'),0) AS confirmed_seats FROM rides r WHERE r.id=?`).get(rideId);
      if (!ride || ride.driver_id !== s.row.user_id) throw Object.assign(new Error('Solo el conductor puede generar el pase de estacionamiento.'), { status: 403 });
      if (!ride.parking_eligible) throw Object.assign(new Error('Esta ruta no fue marcada para Rodando Parking.'), { status: 400 });
      if (Number(ride.confirmed_seats || 0) < 2) throw Object.assign(new Error('Se requieren al menos dos lugares reservados para generar el pase colaborativo.'), { status: 400 });
      const code = ride.parking_code || `RUP-${ride.id}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
      const generatedAt = nowIso();
      db.prepare('UPDATE rides SET parking_code=?, parking_generated_at=? WHERE id=?').run(code, generatedAt, rideId);
      db.exec('COMMIT');
      return json(res, 200, { parkingPass: { code, generatedAt, rideId, origin: ride.origin, pickupPoint: ride.pickup_point, seatsConfirmed: Number(ride.confirmed_seats || 0) } });
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch {}
      return json(res, e.status || 500, { error: e.status ? e.message : 'No se pudo generar el pase de estacionamiento.' });
    }
  }

  const reserveMatch = url.pathname.match(/^\/api\/rides\/(\d+)\/reserve$/);
  if (req.method === 'POST' && reserveMatch) {
    const s = requireAuth(req, res); if (!s) return; if (!requireCsrf(req, res, s)) return;
    const rideId = Number(reserveMatch[1]);
    const b = await readBody(req);
    const seats = parsePositiveInt(b.seats, 1, 4);
    if (!seats) return json(res, 400, { error: 'Cantidad de lugares inválida.' });
    try {
      db.exec('BEGIN IMMEDIATE');
      const ride = db.prepare(`SELECT r.*, (r.seats_total - COALESCE((SELECT SUM(seats) FROM reservations WHERE ride_id=r.id AND status='confirmed'),0)) AS seats_available FROM rides r WHERE r.id=?`).get(rideId);
      if (!ride || ride.status !== 'active' || new Date(ride.departure_at) <= new Date()) throw Object.assign(new Error('Ruta no disponible.'), { status: 404 });
      if (ride.driver_id === s.row.user_id) throw Object.assign(new Error('No puedes reservar tu propia ruta.'), { status: 400 });
      if (Number(ride.seats_available || 0) < seats) throw Object.assign(new Error('Ya no hay suficientes lugares disponibles.'), { status: 409 });
      const existing = db.prepare('SELECT * FROM reservations WHERE ride_id=? AND passenger_id=?').get(rideId, s.row.user_id);
      if (existing && existing.status === 'confirmed') throw Object.assign(new Error('Ya tienes una reserva en esta ruta.'), { status: 409 });
      if (existing) db.prepare("UPDATE reservations SET seats=?, status='confirmed', created_at=? WHERE id=?").run(seats, nowIso(), existing.id);
      else db.prepare("INSERT INTO reservations (ride_id, passenger_id, seats, status, created_at) VALUES (?, ?, ?, 'confirmed', ?)").run(rideId, s.row.user_id, seats, nowIso());
      db.exec('COMMIT');
      return json(res, 201, { ok: true, ride: listRides('WHERE r.id=?', [rideId])[0] });
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch {}
      return json(res, e.status || 500, { error: e.status ? e.message : 'No se pudo completar la reserva.' });
    }
  }

  if (req.method === 'DELETE' && reserveMatch) {
    const s = requireAuth(req, res); if (!s) return; if (!requireCsrf(req, res, s)) return;
    const rideId = Number(reserveMatch[1]);
    const result = db.prepare("UPDATE reservations SET status='cancelled' WHERE ride_id=? AND passenger_id=? AND status='confirmed'").run(rideId, s.row.user_id);
    if (!result.changes) return json(res, 404, { error: 'No existe una reserva activa para cancelar.' });
    return json(res, 200, { ok: true });
  }

  const cancelRideMatch = url.pathname.match(/^\/api\/rides\/(\d+)$/);
  if (req.method === 'DELETE' && cancelRideMatch) {
    const s = requireAuth(req, res); if (!s) return; if (!requireCsrf(req, res, s)) return;
    const rideId = Number(cancelRideMatch[1]);
    const result = db.prepare("UPDATE rides SET status='cancelled' WHERE id=? AND driver_id=? AND status='active'").run(rideId, s.row.user_id);
    if (!result.changes) return json(res, 404, { error: 'Ruta no encontrada o ya no está activa.' });
    return json(res, 200, { ok: true });
  }

  if (req.method === 'GET' && url.pathname === '/api/dashboard') {
    const s = requireAuth(req, res); if (!s) return;
    const published = listRides('WHERE r.driver_id=?', [s.row.user_id]);
    for (const ride of published) {
      ride.passengers = db.prepare(`SELECT u.name, u.email, rs.seats, rs.status FROM reservations rs JOIN users u ON u.id=rs.passenger_id WHERE rs.ride_id=? AND rs.status='confirmed' ORDER BY rs.created_at`).all(ride.id);
      ride.confirmedSeats = ride.passengers.reduce((sum, item) => sum + Number(item.seats || 0), 0);
    }
    const reservations = db.prepare(`SELECT rs.id AS reservation_id, rs.seats AS reserved_seats, rs.status AS reservation_status,
      r.*, u.name AS driver_name, u.email AS driver_email, u.verified AS driver_verified,
      (r.seats_total - COALESCE((SELECT SUM(x.seats) FROM reservations x WHERE x.ride_id=r.id AND x.status='confirmed'),0)) AS seats_available
      FROM reservations rs JOIN rides r ON r.id=rs.ride_id JOIN users u ON u.id=r.driver_id
      WHERE rs.passenger_id=? ORDER BY r.departure_at ASC`).all(s.row.user_id)
      .map(r => ({ reservationId: r.reservation_id, reservedSeats: r.reserved_seats, reservationStatus: r.reservation_status, driverContact: r.driver_email, ride: routeRowToPublic(r) }));
    return json(res, 200, { published, reservations, eco: ecoStatsForUser(s.row.user_id) });
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/overview') {
    const s = requireAdmin(req, res); if (!s) return;
    const totals = {
      users: db.prepare("SELECT COUNT(*) AS c FROM users WHERE role='user'").get().c,
      admins: db.prepare("SELECT COUNT(*) AS c FROM users WHERE role='admin'").get().c,
      rides: db.prepare('SELECT COUNT(*) AS c FROM rides').get().c,
      activeRides: db.prepare("SELECT COUNT(*) AS c FROM rides WHERE status='active'").get().c,
      reservations: db.prepare("SELECT COUNT(*) AS c FROM reservations WHERE status='confirmed'").get().c,
      hubRides: db.prepare("SELECT COUNT(*) AS c FROM rides WHERE connection_mode='hub'").get().c,
      parkingEligible: db.prepare('SELECT COUNT(*) AS c FROM rides WHERE parking_eligible=1').get().c
    };
    return json(res, 200, { totals, community: communityEcoStats() });
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/users') {
    const s = requireAdmin(req, res); if (!s) return;
    const users = db.prepare(`SELECT u.id, u.name, u.student_id, u.email, u.verified, u.role, u.created_at,
      COUNT(DISTINCT r.id) AS published_rides,
      COUNT(DISTINCT rs.id) AS reservations_count
      FROM users u
      LEFT JOIN rides r ON r.driver_id=u.id
      LEFT JOIN reservations rs ON rs.passenger_id=u.id AND rs.status='confirmed'
      GROUP BY u.id ORDER BY u.created_at DESC`).all().map(row => ({
        id: row.id,
        name: row.name,
        studentId: row.student_id,
        email: row.email,
        verified: !!row.verified,
        role: row.role,
        createdAt: row.created_at,
        publishedRides: Number(row.published_rides || 0),
        reservations: Number(row.reservations_count || 0)
      }));
    return json(res, 200, { users });
  }

  const adminUserMatch = url.pathname.match(/^\/api\/admin\/users\/(\d+)$/);
  if (req.method === 'PATCH' && adminUserMatch) {
    const s = requireAdmin(req, res); if (!s) return; if (!requireCsrf(req, res, s)) return;
    const targetId = Number(adminUserMatch[1]);
    const body = await readBody(req);
    const target = db.prepare('SELECT * FROM users WHERE id=?').get(targetId);
    if (!target) return json(res, 404, { error: 'Usuario no encontrado.' });
    const role = body.role === 'admin' ? 'admin' : 'user';
    const verified = body.verified ? 1 : 0;
    db.prepare('UPDATE users SET role=?, verified=? WHERE id=?').run(role, verified, targetId);
    return json(res, 200, { ok: true });
  }

  if (req.method === 'DELETE' && adminUserMatch) {
    const s = requireAdmin(req, res); if (!s) return; if (!requireCsrf(req, res, s)) return;
    const targetId = Number(adminUserMatch[1]);
    if (targetId === s.row.user_id) return json(res, 400, { error: 'No puedes eliminar tu propia cuenta de administrador.' });
    const result = db.prepare('DELETE FROM users WHERE id=?').run(targetId);
    if (!result.changes) return json(res, 404, { error: 'Usuario no encontrado.' });
    return json(res, 200, { ok: true });
  }

  return json(res, 404, { error: 'Endpoint no encontrado.' });
}

function serveStatic(req, res, url) {
  let requested = decodeURIComponent(url.pathname);
  if (requested === '/') requested = '/index.html';
  const normalized = path.posix.normalize(requested).replace(/^\.\.(\/|\\)/g, '');
  const filePath = path.join(PUBLIC_ROOT, normalized);
  if (!filePath.startsWith(PUBLIC_ROOT)) { res.statusCode = 403; return res.end('Forbidden'); }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      const fallback = path.join(PUBLIC_ROOT, 'index.html');
      if (req.method === 'GET' && !path.extname(requested)) return fs.createReadStream(fallback).pipe(res);
      res.statusCode = 404; return res.end('Not found');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.setHeader('Content-Type', mime[ext] || 'application/octet-stream');
    if (['.html', '.js', '.css', '.webmanifest'].includes(ext)) res.setHeader('Cache-Control', 'no-cache');
    else res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  securityHeaders(res);
  const ip = String(req.socket.remoteAddress || 'unknown');
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url, ip);
    if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { error: 'Método no permitido.' });
    return serveStatic(req, res, url);
  } catch (e) {
    if (e?.code === 413) return json(res, 413, { error: 'Solicitud demasiado grande.' });
    if (e?.code === 400) return json(res, 400, { error: 'JSON inválido.' });
    console.error(e);
    return json(res, 500, { error: 'Error interno del servidor.' });
  }
});

server.listen(PORT, () => {
  console.log(`Rodando UTP listo en http://localhost:${PORT}`);
  console.log(`Base de datos: ${DB_PATH}`);
  console.log(`Administrador: ${ADMIN_EMAIL}`);
});
