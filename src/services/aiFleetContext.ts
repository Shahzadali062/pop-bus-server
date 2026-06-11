import { liveBusStore } from "./liveBusStore";
import { createAiQueryPlan } from "./aiQueryPlanner";
import { reverseGeocode } from "./reverseGeocoder";

import {
  getBusHistoryForAi,
  getDatabaseSummaryForAi,
  getKnownBusIdsForAi,
  getLatestSavedLocationsForAi,
  getRecentAiConversations,
  getRecentBusEventsForAi,
  getRecentTelemetryForAi,
  getRecentTripsForAi,
  getRegisteredBusesForAi,
  getRoutesForAi,
} from "../repositories/fleetReadRepository";

const BUS_DATA_URL =
  process.env.BUS_DATA_URL ||
  "https://pop-bus-server.onrender.com/api/buses/latest";

type LocationRecord = {
  busId?: string;
  latitude?: number;
  longitude?: number;
  speed?: number | null;
  accuracy?: number | null;
  timestamp?: number;
  lastSeen?: number;
  [key: string]: unknown;
};

async function getActiveBuses(): Promise<LocationRecord[]> {
  try {
    const response = await fetch(BUS_DATA_URL);

    if (!response.ok) {
      throw new Error(`Bus API returned ${response.status}`);
    }

    const payload = (await response.json()) as {
      buses?: LocationRecord[];
      data?: LocationRecord[];
    };

    if (Array.isArray(payload.buses)) {
      return payload.buses;
    }

    if (Array.isArray(payload.data)) {
      return payload.data;
    }

    return [];
  } catch {
    return liveBusStore.getPublicAll();
  }
}

async function addPlaceNames(records: unknown[]) {
  const enriched = [];

  for (const rawRecord of records.slice(0, 10)) {
    const record = rawRecord as LocationRecord;
    const latitude = Number(record.latitude);
    const longitude = Number(record.longitude);

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      enriched.push(record);
      continue;
    }

    const place = await reverseGeocode(latitude, longitude);

    enriched.push({
      ...record,
      placeName: place?.placeName || "Place name unavailable",
      fullAddress: place?.fullAddress || null,
      speedKmh:
        typeof record.speed === "number"
          ? Number((record.speed * 3.6).toFixed(1))
          : null,
      updatedSecondsAgo: Math.max(
        0,
        Math.floor(
          (Date.now() -
            Number(record.lastSeen || record.timestamp || Date.now())) /
            1000
        )
      ),
    });
  }

  return enriched;
}

export async function buildAiFleetContext(question: string) {
  const plan = await createAiQueryPlan(question);

  const context: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
  };

  if (plan.needsActiveBuses) {
    const activeBuses = await getActiveBuses();

    context.activeBuses = plan.needsPlaceNames
      ? await addPlaceNames(activeBuses)
      : activeBuses;
  }

  if (plan.needsLatestSavedLocations) {
    const locations = getLatestSavedLocationsForAi(50);

    context.latestSavedLocations = plan.needsPlaceNames
      ? await addPlaceNames(locations)
      : locations;
  }

  if (plan.needsBusHistory) {
    if (plan.busId) {
      const history = getBusHistoryForAi(
        plan.busId,
        plan.historyLimit
      );

      context.requestedBusId = plan.busId;
      context.busHistory = plan.needsPlaceNames
        ? await addPlaceNames(history)
        : history;
    } else {
      context.busHistoryError =
        "A specific bus ID was not detected in the question.";

      context.knownBusIds = getKnownBusIdsForAi();
    }
  }

  if (plan.needsDatabaseSummary) {
    context.databaseSummary = getDatabaseSummaryForAi();
  }

  if (plan.needsRegisteredBuses) {
    context.registeredBuses = getRegisteredBusesForAi();
  }

  if (plan.needsRoutes) {
    context.routes = getRoutesForAi();
  }

  if (plan.needsTrips) {
    context.recentTrips = getRecentTripsForAi(100);
  }

  if (plan.needsEvents) {
    context.recentEvents = getRecentBusEventsForAi(100);
  }

  if (plan.needsTelemetry) {
    context.recentTelemetry = getRecentTelemetryForAi(100);
  }

  if (plan.needsPreviousConversations) {
    context.previousConversations =
      getRecentAiConversations(10);
  }

  return {
    plan,
    context,
  };
}

