import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";

import { env } from "./config/env";
import "./repositories/fleetSchema";
import { logger } from "./utils/logger";
import { createPublicRoutes } from "./routes/publicRoutes";
import { createDriverRoutes } from "./routes/driverRoutes";
import { createAdminRoutes } from "./routes/adminRoutes";
import { createAiRoutes } from "./routes/aiRoutes";
import { registerDriverSocketHandlers } from "./sockets/driverSocket";
import {
  apiRateLimitMiddleware,
  compressionMiddleware,
  securityMiddleware,
} from "./middlewares/productionMiddlewares";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: env.corsOrigin,
    methods: ["GET", "POST"],
  },
});

app.disable("x-powered-by");

app.use(securityMiddleware);
app.use(compressionMiddleware);
app.use("/api", apiRateLimitMiddleware);

app.use(
  cors({
    origin: env.corsOrigin,
    methods: ["GET", "POST"],
  })
);

app.use(express.json({ limit: "100kb" }));

app.use(createPublicRoutes());
app.use(createDriverRoutes(io));
app.use(createAdminRoutes(io));
app.use(createAiRoutes());

registerDriverSocketHandlers(io);

app.use((_req, res) => {
  res.status(404).json({
    status: "error",
    message: "Route not found",
  });
});

app.use(
  (error: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error("SERVER", "Unhandled server error", {
      message: error.message,
      stack: env.isProduction ? undefined : error.stack,
    });

    res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
);

server.listen(env.port, "0.0.0.0", () => {
  logger.info("SERVER", `Pop Bus Server running on port ${env.port}`);
});


