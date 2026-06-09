import { Server } from "socket.io";

import { liveBusStore } from "./liveBusStore";
import { normalizeBusId } from "../utils/busId";
import { logger } from "../utils/logger";

export function broadcastLatestLocations(io: Server) {
  io.emit("server:latest-locations", liveBusStore.getPublicAll());
}

export function removeBusFromLiveMap(
  io: Server,
  busId: string,
  reason: string
) {
  const cleanBusId = normalizeBusId(busId);

  const removed = liveBusStore.remove(cleanBusId);

  if (!removed) {
    return false;
  }

  logger.info("LIVE_MAP", "Bus removed", {
    busId: cleanBusId,
    reason,
  });

  io.emit("bus:removed", {
    busId: cleanBusId,
    reason,
  });

  broadcastLatestLocations(io);

  return true;
}

export function clearAllLiveBuses(io: Server, reason: string) {
  const busIds = liveBusStore.getIds();

  busIds.forEach((busId) => {
    io.emit("bus:removed", {
      busId,
      reason,
    });
  });

  liveBusStore.clear();
  broadcastLatestLocations(io);

  return busIds.length;
}
