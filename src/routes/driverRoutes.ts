import { Router } from "express";
import { Server } from "socket.io";

import { saveBusLocation } from "../database";
import { ActiveBusLocation } from "../types/activeBusLocation";
import {
  isValidLocationPayload,
  normalizeLocationPayload,
} from "../utils/locationPayload";
import { normalizeBusId } from "../utils/busId";
import { logger } from "../utils/logger";
import { liveBusStore } from "../services/liveBusStore";
import {
  broadcastLatestLocations,
  removeBusFromLiveMap,
} from "../services/liveBusEvents";

export function createDriverRoutes(io: Server) {
  const router = Router();

  router.post("/api/driver/location-update", (req, res) => {
    if (!isValidLocationPayload(req.body)) {
      res.status(400).json({
        status: "error",
        message: "Invalid location payload",
      });
      return;
    }

    const payload = normalizeLocationPayload(req.body);

    const activeLocation: ActiveBusLocation = {
      ...payload,
      socketId: "http-background",
      lastSeen: Date.now(),
    };

    liveBusStore.upsert(activeLocation);
    saveBusLocation(payload);

    logger.debug("HTTP", "Location received and saved", {
      busId: payload.busId,
      latitude: payload.latitude,
      longitude: payload.longitude,
    });

    io.emit("bus:location-updated", activeLocation);
    broadcastLatestLocations(io);

    res.json({
      status: "ok",
      busId: payload.busId,
    });
  });

  router.post("/api/driver/stop-sharing", (req, res) => {
    const busId = normalizeBusId(req.body?.busId);

    if (!busId) {
      res.status(400).json({
        status: "error",
        message: "busId is required",
      });
      return;
    }

    removeBusFromLiveMap(io, busId, "http-driver-stopped-sharing");

    logger.info("HTTP", "Driver stopped sharing", {
      busId,
    });

    res.json({
      status: "ok",
      busId,
    });
  });

  return router;
}
