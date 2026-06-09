import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";

import { BusLocationPayload } from "../types/busLocation";
import { normalizeBusId } from "../utils/busId";
import { logger } from "../utils/logger";

const dataDir = path.join(process.cwd(), "data");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const databasePath = path.join(dataDir, "pop-bus.sqlite");

export const database = new DatabaseSync(databasePath);

database.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;

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

  CREATE INDEX IF NOT EXISTS idx_bus_locations_bus_id_id
  ON bus_locations (bus_id, id DESC);
`);

const insertLocationStatement = database.prepare(`
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

const getHistoryStatement = database.prepare(`
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

const getTotalCountStatement = database.prepare(`
  SELECT COUNT(*) as total FROM bus_locations
`);

export function saveBusLocation(payload: BusLocationPayload) {
  const busId = normalizeBusId(payload.busId);

  if (!busId) {
    logger.warn("DATABASE", "Skipped saving location without busId");
    return;
  }

  insertLocationStatement.run(
    busId,
    payload.latitude,
    payload.longitude,
    payload.accuracy,
    payload.speed,
    payload.heading,
    payload.timestamp || Date.now()
  );
}

export function getBusLocationHistory(busId: string, limit = 50) {
  const cleanBusId = normalizeBusId(busId);
  const safeLimit = Number.isFinite(limit)
    ? Math.min(Math.max(Math.floor(limit), 1), 500)
    : 50;

  return getHistoryStatement.all(cleanBusId, safeLimit);
}

export function getTotalLocationCount() {
  return getTotalCountStatement.get();
}

export function clearBusLocationDatabase() {
  database.exec(`
    DELETE FROM bus_locations;
    DELETE FROM sqlite_sequence WHERE name='bus_locations';
  `);
}
