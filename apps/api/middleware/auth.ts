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
import { fetchUserGitHubRepositories, fetchUserOrgMembership, shouldBeAdmin } from "@logflix/shared/githubSync";

// Check if Clerk is enabled
const isClerkEnabled = !!(process.env.CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);

// GitHub sync configuration
const GITHUB_SYNC_INTERVAL_MS = parseInt(process.env.GITHUB_SYNC_INTERVAL_HOURS || "24", 10) * 60 * 60 * 1000;

/**
 * Check if GitHub access sync is needed
 */
function shouldSyncGitHubAccess(metadata: UserMetadata): boolean {
  // Sync if no repositories assigned yet
  if (!metadata.assignedRepositories || metadata.assignedRepositories.length === 0) {
    return true;
  }

  // Sync if no lastGitHubSync timestamp
  if (!metadata.lastGitHubSync) {
    return true;
  }

  // Sync if last sync was more than GITHUB_SYNC_INTERVAL_MS ago
  const lastSync = new Date(metadata.lastGitHubSync).getTime();
  const now = Date.now();
  return now - lastSync > GITHUB_SYNC_INTERVAL_MS;
}

/**
 * Automatically sync GitHub repository access if needed
 * This runs during authentication and updates Clerk metadata
 */
async function syncGitHubAccessIfNeeded(
  userId: string,
  metadata: UserMetadata,
  requestLogger?: any
): Promise<UserMetadata> {
  // Check if sync is needed
  if (!shouldSyncGitHubAccess(metadata)) {
    return metadata; // Return existing metadata
  }

  try {
    if (requestLogger) {
      requestLogger.info({ userId }, "Auto-syncing GitHub repository access");
    }

    const user = await clerkClient.users.getUser(userId);

    // Find GitHub OAuth account
    const githubAccount = user.externalAccounts.find(
      (account: any) => account.provider === "oauth_github"
    );

    if (!githubAccount) {
      if (requestLogger) {
        requestLogger.warn({ userId }, "No GitHub OAuth account found for auto-sync");
      }
      return metadata; // Return existing metadata
    }

    // Get GitHub OAuth access token from Clerk
    let githubToken: string | undefined;
    try {
      const tokenResponse = await clerkClient.users.getUserOauthAccessToken(userId, 'github');
      // Handle PaginatedResourceResponse structure - access via data property
      const tokens = Array.isArray(tokenResponse) ? tokenResponse : tokenResponse.data;
      githubToken = tokens?.[0]?.token;

      if (requestLogger && githubToken) {
        requestLogger.info({ userId }, "Successfully retrieved GitHub OAuth token from Clerk");
      }
    } catch (tokenError) {
      if (requestLogger) {
        requestLogger.error({ userId, error: tokenError }, "Failed to retrieve GitHub OAuth token from Clerk");
      }
    }

    if (!githubToken) {
      if (requestLogger) {
        requestLogger.warn({ userId }, "GitHub OAuth token not available. User may need to reconnect their GitHub account.");
      }
      return metadata; // Return existing metadata
    }

    // Fetch GitHub username
    const githubUsername = githubAccount.username || githubAccount.emailAddress?.split("@")[0] || "";

    // Fetch user's accessible repositories from GitHub
    const accessibleRepos = await fetchUserGitHubRepositories(githubToken);

    // Fetch user's organization role
    const { role: githubOrgRole } = await fetchUserOrgMembership(
      githubToken,
      undefined,
      githubUsername
    );

    // Determine if user should be admin
    const shouldUpgradeToAdmin = shouldBeAdmin(githubOrgRole);
    const newRole = shouldUpgradeToAdmin ? UserRole.ADMIN : UserRole.MEMBER;

    // Update user metadata in Clerk
    const updatedMetadata: UserMetadata = {
      role: newRole,
      assignedRepositories: accessibleRepos,
      organizationId: metadata.organizationId,
      lastGitHubSync: new Date().toISOString(),
    };

    await clerkClient.users.updateUserMetadata(userId, {
      // Type assertion required due to Clerk SDK type mismatch with UserMetadata interface
      // This safely converts our strongly-typed UserMetadata to Clerk's expected generic record type
      publicMetadata: updatedMetadata as unknown as Record<string, unknown>,
    });

    if (requestLogger) {
      requestLogger.info({
        userId,
        syncedRepos: accessibleRepos.length,
        role: newRole,
      }, "GitHub access auto-sync completed");
    }

    return updatedMetadata;
  } catch (error) {
    if (requestLogger) {
      requestLogger.error({ userId, error }, "Error during GitHub auto-sync, using existing metadata");
    }
    // Return existing metadata on error - don't block authentication
    return metadata;
  }
}

/**
 * Middleware to require authentication for routes
 * Attaches user info and RBAC context to res.locals.auth
 * If Clerk is not configured, this middleware passes through (for development)
 * Automatically syncs GitHub repository access if needed
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
    const user = await clerkClient.users.getUser(auth.userId);
    let metadata = ((user.publicMetadata as unknown) || {}) as UserMetadata;

    // Automatically sync GitHub repository access if needed
    const requestLogger = res.locals.logger;
    metadata = await syncGitHubAccessIfNeeded(auth.userId, metadata, requestLogger);

    // Retrieve GitHub OAuth token for API calls
    let githubToken: string | undefined;
    try {
      const tokenResponse = await clerkClient.users.getUserOauthAccessToken(auth.userId, 'github');
      const tokens = Array.isArray(tokenResponse) ? tokenResponse : tokenResponse.data;
      githubToken = tokens?.[0]?.token;
      if (requestLogger && githubToken) {
        requestLogger.debug({ userId: auth.userId }, "GitHub OAuth token retrieved for API calls");
      }
    } catch (tokenError) {
      if (requestLogger) {
        requestLogger.warn({ userId: auth.userId, error: tokenError }, "Could not retrieve GitHub OAuth token for API calls");
      }
    }

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
    res.locals.githubToken = githubToken; // Attach GitHub OAuth token for GitHub API calls
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
    const user = await clerkClient.users.getUser(auth.userId);
    const metadata = ((user.publicMetadata as unknown) || {}) as UserMetadata;

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
  // Handle cases where query parameters might be arrays (e.g., ?owner=a&owner=b)
  const owner = req.params.owner || (Array.isArray(req.query?.owner) ? req.query.owner[0] : typeof req.query?.owner === 'string' ? req.query.owner : undefined);
  const repo = req.params.repo || (Array.isArray(req.query?.repo) ? req.query.repo[0] : typeof req.query?.repo === 'string' ? req.query.repo : undefined);

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
