import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// Load environment variables from .env file in project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, "../../.env") });

import express, { type Request, Response, NextFunction } from "express";
import { clerkMiddleware } from "@clerk/express";
import pino from "pino";
import pinoHttp from "pino-http";
import { nanoid } from "nanoid";
import { registerRoutes } from "./routes";

// Configure Pino logger
const logger = pino({
  name: 'logflix-api',
  level: process.env.LOG_LEVEL || 'info',
  ...(process.env.NODE_ENV === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
        singleLine: false
      }
    }
  })
});

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Add Pino HTTP middleware with request ID and response time
app.use(pinoHttp({
  logger,
  genReqId: () => nanoid(),
  customLogLevel: function (req, res, err) {
    if (res.statusCode >= 400 && res.statusCode < 500) {
      return 'warn'
    } else if (res.statusCode >= 500 || err) {
      return 'error'
    } else if (res.statusCode >= 300 && res.statusCode < 400) {
      return 'silent'
    }
    return 'info'
  },
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    })
  }
}));

// Clerk middleware - must come before routes
app.use(clerkMiddleware());

// Register API routes
registerRoutes(app);

// Global error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  logger.error({ err, status, message }, 'Request error');

  res.status(status).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Export for Vercel serverless function
export default app;
