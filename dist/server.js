"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const database_1 = require("./database");
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const PORT = Number(process.env.PORT) || 4000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "popbus123";
const BUS_TIMEOUT_MS = 20000;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const io = new socket_io_1.Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
    },
});
let latestLocations = {};
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
function removeBusFromLiveMap(busId, reason) {
    if (!latestLocations[busId])
        return;
    delete latestLocations[busId];
    console.log(`Bus removed from live map: ${busId}. Reason: ${reason}`);
    io.emit("bus:removed", {
        busId,
        reason,
    });
    io.emit("server:latest-locations", getPublicBusLocations());
}
function isValidLocationPayload(payload) {
    return (typeof payload.busId === "string" &&
        payload.busId.trim().length > 0 &&
        typeof payload.latitude === "number" &&
        typeof payload.longitude === "number");
}
setInterval(() => {
    const now = Date.now();
    Object.values(latestLocations).forEach((bus) => {
        const inactiveFor = now - bus.lastSeen;
        if (inactiveFor > BUS_TIMEOUT_MS) {
            removeBusFromLiveMap(bus.busId, "inactive-timeout");
        }
    });
}, 5000);
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
        totalSavedLocations: (0, database_1.getTotalLocationCount)(),
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
    const history = (0, database_1.getBusLocationHistory)(busId, limit);
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
    (0, database_1.clearBusLocationDatabase)();
    latestLocations = {};
    io.emit("server:latest-locations", []);
    res.json({
        status: "ok",
        message: "Database and live bus locations cleared",
        totalSavedLocations: (0, database_1.getTotalLocationCount)(),
        activeBuses: 0,
    });
});
io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);
    socket.emit("server:latest-locations", getPublicBusLocations());
    socket.on("driver:location-update", (payload) => {
        if (!isValidLocationPayload(payload)) {
            socket.emit("server:error", {
                message: "Invalid location payload",
            });
            return;
        }
        const cleanBusId = payload.busId.trim().toUpperCase();
        socket.data.busId = cleanBusId;
        const normalizedPayload = {
            ...payload,
            busId: cleanBusId,
            socketId: socket.id,
            lastSeen: Date.now(),
        };
        latestLocations[cleanBusId] = normalizedPayload;
        (0, database_1.saveBusLocation)(normalizedPayload);
        console.log("Location received and saved:", normalizedPayload);
        io.emit("bus:location-updated", normalizedPayload);
        io.emit("server:latest-locations", getPublicBusLocations());
    });
    socket.on("driver:stop-sharing", (payload, callback) => {
        const busId = String(payload?.busId || "").trim().toUpperCase();
        if (busId) {
            removeBusFromLiveMap(busId, "driver-stopped-sharing");
        }
        if (callback) {
            callback({ ok: true });
        }
    });
    socket.on("disconnect", () => {
        const busId = String(socket.data.busId || "").trim().toUpperCase();
        if (busId) {
            removeBusFromLiveMap(busId, "driver-disconnected");
        }
        console.log("Client disconnected:", socket.id);
    });
});
server.listen(PORT, "0.0.0.0", () => {
    console.log(`Pop Bus Server running on port ${PORT}`);
});
