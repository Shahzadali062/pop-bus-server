import compression from "compression";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import { env } from "../config/env";

export const securityMiddleware = helmet({
  crossOriginResourcePolicy: false,
});

export const compressionMiddleware = compression();

export const apiRateLimitMiddleware = rateLimit({
  windowMs: 60 * 1000,
  limit: env.isProduction ? 120 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: "error",
    message: "Too many requests. Please try again later.",
  },
});
