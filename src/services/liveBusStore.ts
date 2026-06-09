import { ActiveBusLocation, PublicBusLocation } from "../types/activeBusLocation";

let latestLocations: Record<string, ActiveBusLocation> = {};

export const liveBusStore = {
  getAll() {
    return latestLocations;
  },

  getPublicAll(): PublicBusLocation[] {
    return Object.values(latestLocations).map((bus) => ({
      busId: bus.busId,
      latitude: bus.latitude,
      longitude: bus.longitude,
      accuracy: bus.accuracy,
      speed: bus.speed,
      heading: bus.heading,
      timestamp: bus.timestamp,
      lastSeen: bus.lastSeen,
    }));
  },

  getIds() {
    return Object.keys(latestLocations);
  },

  count() {
    return Object.keys(latestLocations).length;
  },

  upsert(location: ActiveBusLocation) {
    latestLocations[location.busId] = location;
  },

  remove(busId: string) {
    if (!latestLocations[busId]) {
      return false;
    }

    delete latestLocations[busId];
    return true;
  },

  clear() {
    latestLocations = {};
  },
};
