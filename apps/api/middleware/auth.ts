import { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";

// Check if Clerk is enabled
const isClerkEnabled = !!(process.env.CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);

/**
 * Middleware to require authentication for routes
 * Attaches user info to res.locals.auth
 * If Clerk is not configured, this middleware passes through (for development)
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  // If Clerk is not enabled, skip authentication (for development)
  if (!isClerkEnabled) {
    res.locals.auth = { userId: null };
    return next();
  }

  try {
    const auth = getAuth(req);

    if (!auth.userId) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "You must be signed in to access this resource",
      });
    }

    // Attach auth info to res.locals for use in routes
    res.locals.auth = auth;
    next();
  } catch (error) {
    return res.status(500).json({
      error: "Authentication Error",
      message: "Failed to authenticate request",
    });
  }
}

/**
 * Optional authentication - attaches user info if available but doesn't require it
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  // If Clerk is not enabled, skip authentication
  if (!isClerkEnabled) {
    res.locals.auth = { userId: null };
    return next();
  }

  try {
    const auth = getAuth(req);
    res.locals.auth = auth;
    next();
  } catch (error) {
    res.locals.auth = { userId: null };
    next();
  }
}
