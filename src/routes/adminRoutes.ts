import { Request, Router } from "express";
import { Server } from "socket.io";

import {
  clearBusLocationDatabase,
  getTotalLocationCount,
} from "../database";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { clearAllLiveBuses } from "../services/liveBusEvents";
import { liveBusStore } from "../services/liveBusStore";

function isAdminAuthorized(req: Request) {
  const tokenFromQuery = String(req.query.token || "");
  const tokenFromHeader = String(req.headers["x-admin-token"] || "");

  return tokenFromQuery === env.adminToken || tokenFromHeader === env.adminToken;
}

function sendUnauthorized(res: any) {
  res.status(401).json({
    status: "error",
    message: "Unauthorized",
  });
}

export function createAdminRoutes(io: Server) {
  const router = Router();

  router.get("/api/admin/clear", (req, res) => {
    if (!isAdminAuthorized(req)) {
      sendUnauthorized(res);
      return;
    }

    clearBusLocationDatabase();
    clearAllLiveBuses(io, "admin-clear");

    logger.warn("ADMIN", "Database and live bus locations cleared");

    res.json({
      status: "ok",
      message: "Database and live bus locations cleared",
      totalSavedLocations: getTotalLocationCount(),
      activeBuses: liveBusStore.count(),
    });
  });

  router.post("/api/admin/clear-buses", (req, res) => {
    if (!isAdminAuthorized(req)) {
      sendUnauthorized(res);
      return;
    }

    const cleared = clearAllLiveBuses(io, "admin-clear-live-buses");

    logger.warn("ADMIN", "All live buses cleared from dashboard", {
      cleared,
    });

    res.json({
      status: "ok",
      cleared,
    });
  });

  return router;
}
