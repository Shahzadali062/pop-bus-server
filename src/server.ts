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

let latestLocations: Record<string, BusLocationPayload> = {};

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
  });
});

app.get("/api/buses/latest", (_req, res) => {
  res.json({
    buses: Object.values(latestLocations),
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
  });
});

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.emit("server:latest-locations", Object.values(latestLocations));

  socket.on("driver:location-update", (payload: BusLocationPayload) => {
    if (!payload.busId || !payload.latitude || !payload.longitude) {
      socket.emit("server:error", {
        message: "Invalid location payload",
      });
      return;
    }

    latestLocations[payload.busId] = payload;

    saveBusLocation(payload);

    console.log("Location received and saved:", payload);

    io.emit("bus:location-updated", payload);
  });

  socket.on("driver:stop-sharing", (payload: { busId: string }) => {
    if (!payload.busId) return;

    delete latestLocations[payload.busId];

    console.log("Driver stopped sharing:", payload.busId);

    io.emit("bus:removed", {
      busId: payload.busId,
    });

    io.emit("server:latest-locations", Object.values(latestLocations));
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Pop Bus Server running on port ${PORT}`);
});
