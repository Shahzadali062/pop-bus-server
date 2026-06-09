import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import { BusLocationPayload } from "./types/busLocation";
import {
  clearBusLocationDatabase,
  getBusLocationHistory,
  getTotalLocationCount,
  saveBusLocation,
} from "./database";

const app = express();
const server = http.createServer(app);

const PORT = Number(process.env.PORT) || 4000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "popbus123";

app.use(cors());
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

type ActiveBusLocation = BusLocationPayload & {
  socketId: string;
  lastSeen: number;
};

let latestLocations: Record<string, ActiveBusLocation> = {};

function getPublicBusLocations() {
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
}

function broadcastLatestLocations() {
  io.emit("server:latest-locations", getPublicBusLocations());
}

function removeBusFromLiveMap(busId: string, reason: string) {
  const cleanBusId = busId.trim().toUpperCase();

  if (!latestLocations[cleanBusId]) return;

  delete latestLocations[cleanBusId];

  console.log(`Bus removed: ${cleanBusId}. Reason: ${reason}`);

  io.emit("bus:removed", {
    busId: cleanBusId,
    reason,
  });

  broadcastLatestLocations();
}

function isValidLocationPayload(payload: BusLocationPayload) {
  return (
    typeof payload.busId === "string" &&
    payload.busId.trim().length > 0 &&
    typeof payload.latitude === "number" &&
    typeof payload.longitude === "number"
  );
}

function addSocketBusId(socket: any, busId: string) {
  const currentBusIds: string[] = socket.data.busIds || [];

  if (!currentBusIds.includes(busId)) {
    socket.data.busIds = [...currentBusIds, busId];
  }
}

app.get("/", (_req, res) => {
  res.json({
    message: "Pop Bus Server is running",
    status: "ok",
  });
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    serverTime: new Date().toISOString(),
    database: "connected",
    totalSavedLocations: getTotalLocationCount(),
    activeBuses: Object.keys(latestLocations).length,
    activeBusIds: Object.keys(latestLocations),
  });
});

app.get("/api/buses/latest", (_req, res) => {
  res.json({
    buses: getPublicBusLocations(),
  });
});

app.get("/api/buses/:busId/history", (req, res) => {
  const busId = req.params.busId;
  const limit = Number(req.query.limit ?? 50);

  const history = getBusLocationHistory(busId, limit);

  res.json({
    busId,
    count: history.length,
    history,
  });
});

app.get("/api/admin/clear", (req, res) => {
  const token = String(req.query.token || "");

  if (token !== ADMIN_TOKEN) {
    res.status(401).json({
      status: "error",
      message: "Unauthorized",
    });
    return;
  }

  clearBusLocationDatabase();
  latestLocations = {};

  io.emit("server:latest-locations", []);

  res.json({
    status: "ok",
    message: "Database and live bus locations cleared",
    totalSavedLocations: getTotalLocationCount(),
    activeBuses: 0,
  });
});


app.post("/api/driver/location-update", (req, res) => {
  const payload = req.body as BusLocationPayload;

  if (!payload.busId || !payload.latitude || !payload.longitude) {
    res.status(400).json({
      status: "error",
      message: "Invalid location payload",
    });
    return;
  }

  latestLocations[payload.busId] = {
    ...payload,
    socketId: "http-background",
    lastSeen: Date.now(),
  };
  saveBusLocation(payload);

  console.log("HTTP location received and saved:", payload);

  io.emit("bus:location-updated", payload);

  res.json({
    status: "ok",
    busId: payload.busId,
  });
});

app.post("/api/driver/stop-sharing", (req, res) => {
  const busId = String(req.body?.busId || "");

  if (!busId) {
    res.status(400).json({
      status: "error",
      message: "busId is required",
    });
    return;
  }

  delete latestLocations[busId];

  console.log("HTTP driver stopped sharing:", busId);

  io.emit("bus:removed", { busId });
  io.emit("server:latest-locations", Object.values(latestLocations));

  res.json({
    status: "ok",
    busId,
  });
});
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.data.busIds = [];

  socket.emit("server:latest-locations", getPublicBusLocations());

  socket.on("driver:location-update", (payload: BusLocationPayload) => {
    if (!isValidLocationPayload(payload)) {
      socket.emit("server:error", {
        message: "Invalid location payload",
      });
      return;
    }

    const cleanBusId = payload.busId.trim().toUpperCase();

    addSocketBusId(socket, cleanBusId);

    const normalizedPayload: ActiveBusLocation = {
      ...payload,
      busId: cleanBusId,
      socketId: socket.id,
      lastSeen: Date.now(),
    };

    latestLocations[cleanBusId] = normalizedPayload;

    saveBusLocation(normalizedPayload);

    console.log("Location received:", normalizedPayload);

    io.emit("bus:location-updated", normalizedPayload);
    broadcastLatestLocations();
  });

  socket.on(
    "driver:stop-sharing",
    (payload: { busId: string }, callback?: (response: { ok: boolean }) => void) => {
      const busId = String(payload?.busId || "").trim().toUpperCase();

      if (busId) {
        removeBusFromLiveMap(busId, "driver-stopped-sharing");

        const currentBusIds: string[] = socket.data.busIds || [];
        socket.data.busIds = currentBusIds.filter((id) => id !== busId);
      }

      if (callback) {
        callback({ ok: true });
      }
    }
  );

  socket.on("disconnect", () => {
    const busIds: string[] = socket.data.busIds || [];

    busIds.forEach((busId) => {
      if (latestLocations[busId]?.socketId === socket.id) {
        removeBusFromLiveMap(busId, "driver-disconnected");
      }
    });

    console.log("Client disconnected:", socket.id);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Pop Bus Server running on port ${PORT}`);
});


