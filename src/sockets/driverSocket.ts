import { Server, Socket } from "socket.io";

import { saveBusLocation } from "../database";
import { BusLocationPayload } from "../types/busLocation";
import { ActiveBusLocation } from "../types/activeBusLocation";
import {
  isValidLocationPayload,
  normalizeLocationPayload,
} from "../utils/locationPayload";
import { logger } from "../utils/logger";
import { liveBusStore } from "../services/liveBusStore";
import {
  broadcastLatestLocations,
  removeBusFromLiveMap,
} from "../services/liveBusEvents";

function addSocketBusId(socket: Socket, busId: string) {
  const currentBusIds: string[] = socket.data.busIds || [];

  if (!currentBusIds.includes(busId)) {
    socket.data.busIds = [...currentBusIds, busId];
  }
}

export function registerDriverSocketHandlers(io: Server) {
  io.on("connection", (socket) => {
    logger.info("SOCKET", "Client connected", {
      socketId: socket.id,
    });

    socket.data.busIds = [];

    socket.emit("server:latest-locations", liveBusStore.getPublicAll());

    socket.on("driver:location-update", (rawPayload: BusLocationPayload) => {
      if (!isValidLocationPayload(rawPayload)) {
        socket.emit("server:error", {
          message: "Invalid location payload",
        });
        return;
      }

      const payload = normalizeLocationPayload(rawPayload);

      addSocketBusId(socket, payload.busId);

      const activeLocation: ActiveBusLocation = {
        ...payload,
        socketId: socket.id,
        lastSeen: Date.now(),
      };

      liveBusStore.upsert(activeLocation);
      saveBusLocation(activeLocation);

      logger.debug("SOCKET", "Location received", {
        busId: payload.busId,
        socketId: socket.id,
      });

      io.emit("bus:location-updated", activeLocation);
      broadcastLatestLocations(io);
    });

    socket.on(
      "driver:stop-sharing",
      (
        payload: { busId: string },
        callback?: (response: { ok: boolean }) => void
      ) => {
        const busId = String(payload?.busId || "").trim().toUpperCase();

        if (busId) {
          removeBusFromLiveMap(io, busId, "driver-stopped-sharing");

          const currentBusIds: string[] = socket.data.busIds || [];
          socket.data.busIds = currentBusIds.filter((id) => id !== busId);
        }

        if (callback) {
          callback({ ok: true });
        }
      }
    );

    socket.on("disconnect", (reason) => {
        const busIds: string[] = socket.data.busIds || [];

        logger.info("SOCKET", "Client disconnected without removing buses", {
          socketId: socket.id,
          busIds,
          reason,
        });

        // IMPORTANT:
        // Do not remove buses on socket disconnect.
        // Mobile sockets disconnect when app is minimized, locked, or network changes.
        // Bus must be removed only when driver explicitly stops sharing or admin clears it.
      });
  });
}


