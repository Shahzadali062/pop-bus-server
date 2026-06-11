import { database } from "./busLocationRepository";
import { normalizeBusId } from "../utils/busId";

function safeLimit(value: number, maximum = 200) {
  if (!Number.isFinite(value)) return 50;
  return Math.min(Math.max(Math.floor(value), 1), maximum);
}

export function getRegisteredBusesForAi() {
  return database.prepare(`
    SELECT
      bus_id AS busId,
      display_name AS displayName,
      capacity,
      current_status AS currentStatus,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM buses
    ORDER BY bus_id ASC
  `).all();
}

export function getKnownBusIdsForAi() {
  return database.prepare(`
    SELECT DISTINCT busId
    FROM (
      SELECT bus_id AS busId FROM bus_locations
      UNION
      SELECT bus_id AS busId FROM buses
      UNION
      SELECT bus_id AS busId FROM trips
      UNION
      SELECT bus_id AS busId FROM bus_events
      UNION
      SELECT bus_id AS busId FROM bus_telemetry
    )
    WHERE busId IS NOT NULL AND TRIM(busId) <> ''
    ORDER BY busId ASC
  `).all();
}

export function getLatestSavedLocationsForAi(limit = 50) {
  return database.prepare(`
    SELECT
      location.id,
      location.bus_id AS busId,
      location.latitude,
      location.longitude,
      location.accuracy,
      location.speed,
      location.heading,
      location.device_timestamp AS timestamp,
      location.received_at AS receivedAt
    FROM bus_locations location
    INNER JOIN (
      SELECT bus_id, MAX(id) AS latestId
      FROM bus_locations
      GROUP BY bus_id
    ) latest
      ON location.id = latest.latestId
    ORDER BY location.id DESC
    LIMIT ?
  `).all(safeLimit(limit));
}

export function getBusHistoryForAi(busId: string, limit = 100) {
  const cleanBusId = normalizeBusId(busId);

  return database.prepare(`
    SELECT
      id,
      bus_id AS busId,
      latitude,
      longitude,
      accuracy,
      speed,
      heading,
      device_timestamp AS timestamp,
      received_at AS receivedAt
    FROM bus_locations
    WHERE bus_id = ?
    ORDER BY id DESC
    LIMIT ?
  `).all(cleanBusId, safeLimit(limit, 500));
}

export function getRoutesForAi() {
  const routes = database.prepare(`
    SELECT
      route_id AS routeId,
      route_name AS routeName,
      description,
      created_at AS createdAt
    FROM routes
    ORDER BY route_name ASC
  `).all() as Array<Record<string, unknown>>;

  const stopsStatement = database.prepare(`
    SELECT
      id,
      route_id AS routeId,
      stop_order AS stopOrder,
      stop_name AS stopName,
      latitude,
      longitude
    FROM route_stops
    WHERE route_id = ?
    ORDER BY stop_order ASC
  `);

  return routes.map((route) => ({
    ...route,
    stops: stopsStatement.all(String(route.routeId)),
  }));
}

export function getRecentTripsForAi(limit = 50) {
  return database.prepare(`
    SELECT
      id,
      bus_id AS busId,
      route_id AS routeId,
      started_at AS startedAt,
      ended_at AS endedAt,
      status,
      distance_meters AS distanceMeters,
      average_speed_kmh AS averageSpeedKmh,
      maximum_speed_kmh AS maximumSpeedKmh
    FROM trips
    ORDER BY id DESC
    LIMIT ?
  `).all(safeLimit(limit));
}

export function getRecentBusEventsForAi(limit = 50) {
  return database.prepare(`
    SELECT
      id,
      bus_id AS busId,
      trip_id AS tripId,
      event_type AS eventType,
      message,
      latitude,
      longitude,
      created_at AS createdAt
    FROM bus_events
    ORDER BY id DESC
    LIMIT ?
  `).all(safeLimit(limit));
}

export function getRecentTelemetryForAi(limit = 50) {
  return database.prepare(`
    SELECT
      id,
      bus_id AS busId,
      battery_level AS batteryLevel,
      network_type AS networkType,
      gps_accuracy AS gpsAccuracy,
      app_state AS appState,
      location_source AS locationSource,
      created_at AS createdAt
    FROM bus_telemetry
    ORDER BY id DESC
    LIMIT ?
  `).all(safeLimit(limit));
}

export function getDatabaseSummaryForAi() {
  return database.prepare(`
    SELECT
      (SELECT COUNT(*) FROM bus_locations) AS totalLocations,
      (SELECT COUNT(DISTINCT bus_id) FROM bus_locations) AS trackedBuses,
      (SELECT COUNT(*) FROM buses) AS registeredBuses,
      (SELECT COUNT(*) FROM routes) AS routes,
      (SELECT COUNT(*) FROM route_stops) AS routeStops,
      (SELECT COUNT(*) FROM trips) AS trips,
      (SELECT COUNT(*) FROM bus_events) AS events,
      (SELECT COUNT(*) FROM bus_telemetry) AS telemetryRecords
  `).get();
}

export function saveAiConversation(
  question: string,
  answer: string,
  model: string
) {
  database.prepare(`
    INSERT INTO ai_chat_history (
      question,
      answer,
      model
    ) VALUES (?, ?, ?)
  `).run(question, answer, model);
}

export function getRecentAiConversations(limit = 20) {
  return database.prepare(`
    SELECT
      id,
      question,
      answer,
      model,
      created_at AS createdAt
    FROM ai_chat_history
    ORDER BY id DESC
    LIMIT ?
  `).all(safeLimit(limit, 100));
}
