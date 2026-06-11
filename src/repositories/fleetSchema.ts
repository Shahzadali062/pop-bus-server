import { database } from "./busLocationRepository";

database.exec(`
  CREATE TABLE IF NOT EXISTS buses (
    bus_id TEXT PRIMARY KEY,
    display_name TEXT,
    capacity INTEGER,
    current_status TEXT NOT NULL DEFAULT 'available',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS routes (
    route_id TEXT PRIMARY KEY,
    route_name TEXT NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS route_stops (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    route_id TEXT NOT NULL,
    stop_order INTEGER NOT NULL,
    stop_name TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    FOREIGN KEY (route_id) REFERENCES routes(route_id)
  );

  CREATE TABLE IF NOT EXISTS trips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bus_id TEXT NOT NULL,
    route_id TEXT,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    distance_meters REAL DEFAULT 0,
    average_speed_kmh REAL,
    maximum_speed_kmh REAL
  );

  CREATE TABLE IF NOT EXISTS bus_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bus_id TEXT NOT NULL,
    trip_id INTEGER,
    event_type TEXT NOT NULL,
    message TEXT,
    latitude REAL,
    longitude REAL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS bus_telemetry (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bus_id TEXT NOT NULL,
    battery_level INTEGER,
    network_type TEXT,
    gps_accuracy REAL,
    app_state TEXT,
    location_source TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS ai_chat_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    model TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_trips_bus_id
  ON trips (bus_id, id DESC);

  CREATE INDEX IF NOT EXISTS idx_events_bus_id
  ON bus_events (bus_id, id DESC);

  CREATE INDEX IF NOT EXISTS idx_telemetry_bus_id
  ON bus_telemetry (bus_id, id DESC);
`);
