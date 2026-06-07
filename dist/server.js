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
    });
});
io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);
    socket.emit("server:latest-locations", Object.values(latestLocations));
    socket.on("driver:location-update", (payload) => {
        if (!payload.busId || !payload.latitude || !payload.longitude) {
            socket.emit("server:error", {
                message: "Invalid location payload",
            });
            return;
        }
        latestLocations[payload.busId] = payload;
        (0, database_1.saveBusLocation)(payload);
        console.log("Location received and saved:", payload);
        io.emit("bus:location-updated", payload);
    });
    socket.on("disconnect", () => {
        console.log("Client disconnected:", socket.id);
    });
});
server.listen(PORT, "0.0.0.0", () => {
    console.log(`Pop Bus Server running on port ${PORT}`);
});
