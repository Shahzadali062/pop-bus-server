export const env = {
  port: Number(process.env.PORT) || 4000,
  nodeEnv: process.env.NODE_ENV || "development",
  adminToken: process.env.ADMIN_TOKEN || (process.env.NODE_ENV === "production" ? "" : "popbus123"),
  corsOrigin: process.env.CORS_ORIGIN || "*",
  isProduction: process.env.NODE_ENV === "production",
} as const;
