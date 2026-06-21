"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const env_1 = require("./config/env");
require("./repositories/fleetSchema");
const logger_1 = require("./utils/logger");
const publicRoutes_1 = require("./routes/publicRoutes");
const driverRoutes_1 = require("./routes/driverRoutes");
const adminRoutes_1 = require("./routes/adminRoutes");
const aiRoutes_1 = require("./routes/aiRoutes");
const aiJobRoutes_1 = require("./routes/aiJobRoutes");
const driverSocket_1 = require("./sockets/driverSocket");
const socketTimingLogger_1 = require("./sockets/socketTimingLogger");
const aiSocket_1 = require("./sockets/aiSocket");
const characterSocket_1 = require("./sockets/characterSocket");
const productionMiddlewares_1 = require("./middlewares/productionMiddlewares");
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, {
    cors: {
        origin: env_1.env.corsOrigin,
        methods: ["GET", "POST"],
    },
});
app.disable("x-powered-by");
app.use(productionMiddlewares_1.securityMiddleware);
app.use(productionMiddlewares_1.compressionMiddleware);
app.use("/api", productionMiddlewares_1.apiRateLimitMiddleware);
app.use((0, cors_1.default)({
    origin: env_1.env.corsOrigin,
    methods: ["GET", "POST"],
}));
app.use(express_1.default.json({ limit: "100kb" }));
app.use((0, publicRoutes_1.createPublicRoutes)());
app.use((0, driverRoutes_1.createDriverRoutes)(io));
app.use((0, adminRoutes_1.createAdminRoutes)(io));
app.use((0, aiRoutes_1.createAiRoutes)());
app.use((0, aiJobRoutes_1.createAiJobRoutes)(io));
(0, driverSocket_1.registerDriverSocketHandlers)(io);
(0, socketTimingLogger_1.registerSocketTimingLogger)(io);
(0, aiSocket_1.registerAiSocketHandlers)(io);
(0, characterSocket_1.registerCharacterSocketHandlers)(io);
app.use((_req, res) => {
    res.status(404).json({
        status: "error",
        message: "Route not found",
    });
});
app.use((error, _req, res, _next) => {
    logger_1.logger.error("SERVER", "Unhandled server error", {
        message: error.message,
        stack: env_1.env.isProduction ? undefined : error.stack,
    });
    res.status(500).json({
        status: "error",
        message: "Internal server error",
    });
});
server.listen(env_1.env.port, "0.0.0.0", () => {
    logger_1.logger.info("SERVER", `Pop Bus Server running on port ${env_1.env.port}`);
});
