import { Request, Response, NextFunction } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import {
  UserRole,
  Permission,
  UserMetadata,
  AuthContext,
  getPermissionsForRole,
  hasPermission,
  canAccessRepository,
  isValidRole
} from "@logflix/shared/auth";

// Check if Clerk is enabled
const isClerkEnabled = !!(process.env.CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);

/**
 * Middleware to require authentication for routes
 * Attaches user info and RBAC context to res.locals.auth
 * If Clerk is not configured, this middleware passes through (for development)
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  // If Clerk is not enabled, skip authentication (for development)
  if (!isClerkEnabled) {
    res.locals.auth = {
      userId: null,
      role: UserRole.ADMIN, // Default to admin in dev mode
      permissions: getPermissionsForRole(UserRole.ADMIN),
      assignedRepositories: [],
    };
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

    // Fetch user metadata from Clerk to get role and permissions
    const client = await clerkClient();
    const user = await client.users.getUser(auth.userId);
    const metadata = (user.publicMetadata || {}) as UserMetadata;

    // Default to member role if not specified
    const role = metadata.role && isValidRole(metadata.role)
      ? metadata.role
      : UserRole.MEMBER;

    const authContext: AuthContext = {
      userId: auth.userId,
      role,
      permissions: getPermissionsForRole(role),
      assignedRepositories: metadata.assignedRepositories || [],
      organizationId: metadata.organizationId,
    };

    // Attach auth context to res.locals for use in routes
    res.locals.auth = authContext;
    res.locals.clerkAuth = auth; // Keep original Clerk auth object
    next();
  } catch (error) {
    const requestLogger = res.locals.logger;
    if (requestLogger) {
      requestLogger.error({ error }, "Authentication error");
    }
    return res.status(500).json({
      error: "Authentication Error",
      message: "Failed to authenticate request",
    });
  }
}

/**
 * Optional authentication - attaches user info if available but doesn't require it
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction) {
  // If Clerk is not enabled, skip authentication
  if (!isClerkEnabled) {
    res.locals.auth = {
      userId: null,
      role: UserRole.MEMBER,
      permissions: [],
      assignedRepositories: [],
    };
    return next();
  }

  try {
    const auth = getAuth(req);

    if (!auth.userId) {
      res.locals.auth = {
        userId: null,
        role: UserRole.MEMBER,
        permissions: [],
        assignedRepositories: [],
      };
      return next();
    }

    // Fetch user metadata
    const client = await clerkClient();
    const user = await client.users.getUser(auth.userId);
    const metadata = (user.publicMetadata || {}) as UserMetadata;

    const role = metadata.role && isValidRole(metadata.role)
      ? metadata.role
      : UserRole.MEMBER;

    const authContext: AuthContext = {
      userId: auth.userId,
      role,
      permissions: getPermissionsForRole(role),
      assignedRepositories: metadata.assignedRepositories || [],
      organizationId: metadata.organizationId,
    };

    res.locals.auth = authContext;
    res.locals.clerkAuth = auth;
    next();
  } catch (error) {
    res.locals.auth = {
      userId: null,
      role: UserRole.MEMBER,
      permissions: [],
      assignedRepositories: [],
    };
    next();
  }
}

/**
 * Middleware to require specific permission
 */
export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction) => {
    const authContext = res.locals.auth as AuthContext;

    if (!authContext || !authContext.userId) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "You must be signed in to access this resource",
      });
    }

    if (!hasPermission(authContext.role, permission)) {
      return res.status(403).json({
        error: "Forbidden",
        message: "You do not have permission to access this resource",
      });
    }

    next();
  };
}

/**
 * Middleware to require admin role
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const authContext = res.locals.auth as AuthContext;

  if (!authContext || !authContext.userId) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "You must be signed in to access this resource",
    });
  }

  if (authContext.role !== UserRole.ADMIN) {
    return res.status(403).json({
      error: "Forbidden",
      message: "This resource requires admin access",
    });
  }

  next();
}

/**
 * Middleware to require repository access
 */
export function requireRepositoryAccess(req: Request, res: Response, next: NextFunction) {
  const authContext = res.locals.auth as AuthContext;

  if (!authContext || !authContext.userId) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "You must be signed in to access this resource",
    });
  }

  // Get repository from query params or route params
  const owner = req.params.owner || req.query.owner as string;
  const repo = req.params.repo || req.query.repo as string;

  if (!owner || !repo) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Repository owner and name are required",
    });
  }

  const repoId = `${owner}/${repo}`;

  if (!canAccessRepository(authContext.role, authContext.assignedRepositories, repoId)) {
    return res.status(403).json({
      error: "Forbidden",
      message: "You do not have access to this repository",
    });
  }

  next();
}
