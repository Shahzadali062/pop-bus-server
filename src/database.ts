import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import { BusLocationPayload } from "./types/busLocation";

const dataDir = path.join(process.cwd(), "data");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

const databasePath = path.join(dataDir, "pop-bus.sqlite");

export const database = new DatabaseSync(databasePath);

database.exec(`
  CREATE TABLE IF NOT EXISTS bus_locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bus_id TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    accuracy REAL,
    speed REAL,
    heading REAL,
    device_timestamp INTEGER NOT NULL,
    received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

export function saveBusLocation(payload: BusLocationPayload) {
  const statement = database.prepare(`
    INSERT INTO bus_locations (
      bus_id,
      latitude,
      longitude,
      accuracy,
      speed,
      heading,
      device_timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  statement.run(
    payload.busId,
    payload.latitude,
    payload.longitude,
    payload.accuracy,
    payload.speed,
    payload.heading,
    payload.timestamp
  );
}

export function getBusLocationHistory(busId: string, limit = 50) {
  const statement = database.prepare(`
    SELECT
      id,
      bus_id as busId,
      latitude,
      longitude,
      accuracy,
      speed,
      heading,
      device_timestamp as timestamp,
      received_at as receivedAt
    FROM bus_locations
    WHERE bus_id = ?
    ORDER BY id DESC
    LIMIT ?
  `);

  return statement.all(busId, limit);
}

export function getTotalLocationCount() {
  const statement = database.prepare(`
    SELECT COUNT(*) as total FROM bus_locations
  `);

  return statement.get();
}
