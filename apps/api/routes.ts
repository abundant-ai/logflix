import type { Express } from "express";
import { createServer, type Server } from "http";
import type { Logger } from "pino";
import { createHash } from "crypto";
import { GitHubOctokitService } from "@logflix/github-client";
import { requireAuth, requireAdmin, requireRepositoryAccess } from "./middleware/auth.js";
import { clerkClient } from "@clerk/express";
import { UserRole, UserMetadata, AuthContext, canAccessRepository } from "@logflix/shared/auth";
import { GitHubWorkflowArtifact } from "@logflix/shared/schema";

/**
 * GitHub Client Cache
 * Caches GitHubOctokitService instances per organization to reuse Octokit clients
 * and avoid creating new instances on every API call
 */
interface CachedClient {
  client: GitHubOctokitService;
  lastUsed: number;
  orgId: string;
}

const githubClientCache = new Map<string, CachedClient>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const MAX_CACHE_SIZE = 100; // Maximum number of cached clients

/**
 * Get or create a cached GitHub client for an organization
 */
function getCachedGitHubClient(
  orgId: string,
  orgName: string,
  tokenHash: string,
  logger: Logger,
  githubToken: string
): GitHubOctokitService {
  const cacheKey = `${orgId}:${tokenHash}`;
  const now = Date.now();

  // Check if we have a valid cached client
  const cached = githubClientCache.get(cacheKey);
  if (cached && (now - cached.lastUsed) < CACHE_TTL) {
    cached.lastUsed = now;
    logger.debug({ orgId, cacheKey: cacheKey.slice(0, 20) }, 'Reusing cached GitHub client');
    return cached.client;
  }

  // Create new client
  logger.debug({ orgId, cacheKey: cacheKey.slice(0, 20) }, 'Creating new GitHub client');
  const client = new GitHubOctokitService(
    orgName,
    undefined, // Not repo-specific for this operation
    undefined,
    logger,
    githubToken
  );

  // Add to cache
  githubClientCache.set(cacheKey, {
    client,
    lastUsed: now,
    orgId,
  });

  // Cleanup old entries if cache is too large
  if (githubClientCache.size > MAX_CACHE_SIZE) {
    cleanupGitHubClientCache();
  }

  return client;
}

/**
 * Remove expired entries from the cache
 */
function cleanupGitHubClientCache() {
  const now = Date.now();
  let removed = 0;

  for (const [key, cached] of Array.from(githubClientCache.entries())) {
    if (now - cached.lastUsed > CACHE_TTL) {
      githubClientCache.delete(key);
      removed++;
    }
  }

  // If still too large, remove oldest entries
  if (githubClientCache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(githubClientCache.entries())
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed);

    const toRemove = entries.slice(0, githubClientCache.size - MAX_CACHE_SIZE);
    toRemove.forEach(([key]) => githubClientCache.delete(key));
    removed += toRemove.length;
  }
}

// Periodic cleanup every 10 minutes
// Store the interval ID so we can clear it on shutdown
const cleanupInterval = setInterval(cleanupGitHubClientCache, 10 * 60 * 1000);

// Cleanup on process termination to prevent memory leaks
process.on('SIGTERM', () => {
  clearInterval(cleanupInterval);
  githubClientCache.clear();
});

process.on('SIGINT', () => {
  clearInterval(cleanupInterval);
  githubClientCache.clear();
});

export async function registerRoutes(app: Express, logger: Logger): Promise<Server> {
  /**
   * Creates GitHub service instance with request-specific parameters
   */
  const getGitHubService = (query: any, requestLogger?: Logger, githubToken?: string) => {
    const owner = typeof query.owner === 'string' ? query.owner : undefined;
    const repo = typeof query.repo === 'string' ? query.repo : undefined;
    const workflow = typeof query.workflow === 'string' ? query.workflow : undefined;
    
    if (requestLogger) {
      requestLogger.debug({ owner, repo, workflow, hasToken: !!githubToken }, 'Creating GitHub service instance');
    }
    
    return new GitHubOctokitService(owner, repo, workflow, requestLogger || logger, githubToken);
  };

  // ============= USER & PERMISSIONS API ROUTES =============
  app.get("/api/user/permissions", requireAuth, async (req, res) => {
    try {
      const authContext = res.locals.auth as AuthContext;

      res.json({
        userId: authContext.userId,
        role: authContext.role,
        permissions: authContext.permissions,
        assignedRepositories: authContext.assignedRepositories,
        organizationId: authContext.organizationId,
      });
    } catch (error) {
      const requestLogger = res.locals.logger || logger;
      requestLogger.error({ error }, "Error fetching user permissions");
      res.status(500).json({ error: "Failed to fetch user permissions" });
    }
  });

  app.get("/api/user/repositories", requireAuth, async (req, res) => {
    try {
      const authContext = res.locals.auth as AuthContext;
      const requestLogger = res.locals.logger || logger;

      requestLogger.info({
        userId: authContext.userId,
        role: authContext.role,
        orgId: authContext.organizationId,
        assignedRepos: authContext.assignedRepositories,
      }, "Fetching accessible repositories for user");

      // Check if user belongs to an organization
      if (!authContext.organizationId || !authContext.organizationMetadata) {
        requestLogger.warn({ userId: authContext.userId }, "User not in organization or org metadata missing");
        return res.status(403).json({
          error: "Organization Required",
          message: "You must belong to an organization to access repositories. Please contact your administrator.",
        });
      }

      const { githubOrganization, defaultWorkflow } = authContext.organizationMetadata;
      const githubToken = res.locals.githubToken;

      // Create a hash of the token to use as a non-sensitive cache key
      const tokenHash = createHash('sha256').update(githubToken).digest('hex');

      // Get or create cached GitHub service instance
      // This reuses the same Octokit client across multiple requests for the same org
      const githubService = getCachedGitHubClient(
        authContext.organizationId,
        githubOrganization,
        tokenHash,
        requestLogger,
        githubToken
      );

      // Build repository objects from user's assigned repositories
      // These come from GitHub OAuth token and include all repos the user has access to
      // Fetch metadata from GitHub API for each repository in parallel (limited by GitHub rate limiting)
      const userRepos = await Promise.all(
        authContext.assignedRepositories.map(async (fullName) => {
          const [owner, repoName] = fullName.split('/');

          // Fetch metadata from GitHub API
          let metadata = {
            description: '',
            created_at: undefined as string | undefined,
            updated_at: undefined as string | undefined,
            pushed_at: undefined as string | undefined,
          };

          try {
            const repoMetadata = await githubService.getRepositoryMetadata(owner, repoName);
            metadata = {
              description: repoMetadata.description || '',
              created_at: repoMetadata.created_at ?? undefined,
              updated_at: repoMetadata.updated_at ?? undefined,
              pushed_at: repoMetadata.pushed_at ?? undefined,
            };
          } catch (error) {
            requestLogger.warn({ repo: fullName, error }, 'Failed to fetch repository metadata, using defaults');
          }

          return {
            name: repoName,
            full_name: fullName,
            workflow: defaultWorkflow || 'test-tasks.yaml', // Use org default or fallback
            description: metadata.description,
            created_at: metadata.created_at,
            updated_at: metadata.updated_at,
            pushed_at: metadata.pushed_at,
          };
        })
      );

      if (authContext.role === UserRole.ADMIN) {
        requestLogger.info({
          userId: authContext.userId,
          repoCount: userRepos.length,
          githubOrg: githubOrganization
        }, "Admin access granted - returning all accessible repositories");

        res.json({
          hasAllAccess: true,
          organization: githubOrganization,
          repositories: userRepos,
        });
      } else {
        requestLogger.info({
          userId: authContext.userId,
          assignedCount: authContext.assignedRepositories.length,
          repoCount: userRepos.length,
          githubOrg: githubOrganization,
          repositories: userRepos.map(r => r.name)
        }, "Member access - returning assigned repositories");

        res.json({
          hasAllAccess: false,
          organization: githubOrganization,
          repositories: userRepos,
        });
      }
    } catch (error) {
      const requestLogger = res.locals.logger || logger;
      requestLogger.error({ error }, "Error fetching accessible repositories");
      res.status(500).json({ error: "Failed to fetch accessible repositories" });
    }
  });

  // ============= ADMIN API ROUTES =============
  app.get("/api/admin/users", requireAuth, requireAdmin, async (req, res) => {
    try {
      const client = clerkClient;
      const usersResponse = await client.users.getUserList({
        limit: 100,
      });

      const users = usersResponse.data.map((user) => {
        const metadata = ((user.publicMetadata as unknown) || {}) as UserMetadata;
        return {
          id: user.id,
          email: user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress,
          firstName: user.firstName,
          lastName: user.lastName,
          role: metadata.role || UserRole.MEMBER,
          assignedRepositories: metadata.assignedRepositories || [],
          createdAt: user.createdAt,
        };
      });

      res.json({ users });
    } catch (error) {
      const requestLogger = res.locals.logger || logger;
      requestLogger.error({ error }, "Error fetching users");
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.patch("/api/admin/users/:userId/role", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const { role } = req.body;

      if (!role || (role !== UserRole.ADMIN && role !== UserRole.MEMBER)) {
        return res.status(400).json({ error: "Invalid role. Must be 'admin' or 'member'" });
      }

      const client = clerkClient;
      const user = await client.users.getUser(userId);
      const metadata = ((user.publicMetadata as unknown) || {}) as UserMetadata;

      await client.users.updateUser(userId, {
        publicMetadata: {
          ...metadata,
          role,
        },
      });

      res.json({
        message: "User role updated successfully",
        userId,
        role,
      });
    } catch (error) {
      const requestLogger = res.locals.logger || logger;
      requestLogger.error({ userId: req.params.userId, error }, "Error updating user role");
      res.status(500).json({ error: "Failed to update user role" });
    }
  });

  app.patch("/api/admin/users/:userId/repositories", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const { repositories } = req.body;

      if (!Array.isArray(repositories)) {
        return res.status(400).json({ error: "Repositories must be an array" });
      }

      const isValid = repositories.every((repo) => {
        const parts = repo.split('/');
        return parts.length === 2 && parts[0] && parts[1];
      });

      if (!isValid) {
        return res.status(400).json({ error: "Invalid repository format. Use 'owner/repo'" });
      }

      const client = clerkClient;
      const user = await client.users.getUser(userId);
      const metadata = ((user.publicMetadata as unknown) || {}) as UserMetadata;

      await client.users.updateUser(userId, {
        publicMetadata: {
          ...metadata,
          assignedRepositories: repositories,
        },
      });

      res.json({
        message: "User repositories updated successfully",
        userId,
        repositories,
      });
    } catch (error) {
      const requestLogger = res.locals.logger || logger;
      requestLogger.error({ userId: req.params.userId, error }, "Error updating user repositories");
      res.status(500).json({ error: "Failed to update user repositories" });
    }
  });

  // ============= GITHUB API ROUTES =============
  app.get("/api/github/repo-stats/:owner/:repo", requireAuth, requireRepositoryAccess, async (req, res) => {
    try {
      const { owner, repo } = req.params;
      const requestLogger = res.locals.logger || logger;
      const githubToken = res.locals.githubToken;
      const githubService = new GitHubOctokitService(owner, repo, undefined, requestLogger, githubToken);

      requestLogger.debug({ owner, repo }, 'Calculating repository statistics');
      const stats = await githubService.getRepositoryStats();
      
      requestLogger.debug({ ...stats }, 'Repository statistics calculated successfully');
      res.json(stats);
    } catch (error) {
      const requestLogger = res.locals.logger || logger;
      requestLogger.error({ owner: req.params.owner, repo: req.params.repo, error }, "Error fetching repository stats");
      res.status(500).json({ error: "Failed to fetch repository stats" });
    }
  });

  app.get("/api/github/pull-requests", requireAuth, requireRepositoryAccess, async (req, res) => {
    try {
      const { state, limit, sort, direction } = req.query;
      const requestLogger = res.locals.logger || logger;
      const githubToken = res.locals.githubToken;
      const githubService = getGitHubService(req.query, requestLogger, githubToken);
      
      const stateValue = (state === 'open' || state === 'closed' || state === 'all') ? state : 'all';
      const limitNumber = limit && typeof limit === 'string' ? parseInt(limit, 10) : 100;
      const sortValue = (sort === 'created' || sort === 'updated') ? sort as 'created' | 'updated' : 'created';
      const directionValue = (direction === 'asc' || direction === 'desc') ? direction : 'desc';
      
      if (isNaN(limitNumber) || limitNumber < 1 || limitNumber > 5000) {
        return res.status(400).json({ error: "Invalid limit parameter (must be 1-5000)" });
      }

      requestLogger.debug({ state: stateValue, limit: limitNumber, sort: sortValue, direction: directionValue }, 'Fetching pull requests with filters');
      
      const pullRequests = await githubService.listPullRequests(stateValue, limitNumber, sortValue, directionValue);
      
      requestLogger.info({ count: pullRequests.length, limit: limitNumber }, 'Pull requests retrieved successfully');
      res.json({ pullRequests, total_count: pullRequests.length });
    } catch (error) {
      const requestLogger = res.locals.logger || logger;
      requestLogger.error({ query: req.query, error }, "Error fetching pull requests");
      res.status(500).json({ error: "Failed to fetch pull requests" });
    }
  });

  app.get("/api/github/pull-request/:prNumber", requireAuth, requireRepositoryAccess, async (req, res) => {
    try {
      const { prNumber } = req.params;
      const requestLogger = res.locals.logger || logger;
      const githubToken = res.locals.githubToken;
      const githubService = getGitHubService(req.query, requestLogger, githubToken);

      if (!prNumber || isNaN(parseInt(prNumber, 10))) {
        return res.status(400).json({ error: "Invalid PR number parameter" });
      }

      const prNumberInt = parseInt(prNumber, 10);
      
      requestLogger.debug({ prNumber: prNumberInt }, 'Fetching pull request details');
      const pullRequest = await githubService.getPullRequest(prNumberInt);

      if (!pullRequest) {
        requestLogger.warn({ prNumber: prNumberInt }, 'Pull request not found');
        return res.status(404).json({ error: "Pull request not found" });
      }

      requestLogger.debug({ prNumber: prNumberInt, title: pullRequest.title }, 'Pull request details retrieved');
      res.json(pullRequest);
    } catch (error) {
      const requestLogger = res.locals.logger || logger;
      requestLogger.error({ prNumber: req.params.prNumber, error }, "Error fetching pull request");
      res.status(500).json({ error: "Failed to fetch pull request" });
    }
  });

  app.get("/api/github/pr-workflow-runs/:prNumber", requireAuth, requireRepositoryAccess, async (req, res) => {
    try {
      const { prNumber } = req.params;
      const { limit } = req.query;
      const requestLogger = res.locals.logger || logger;
      const githubToken = res.locals.githubToken;
      const githubService = getGitHubService(req.query, requestLogger, githubToken);

      if (!prNumber || isNaN(parseInt(prNumber, 10))) {
        return res.status(400).json({ error: "Invalid PR number parameter" });
      }

      const prNumberInt = parseInt(prNumber, 10);
      const limitNumber = limit && typeof limit === 'string' ? parseInt(limit, 10) : 50;

      requestLogger.debug({ prNumber: prNumberInt, limit: limitNumber }, 'Fetching workflow runs for PR');
      const runs = await githubService.getWorkflowRunsForPR(prNumberInt, limitNumber);
      
      requestLogger.info({
        prNumber: prNumberInt,
        runsFound: runs.length,
        limit: limitNumber
      }, 'Workflow runs retrieved for PR');
      
      res.json({ runs, total_count: runs.length });
    } catch (error) {
      const requestLogger = res.locals.logger || logger;
      requestLogger.error({ prNumber: req.params.prNumber, error }, "Error fetching workflow runs for PR");
      res.status(500).json({ error: "Failed to fetch workflow runs for PR" });
    }
  });

  app.get("/api/github/pr-bot-comments/:prNumber", requireAuth, requireRepositoryAccess, async (req, res) => {
    try {
      const { prNumber } = req.params;
      const requestLogger = res.locals.logger || logger;
      const githubToken = res.locals.githubToken;
      const githubService = getGitHubService(req.query, requestLogger, githubToken);

      if (!prNumber || isNaN(parseInt(prNumber, 10))) {
        return res.status(400).json({ error: "Invalid PR number parameter" });
      }

      const prNumberInt = parseInt(prNumber, 10);
      
      requestLogger.debug({ prNumber: prNumberInt }, 'Filtering bot comments for PR');
      const comments = await githubService.getWorkflowBotComments(prNumberInt);

      requestLogger.debug({ prNumber: prNumberInt, commentCount: comments.length }, 'Bot comments filtered');
      res.json({ comments });
    } catch (error) {
      const requestLogger = res.locals.logger || logger;
      requestLogger.error({ prNumber: req.params.prNumber, error }, "Error fetching workflow bot comments");
      res.status(500).json({ error: "Failed to fetch workflow bot comments" });
    }
  });

  app.get("/api/github/hierarchy", requireAuth, requireRepositoryAccess, async (req, res) => {
    try {
      const { limit } = req.query;
      const requestLogger = res.locals.logger || logger;
      const githubToken = res.locals.githubToken;
      const githubService = getGitHubService(req.query, requestLogger, githubToken);
      const limitNumber = limit && typeof limit === 'string' ? parseInt(limit, 10) : 30;

      if (isNaN(limitNumber) || limitNumber < 1 || limitNumber > 100) {
        return res.status(400).json({ error: "Invalid limit parameter (must be 1-100)" });
      }

      requestLogger.debug({ limit: limitNumber }, 'Fetching workflow hierarchy');
      const hierarchy = await githubService.getHierarchy(limitNumber);
      
      requestLogger.debug({
        runsCount: hierarchy.workflow_runs.length,
        totalCount: hierarchy.total_count
      }, 'Workflow hierarchy retrieved');
      
      res.json(hierarchy);
    } catch (error) {
      const requestLogger = res.locals.logger || logger;
      requestLogger.error({ query: req.query, error }, "Error fetching GitHub hierarchy");
      res.status(500).json({ error: "Failed to fetch GitHub workflow hierarchy" });
    }
  });

  app.get("/api/github/workflow-run/:runId", requireAuth, requireRepositoryAccess, async (req, res) => {
    try {
      const { runId } = req.params;
      const requestLogger = res.locals.logger || logger;
      const githubToken = res.locals.githubToken;
      const githubService = getGitHubService(req.query, requestLogger, githubToken);

      if (!runId || isNaN(parseInt(runId, 10))) {
        return res.status(400).json({ error: "Invalid run ID parameter" });
      }

      const runIdNumber = parseInt(runId, 10);

      requestLogger.debug({ runId: runIdNumber }, 'Fetching workflow run with logs and artifacts');
      
      const [workflowRun, logs, artifacts] = await Promise.allSettled([
        githubService.getWorkflowRun(runIdNumber),
        githubService.getWorkflowRunLogs(runIdNumber),
        githubService.getWorkflowRunArtifacts(runIdNumber),
      ]);

      const run = workflowRun.status === 'fulfilled' ? workflowRun.value : null;

      if (!run) {
        requestLogger.warn({ runId: runIdNumber }, 'Workflow run not found');
        return res.status(404).json({ error: "Workflow run not found" });
      }

      const response = {
        run,
        logs: logs.status === 'fulfilled' ? logs.value : [],
        artifacts: artifacts.status === 'fulfilled' ? artifacts.value : [],
        hasData: (logs.status === 'fulfilled' && logs.value.length > 0) ||
                 (artifacts.status === 'fulfilled' && artifacts.value.length > 0),
      };

      requestLogger.debug({
        runId: runIdNumber,
        hasLogs: logs.status === 'fulfilled' && logs.value.length > 0,
        artifactCount: artifacts.status === 'fulfilled' ? artifacts.value.length : 0,
        hasData: response.hasData
      }, 'Workflow run details assembled');

      res.json(response);
    } catch (error) {
      const requestLogger = res.locals.logger || logger;
      requestLogger.error({ runId: req.params.runId, error }, "Error fetching workflow run details");
      res.status(500).json({ error: "Failed to fetch workflow run details" });
    }
  });

  app.get("/api/github/workflow-logs/:runId", requireAuth, requireRepositoryAccess, async (req, res) => {
    try {
      const { runId } = req.params;
      const requestLogger = res.locals.logger || logger;
      const githubToken = res.locals.githubToken;
      const githubService = getGitHubService(req.query, requestLogger, githubToken);

      if (!runId || isNaN(parseInt(runId, 10))) {
        return res.status(400).json({ error: "Invalid run ID parameter" });
      }

      const runIdNumber = parseInt(runId, 10);
      
      requestLogger.debug({ runId: runIdNumber }, 'Fetching workflow logs');
      const logs = await githubService.getWorkflowRunLogs(runIdNumber);

      requestLogger.debug({ runId: runIdNumber, logCount: logs.length }, 'Workflow logs retrieved');
      res.json({ logs });
    } catch (error) {
      const requestLogger = res.locals.logger || logger;
      requestLogger.error({ runId: req.params.runId, error }, "Error fetching workflow logs");
      res.status(500).json({ error: "Failed to fetch workflow logs" });
    }
  });

  app.get("/api/github/workflow-artifacts/:runId", requireAuth, requireRepositoryAccess, async (req, res) => {
    try {
      const { runId } = req.params;
      const requestLogger = res.locals.logger || logger;
      const githubToken = res.locals.githubToken;
      const githubService = getGitHubService(req.query, requestLogger, githubToken);

      if (!runId || isNaN(parseInt(runId, 10))) {
        return res.status(400).json({ error: "Invalid run ID parameter" });
      }

      const runIdNumber = parseInt(runId, 10);
      
      requestLogger.debug({ runId: runIdNumber }, 'Fetching and filtering cast artifacts');
      const allArtifacts = await githubService.getWorkflowRunArtifacts(runIdNumber);

      const artifacts = allArtifacts.filter((artifact) =>
        artifact.name.toLowerCase().includes('cast') ||
        artifact.name.toLowerCase().includes('asciinema') ||
        artifact.name.toLowerCase().includes('recording')
      );

      requestLogger.debug({
        runId: runIdNumber,
        totalArtifacts: allArtifacts.length,
        castArtifacts: artifacts.length
      }, 'Cast artifacts filtered');

      res.json({ artifacts });
    } catch (error) {
      const requestLogger = res.locals.logger || logger;
      requestLogger.error({ runId: req.params.runId, error }, "Error fetching workflow artifacts");
      res.status(500).json({ error: "Failed to fetch workflow artifacts" });
    }
  });

  app.get("/api/github/download-artifact/:runId/:artifactName", requireAuth, requireRepositoryAccess, async (req, res) => {
    try {
      const { runId, artifactName } = req.params;
      const requestLogger = res.locals.logger || logger;
      const githubToken = res.locals.githubToken;
      const githubService = getGitHubService(req.query, requestLogger, githubToken);

      if (!runId || isNaN(parseInt(runId, 10))) {
        return res.status(400).json({ error: "Invalid run ID parameter" });
      }

      if (!artifactName) {
        return res.status(400).json({ error: "Artifact name is required" });
      }

      const runIdNumber = parseInt(runId, 10);
      
      requestLogger.debug({ runId: runIdNumber, artifactName }, 'Initiating artifact download');
      const result = await githubService.downloadArtifact(artifactName, runIdNumber);

      if (!result) {
        requestLogger.warn({ runId: runIdNumber, artifactName }, 'Artifact download failed');
        return res.status(404).json({ error: "Artifact not found or failed to download" });
      }

      requestLogger.info({ runId: runIdNumber, artifactName }, 'Artifact download completed');
      res.json({ message: result });
    } catch (error) {
      const requestLogger = res.locals.logger || logger;
      requestLogger.error({ runId: req.params.runId, artifactName: req.params.artifactName, error }, "Error downloading artifact");
      res.status(500).json({ error: "Failed to download artifact" });
    }
  });

  app.get("/api/github/pull-requests/:commitSha", requireAuth, requireRepositoryAccess, async (req, res) => {
    try {
      const { commitSha } = req.params;
      const requestLogger = res.locals.logger || logger;
      const githubToken = res.locals.githubToken;
      const githubService = getGitHubService(req.query, requestLogger, githubToken);

      if (!commitSha) {
        return res.status(400).json({ error: "Commit SHA is required" });
      }

      requestLogger.debug({ commitSha: commitSha.substring(0, 7) }, 'Finding PRs associated with commit');
      const pullRequests = await githubService.getPullRequestsForCommit(commitSha);
      
      requestLogger.debug({
        commitSha: commitSha.substring(0, 7),
        prCount: pullRequests.length
      }, 'PRs found for commit');
      
      res.json({ pullRequests });
    } catch (error) {
      const requestLogger = res.locals.logger || logger;
      requestLogger.error({ commitSha: req.params.commitSha, error }, "Error fetching pull requests");
      res.status(500).json({ error: "Failed to fetch pull requests" });
    }
  });

  // Get review comments for a pull request
  app.get("/api/github/review-comments/:prNumber", requireAuth, requireRepositoryAccess, async (req, res) => {
    try {
      const { prNumber } = req.params;
      const requestLogger = res.locals.logger || logger;
      const githubToken = res.locals.githubToken;
      const githubService = getGitHubService(req.query, requestLogger, githubToken);

      if (!prNumber || isNaN(parseInt(prNumber, 10))) {
        return res.status(400).json({ error: "Invalid PR number parameter" });
      }

      const prNumberInt = parseInt(prNumber, 10);
      const comments = await githubService.getReviewComments(prNumberInt);

      res.json({ comments });
    } catch (error) {
      const requestLogger = res.locals.logger || logger;
      requestLogger.error({ prNumber: req.params.prNumber, error }, "Error fetching review comments");
      res.status(500).json({ error: "Failed to fetch review comments" });
    }
  });

  // Get cast file content from artifact (DEPRECATED - use cast-file-by-path instead)
  app.get("/api/github/cast-file/:artifactId", requireAuth, requireRepositoryAccess, async (req, res) => {
    const requestLogger = res.locals.logger || logger;
    requestLogger.warn({ artifactId: req.params.artifactId }, 'Deprecated endpoint accessed: /api/github/cast-file/:artifactId');
    
    res.setHeader('X-Deprecation-Warning', 'This endpoint is deprecated. Use /api/github/cast-file-by-path/:artifactId with ?path= query parameter.');
    res.setHeader('Sunset', new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()); // 90 days from now
    
    res.status(410).json({ 
      error: "This endpoint has been deprecated",
      deprecatedEndpoint: "/api/github/cast-file/:artifactId",
      replacementEndpoint: "/api/github/cast-file-by-path/:artifactId",
      replacementParams: "Add ?path= query parameter to specify the cast file path",
      sunsetDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
    });
  });

  

  // List all cast files in artifacts for a workflow run
  app.get("/api/github/cast-list/:runId", requireAuth, requireRepositoryAccess, async (req, res) => {
    try {
      const { runId } = req.params;
      const requestLogger = res.locals.logger || logger;
      const githubToken = res.locals.githubToken;
      const githubService = getGitHubService(req.query, requestLogger, githubToken);

      if (!runId || isNaN(parseInt(runId, 10))) {
        return res.status(400).json({ error: "Invalid run ID parameter" });
      }

      const runIdNumber = parseInt(runId, 10);
      
      // DEBUG: Log the run ID being requested
      requestLogger.info({ runId: runIdNumber }, 'Fetching cast list for workflow run');
      
      const allArtifacts = await githubService.getWorkflowRunArtifacts(runIdNumber);

      // DEBUG: Log all artifacts found
      requestLogger.info({
        runId: runIdNumber,
        allArtifactCount: allArtifacts.length,
        allArtifactIds: allArtifacts.map(a => ({ id: a.id, name: a.name }))
      }, 'All artifacts retrieved');

      // Filter for cast-related artifacts
      const castArtifacts = allArtifacts.filter((artifact) =>
        artifact.name.toLowerCase().includes('cast') ||
        artifact.name.toLowerCase().includes('asciinema') ||
        artifact.name.toLowerCase().includes('recording')
      );

      // DEBUG: Log filtered cast artifacts
      requestLogger.info({
        runId: runIdNumber,
        castArtifactCount: castArtifacts.length,
        castArtifactIds: castArtifacts.map(a => ({ id: a.id, name: a.name }))
      }, 'Cast-related artifacts filtered');

      // Get cast files from each artifact
      const castFilesPromises = castArtifacts.map(async (artifact) => {
        const files = await githubService.getCastFilesList(artifact.id);
        return {
          artifact_id: artifact.id,
          artifact_name: artifact.name,
          expired: artifact.expired,
          files
        };
      });

      const castFiles = await Promise.all(castFilesPromises);

      // DEBUG: Log final response
      requestLogger.info({
        runId: runIdNumber,
        castFilesCount: castFiles.length,
        responseArtifactIds: castFiles.map(cf => cf.artifact_id)
      }, 'Cast files response prepared');

      res.json({ castFiles });
    } catch (error) {
      const requestLogger = res.locals.logger || logger;
      requestLogger.error({ runId: req.params.runId, error }, "Error listing cast files");
      res.status(500).json({ error: "Failed to list cast files" });
    }
  });

  // Get specific cast file by path from artifact
  app.get("/api/github/cast-file-by-path/:artifactId", requireAuth, requireRepositoryAccess, async (req, res) => {
    try {
      const { artifactId } = req.params;
      const { path } = req.query;
      const requestLogger = res.locals.logger || logger;
      const githubToken = res.locals.githubToken;
      const githubService = getGitHubService(req.query, requestLogger, githubToken);

      if (!artifactId || isNaN(parseInt(artifactId, 10))) {
        return res.status(400).json({ error: "Invalid artifact ID parameter" });
      }

      if (!path || typeof path !== 'string') {
        return res.status(400).json({ error: "File path is required" });
      }

      const artifactIdNumber = parseInt(artifactId, 10);
      const content = await githubService.getCastFileByPath(artifactIdNumber, path);

      if (!content) {
        return res.status(404).json({ error: "Cast file not found" });
      }

      res.json({ content });
    } catch (error) {
      const requestLogger = res.locals.logger || logger;
      requestLogger.error({ artifactId: req.params.artifactId, path: req.query.path, error }, "Error fetching cast file by path");
      res.status(500).json({ error: "Failed to fetch cast file" });
    }
  });

  // Get files changed in a pull request
  app.get("/api/github/pr-files/:prNumber", requireAuth, requireRepositoryAccess, async (req, res) => {
    try {
      const { prNumber } = req.params;
      const requestLogger = res.locals.logger || logger;
      const githubToken = res.locals.githubToken;
      const githubService = getGitHubService(req.query, requestLogger, githubToken);

      if (!prNumber || isNaN(parseInt(prNumber, 10))) {
        return res.status(400).json({ error: "Invalid PR number parameter" });
      }

      const prNumberInt = parseInt(prNumber, 10);
      const files = await githubService.getPRFiles(prNumberInt);

      res.json({ files });
    } catch (error) {
      const requestLogger = res.locals.logger || logger;
      requestLogger.error({ prNumber: req.params.prNumber, error }, "Error fetching PR files");
      res.status(500).json({ error: "Failed to fetch PR files" });
    }
  });

  // List all tasks in a pull request
  app.get("/api/github/pr-tasks/:prNumber", requireAuth, requireRepositoryAccess, async (req, res) => {
    try {
      const { prNumber } = req.params;
      const requestLogger = res.locals.logger || logger;
      const githubToken = res.locals.githubToken;
      const githubService = getGitHubService(req.query, requestLogger, githubToken);

      if (!prNumber || isNaN(parseInt(prNumber, 10))) {
        return res.status(400).json({ error: "Invalid PR number parameter" });
      }

      const prNumberInt = parseInt(prNumber, 10);
      const tasks = await githubService.listPRTasks(prNumberInt);

      res.json({ tasks, total_count: tasks.length });
    } catch (error) {
      const requestLogger = res.locals.logger || logger;
      requestLogger.error({ prNumber: req.params.prNumber, error }, "Error fetching PR tasks");
      res.status(500).json({ error: "Failed to fetch PR tasks" });
    }
  });

  

  // Get specific file content from PR
  app.get("/api/github/pr-file-content/:prNumber", requireAuth, requireRepositoryAccess, async (req, res) => {
    try {
      const { prNumber } = req.params;
      const { path } = req.query;
      const requestLogger = res.locals.logger || logger;
      const githubToken = res.locals.githubToken;
      const githubService = getGitHubService(req.query, requestLogger, githubToken);

      if (!prNumber || isNaN(parseInt(prNumber, 10))) {
        return res.status(400).json({ error: "Invalid PR number parameter" });
      }

      if (!path || typeof path !== 'string') {
        return res.status(400).json({ error: "File path is required" });
      }

      const prNumberInt = parseInt(prNumber, 10);
      const content = await githubService.getPRFileContent(prNumberInt, path);

      if (!content) {
        return res.status(404).json({ error: "File not found" });
      }

      res.json({ content });
    } catch (error) {
      const requestLogger = res.locals.logger || logger;
      requestLogger.error({ prNumber: req.params.prNumber, path: req.query.path, error }, "Error fetching file content");
      res.status(500).json({ error: "Failed to fetch file content" });
    }
  });

  // Get commit details
  app.get("/api/github/commit/:commitSha", requireAuth, requireRepositoryAccess, async (req, res) => {
    try {
      const { commitSha } = req.params;
      const requestLogger = res.locals.logger || logger;
      const githubToken = res.locals.githubToken;
      const githubService = getGitHubService(req.query, requestLogger, githubToken);

      if (!commitSha) {
        return res.status(400).json({ error: "Commit SHA is required" });
      }

      const commitDetails = await githubService.getCommitDetails(commitSha);

      if (!commitDetails) {
        return res.status(404).json({ error: "Commit not found" });
      }

      res.json(commitDetails);
    } catch (error) {
      const requestLogger = res.locals.logger || logger;
      requestLogger.error({ commitSha: req.params.commitSha, error }, "Error fetching commit details");
      res.status(500).json({ error: "Failed to fetch commit details" });
    }
  });

  // Get commits for a pull request
  app.get("/api/github/pr-commits/:prNumber", requireAuth, requireRepositoryAccess, async (req, res) => {
    try {
      const { prNumber } = req.params;
      const requestLogger = res.locals.logger || logger;
      const githubToken = res.locals.githubToken;
      const githubService = getGitHubService(req.query, requestLogger, githubToken);

      if (!prNumber || isNaN(parseInt(prNumber, 10))) {
        return res.status(400).json({ error: "Invalid PR number parameter" });
      }

      const prNumberInt = parseInt(prNumber, 10);
      const commits = await githubService.getPRCommits(prNumberInt);

      res.json({ commits });
    } catch (error) {
      const requestLogger = res.locals.logger || logger;
      requestLogger.error({ prNumber: req.params.prNumber, error }, "Error fetching PR commits");
      res.status(500).json({ error: "Failed to fetch PR commits" });
    }
  });

  // Get jobs for a workflow run
  app.get("/api/github/workflow-jobs/:runId", requireAuth, requireRepositoryAccess, async (req, res) => {
    try {
      const { runId } = req.params;
      const requestLogger = res.locals.logger || logger;
      const githubToken = res.locals.githubToken;
      const githubService = getGitHubService(req.query, requestLogger, githubToken);

      if (!runId || isNaN(parseInt(runId, 10))) {
        return res.status(400).json({ error: "Invalid run ID parameter" });
      }

      const runIdNumber = parseInt(runId, 10);
      const jobs = await githubService.getWorkflowJobs(runIdNumber);

      res.json({ jobs });
    } catch (error) {
      const requestLogger = res.locals.logger || logger;
      requestLogger.error({ runId: req.params.runId, error }, "Error fetching workflow jobs");
      res.status(500).json({ error: "Failed to fetch workflow jobs" });
    }
  });

  // Get agent test results for a workflow run
  app.get("/api/github/agent-test-results/:runId", requireAuth, requireRepositoryAccess, async (req, res) => {
    try {
      const { runId } = req.params;
      const requestLogger = res.locals.logger || logger;
      const githubToken = res.locals.githubToken;
      const githubService = getGitHubService(req.query, requestLogger, githubToken);

      if (!runId || isNaN(parseInt(runId, 10))) {
        return res.status(400).json({ error: "Invalid run ID parameter" });
      }

      const runIdNumber = parseInt(runId, 10);

      requestLogger.info({ runId: runIdNumber }, 'Fetching agent test results for workflow run');

      const agentResults = await githubService.getAgentTestResults(runIdNumber);

      requestLogger.info({
        runId: runIdNumber,
        agentCount: Object.keys(agentResults).length,
        totalResults: Object.values(agentResults).flat().length
      }, 'Agent test results retrieved successfully');

      res.json({ agentResults });
    } catch (error) {
      const requestLogger = res.locals.logger || logger;
      requestLogger.error({ runId: req.params.runId, error }, "Error fetching agent test results");
      res.status(500).json({ error: "Failed to fetch agent test results" });
    }
  });

  // Get log files from artifact
  app.get("/api/github/artifact-logs/:artifactId", requireAuth, requireRepositoryAccess, async (req, res) => {
    try {
      const { artifactId } = req.params;
      const requestLogger = res.locals.logger || logger;
      const githubToken = res.locals.githubToken;
      const githubService = getGitHubService(req.query, requestLogger, githubToken);

      if (!artifactId || isNaN(parseInt(artifactId, 10))) {
        return res.status(400).json({ error: "Invalid artifact ID parameter" });
      }

      const artifactIdNumber = parseInt(artifactId, 10);
      const logFiles = await githubService.getArtifactLogFiles(artifactIdNumber);

      res.json({ logFiles });
    } catch (error) {
      const requestLogger = res.locals.logger || logger;
      requestLogger.error({ artifactId: req.params.artifactId, error }, "Error extracting log files");
      res.status(500).json({ error: "Failed to extract log files" });
    }
  });

  // Get specific log file content from artifact
  app.get("/api/github/artifact-log-content/:artifactId", requireAuth, requireRepositoryAccess, async (req, res) => {
    try {
      const { artifactId } = req.params;
      const { path } = req.query;
      const requestLogger = res.locals.logger || logger;
      const githubToken = res.locals.githubToken;
      const githubService = getGitHubService(req.query, requestLogger, githubToken);

      if (!artifactId || isNaN(parseInt(artifactId, 10))) {
        return res.status(400).json({ error: "Invalid artifact ID parameter" });
      }

      if (!path || typeof path !== 'string') {
        return res.status(400).json({ error: "File path is required" });
      }

      const artifactIdNumber = parseInt(artifactId, 10);
      const content = await githubService.getArtifactLogContent(artifactIdNumber, path);

      if (!content) {
        return res.status(404).json({ error: "Log file not found" });
      }

      res.json({ content });
    } catch (error) {
      const requestLogger = res.locals.logger || logger;
      requestLogger.error({ artifactId: req.params.artifactId, path: req.query.path, error }, "Error reading log file");
      res.status(500).json({ error: "Failed to read log file" });
    }
  });

  // Get review comments for a workflow run
  app.get("/api/github/review-comments-for-run/:runId", requireAuth, requireRepositoryAccess, async (req, res) => {
    try {
      const { runId } = req.params;
      const requestLogger = res.locals.logger || logger;
      const githubToken = res.locals.githubToken;
      const githubService = getGitHubService(req.query, requestLogger, githubToken);

      if (!runId || isNaN(parseInt(runId, 10))) {
        return res.status(400).json({ error: "Invalid run ID parameter" });
      }

      const runIdNumber = parseInt(runId, 10);
      const comments = await githubService.getReviewCommentsForRun(runIdNumber);

      res.json({ comments });
    } catch (error) {
      const requestLogger = res.locals.logger || logger;
      requestLogger.error({ runId: req.params.runId, error }, "Error fetching review comments for run");
      res.status(500).json({ error: "Failed to fetch review comments for run" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}