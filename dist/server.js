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
function broadcastLatestLocations() {
    io.emit("server:latest-locations", getPublicBusLocations());
}
function removeBusFromLiveMap(busId, reason) {
    const cleanBusId = busId.trim().toUpperCase();
    if (!latestLocations[cleanBusId])
        return;
    delete latestLocations[cleanBusId];
    console.log(`Bus removed: ${cleanBusId}. Reason: ${reason}`);
    io.emit("bus:removed", {
        busId: cleanBusId,
        reason,
    });
    broadcastLatestLocations();
}
function isValidLocationPayload(payload) {
    return (typeof payload.busId === "string" &&
        payload.busId.trim().length > 0 &&
        typeof payload.latitude === "number" &&
        typeof payload.longitude === "number");
}
function addSocketBusId(socket, busId) {
    const currentBusIds = socket.data.busIds || [];
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
app.post("/api/driver/location-update", (req, res) => {
    const payload = req.body;
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
    (0, database_1.saveBusLocation)(payload);
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
    socket.on("driver:location-update", (payload) => {
        if (!isValidLocationPayload(payload)) {
            socket.emit("server:error", {
                message: "Invalid location payload",
            });
            return;
        }
        const cleanBusId = payload.busId.trim().toUpperCase();
        addSocketBusId(socket, cleanBusId);
        const normalizedPayload = {
            ...payload,
            busId: cleanBusId,
            socketId: socket.id,
            lastSeen: Date.now(),
        };
        latestLocations[cleanBusId] = normalizedPayload;
        (0, database_1.saveBusLocation)(normalizedPayload);
        console.log("Location received:", normalizedPayload);
        io.emit("bus:location-updated", normalizedPayload);
        broadcastLatestLocations();
    });
    socket.on("driver:stop-sharing", (payload, callback) => {
        const busId = String(payload?.busId || "").trim().toUpperCase();
        if (busId) {
            removeBusFromLiveMap(busId, "driver-stopped-sharing");
            const currentBusIds = socket.data.busIds || [];
            socket.data.busIds = currentBusIds.filter((id) => id !== busId);
        }
        if (callback) {
            callback({ ok: true });
        }
    });
    socket.on("disconnect", () => {
        const busIds = socket.data.busIds || [];
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
