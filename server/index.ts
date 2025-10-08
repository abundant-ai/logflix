import express, { type Request, Response, NextFunction } from "express";
import pino from "pino";
import pinoHttp from "pino-http";
import { nanoid } from "nanoid";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

// Configure Pino logger
const logger = pino({
  name: 'logflix-server',
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
  customSuccessMessage: function (req, res) {
    if (req.url?.startsWith('/api')) {
      return `${req.method} ${req.url} completed`
    }
    return 'request completed'
  },
  customErrorMessage: function (req, res, err) {
    return `${req.method} ${req.url} errored: ${err.message}`
  },
  customAttributeKeys: {
    req: 'request',
    res: 'response',
    err: 'error',
    responseTime: 'duration'
  },
  serializers: {
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
    err: pino.stdSerializers.err
  }
}));

// Make logger available to routes via locals
app.use((req, res, next) => {
  res.locals.logger = res.log || logger;
  next();
});

(async () => {
  const server = await registerRoutes(app, logger);

  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    
    // Log error with context
    const requestLogger = res.locals.logger || logger;
    requestLogger.error({
      err,
      req: {
        method: req.method,
        url: req.url,
        headers: req.headers,
      },
      res: {
        statusCode: status
      }
    }, message);

    res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5001 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5001', 10);
  server.listen(port, "0.0.0.0", () => {
    logger.info({ port, env: process.env.NODE_ENV || 'development' }, `Server started on port ${port}`);
  });
})();
