CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  student_id TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  token_hash TEXT NOT NULL UNIQUE,
  csrf_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE rides (
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

CREATE TABLE reservations (
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
