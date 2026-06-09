import { Router } from "express";

import {
  getBusLocationHistory,
  getTotalLocationCount,
} from "../database";
import { normalizeBusId } from "../utils/busId";
import { liveBusStore } from "../services/liveBusStore";

export function createPublicRoutes() {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json({
      message: "Pop Bus Server is running",
      status: "ok",
    });
  });

  router.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      serverTime: new Date().toISOString(),
      database: "connected",
      totalSavedLocations: getTotalLocationCount(),
      activeBuses: liveBusStore.count(),
      activeBusIds: liveBusStore.getIds(),
    });
  });

  router.get("/api/buses/latest", (_req, res) => {
    res.json({
      buses: liveBusStore.getPublicAll(),
    });
  });

  router.get("/api/buses/:busId/history", (req, res) => {
    const busId = normalizeBusId(req.params.busId);
    const rawLimit = Number(req.query.limit ?? 50);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(Math.max(rawLimit, 1), 500)
      : 50;

    const history = getBusLocationHistory(busId, limit);

    res.json({
      busId,
      count: history.length,
      history,
    });
  });

  return router;
}
