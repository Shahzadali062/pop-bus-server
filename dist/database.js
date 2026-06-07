"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.database = void 0;
exports.saveBusLocation = saveBusLocation;
exports.getBusLocationHistory = getBusLocationHistory;
exports.getTotalLocationCount = getTotalLocationCount;
exports.clearBusLocationDatabase = clearBusLocationDatabase;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const node_sqlite_1 = require("node:sqlite");
const dataDir = path_1.default.join(process.cwd(), "data");
if (!fs_1.default.existsSync(dataDir)) {
    fs_1.default.mkdirSync(dataDir);
}
const databasePath = path_1.default.join(dataDir, "pop-bus.sqlite");
exports.database = new node_sqlite_1.DatabaseSync(databasePath);
exports.database.exec(`
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
function saveBusLocation(payload) {
    const statement = exports.database.prepare(`
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
    statement.run(payload.busId, payload.latitude, payload.longitude, payload.accuracy, payload.speed, payload.heading, payload.timestamp);
}
function getBusLocationHistory(busId, limit = 50) {
    const statement = exports.database.prepare(`
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
function getTotalLocationCount() {
    const statement = exports.database.prepare(`
    SELECT COUNT(*) as total FROM bus_locations
  `);
    return statement.get();
}
function clearBusLocationDatabase() {
    exports.database.exec(`
    DELETE FROM bus_locations;
    DELETE FROM sqlite_sequence WHERE name='bus_locations';
  `);
}
