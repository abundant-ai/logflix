import type { Express } from "express";
import { createServer, type Server } from "http";
import type { Logger } from "pino";
import { GitHubCliService } from "@logflix/github-client";
import { requireAuth, requireAdmin, requireRepositoryAccess } from "./middleware/auth";
import { clerkClient } from "@clerk/express";
import { UserRole, UserMetadata, AuthContext, canAccessRepository } from "@logflix/shared/auth";

export async function registerRoutes(app: Express, logger: Logger): Promise<Server> {
  // Helper to create service instance with query params
  const getGitHubService = (query: any, requestLogger?: Logger, githubToken?: string) => {
    const owner = typeof query.owner === 'string' ? query.owner : undefined;
    const repo = typeof query.repo === 'string' ? query.repo : undefined;
    const workflow = typeof query.workflow === 'string' ? query.workflow : undefined;
    return new GitHubCliService(owner, repo, workflow, requestLogger || logger, githubToken);
  };

  // ============= USER & PERMISSIONS API ROUTES =============

  // Get current user's permissions and role
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

  // Get accessible repositories for the current user
  app.get("/api/user/repositories", requireAuth, async (req, res) => {
    try {
      const authContext = res.locals.auth as AuthContext;
      const requestLogger = res.locals.logger || logger;

      // Import repository configuration from shared config
      const { REPOSITORIES, ORGANIZATION } = await import("@logflix/shared/config");

      requestLogger.info({
        userId: authContext.userId,
        role: authContext.role,
        assignedRepos: authContext.assignedRepositories,
      }, "Fetching accessible repositories for user");

      // If admin, return all repositories
      if (authContext.role === UserRole.ADMIN) {
        requestLogger.info("Admin user - returning all repositories");
        res.json({
          hasAllAccess: true,
          organization: ORGANIZATION,
          repositories: REPOSITORIES,
        });
      } else {
        // For members, return only their assigned repositories
        const accessibleRepos = REPOSITORIES.filter(repo => {
          // Check if repo.name matches any assigned repository
          // Support both "owner/repo" and "repo" formats
          return authContext.assignedRepositories.some(assigned => {
            const assignedName = assigned.includes('/') ? assigned.split('/')[1] : assigned;
            return assigned === repo.name || assignedName === repo.name;
          });
        });

        requestLogger.info({
          assignedCount: authContext.assignedRepositories.length,
          filteredCount: accessibleRepos.length,
        }, "Member user - returning assigned repositories");

        res.json({
          hasAllAccess: false,
          organization: ORGANIZATION,
          repositories: accessibleRepos,
        });
      }
    } catch (error) {
      const requestLogger = res.locals.logger || logger;
      requestLogger.error({ error }, "Error fetching accessible repositories");
      res.status(500).json({ error: "Failed to fetch accessible repositories" });
    }
  });

  // ============= ADMIN API ROUTES =============

  // List all users (admin only)
  app.get("/api/admin/users", requireAuth, requireAdmin, async (req, res) => {
    try {
      const client = clerkClient;
      const usersResponse = await client.users.getUserList({
        limit: 100,
      });

      const users = usersResponse.data.map((user) => {
        const metadata = (user.publicMetadata || {}) as UserMetadata;
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

  // Update user role (admin only)
  app.patch("/api/admin/users/:userId/role", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const { role } = req.body;

      if (!role || (role !== UserRole.ADMIN && role !== UserRole.MEMBER)) {
        return res.status(400).json({ error: "Invalid role. Must be 'admin' or 'member'" });
      }

      const client = clerkClient;
      const user = await client.users.getUser(userId);
      const metadata = (user.publicMetadata || {}) as UserMetadata;

      // Update role in public metadata
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

  // Update user's assigned repositories (admin only)
  app.patch("/api/admin/users/:userId/repositories", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const { repositories } = req.body;

      if (!Array.isArray(repositories)) {
        return res.status(400).json({ error: "Repositories must be an array" });
      }

      // Validate repository format (owner/repo)
      const isValid = repositories.every((repo) => {
        const parts = repo.split('/');
        return parts.length === 2 && parts[0] && parts[1];
      });

      if (!isValid) {
        return res.status(400).json({ error: "Invalid repository format. Use 'owner/repo'" });
      }

      const client = clerkClient;
      const user = await client.users.getUser(userId);
      const metadata = (user.publicMetadata || {}) as UserMetadata;

      // Update assigned repositories
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
  // All routes below require authentication and repository access

  // Get repository statistics (PR counts by state)
  app.get("/api/github/repo-stats/:owner/:repo", requireAuth, requireRepositoryAccess, async (req, res) => {
    try {
      const { owner, repo } = req.params;
      const requestLogger = res.locals.logger || logger;
      const githubToken = res.locals.githubToken;
      const githubService = new GitHubCliService(owner, repo, undefined, requestLogger, githubToken);

      const stats = await githubService.getRepositoryStats();
      res.json(stats);
    } catch (error) {
      const requestLogger = res.locals.logger || logger;
      requestLogger.error({ owner: req.params.owner, repo: req.params.repo, error }, "Error fetching repository stats");
      res.status(500).json({ error: "Failed to fetch repository stats" });
    }
  });

  // List pull requests with filters
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

      const pullRequests = await githubService.listPullRequests(stateValue, limitNumber, sortValue, directionValue);
      res.json({ pullRequests, total_count: pullRequests.length });
    } catch (error) {
      const requestLogger = res.locals.logger || logger;
      requestLogger.error({ query: req.query, error }, "Error fetching pull requests");
      res.status(500).json({ error: "Failed to fetch pull requests" });
    }
  });

  // Get a specific pull request
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
      const pullRequest = await githubService.getPullRequest(prNumberInt);

      if (!pullRequest) {
        return res.status(404).json({ error: "Pull request not found" });
      }

      res.json(pullRequest);
    } catch (error) {
      const requestLogger = res.locals.logger || logger;
      requestLogger.error({ prNumber: req.params.prNumber, error }, "Error fetching pull request");
      res.status(500).json({ error: "Failed to fetch pull request" });
    }
  });

  // Get workflow runs for a pull request
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

      const runs = await githubService.getWorkflowRunsForPR(prNumberInt, limitNumber);
      res.json({ runs, total_count: runs.length });
    } catch (error) {
      const requestLogger = res.locals.logger || logger;
      requestLogger.error({ prNumber: req.params.prNumber, error }, "Error fetching workflow runs for PR");
      res.status(500).json({ error: "Failed to fetch workflow runs for PR" });
    }
  });

  // Get workflow bot comments for a pull request
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
      const comments = await githubService.getWorkflowBotComments(prNumberInt);

      res.json({ comments });
    } catch (error) {
      const requestLogger = res.locals.logger || logger;
      requestLogger.error({ prNumber: req.params.prNumber, error }, "Error fetching workflow bot comments");
      res.status(500).json({ error: "Failed to fetch workflow bot comments" });
    }
  });

  // Get GitHub workflow hierarchy (kept for backwards compatibility)
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

      const hierarchy = await githubService.getHierarchy(limitNumber);
      res.json(hierarchy);
    } catch (error) {
      const requestLogger = res.locals.logger || logger;
      requestLogger.error({ query: req.query, error }, "Error fetching GitHub hierarchy");
      res.status(500).json({ error: "Failed to fetch GitHub workflow hierarchy" });
    }
  });

  // Get specific workflow run details with logs and artifacts
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

      // Fetch workflow run, logs, and artifacts in parallel
      const [workflowRun, logs, artifacts] = await Promise.allSettled([
        githubService.getWorkflowRun(runIdNumber),
        githubService.getWorkflowRunLogs(runIdNumber),
        githubService.getWorkflowRunArtifacts(runIdNumber),
      ]);

      const run = workflowRun.status === 'fulfilled' ? workflowRun.value : null;

      if (!run) {
        return res.status(404).json({ error: "Workflow run not found" });
      }

      const response = {
        run,
        logs: logs.status === 'fulfilled' ? logs.value : [],
        artifacts: artifacts.status === 'fulfilled' ? artifacts.value : [],
        hasData: (logs.status === 'fulfilled' && logs.value.length > 0) ||
                 (artifacts.status === 'fulfilled' && artifacts.value.length > 0),
      };

      res.json(response);
    } catch (error) {
      const requestLogger = res.locals.logger || logger;
      requestLogger.error({ runId: req.params.runId, error }, "Error fetching workflow run details");
      res.status(500).json({ error: "Failed to fetch workflow run details" });
    }
  });

  // Get workflow run logs
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
      const logs = await githubService.getWorkflowRunLogs(runIdNumber);

      res.json({ logs });
    } catch (error) {
      const requestLogger = res.locals.logger || logger;
      requestLogger.error({ runId: req.params.runId, error }, "Error fetching workflow logs");
      res.status(500).json({ error: "Failed to fetch workflow logs" });
    }
  });

  // Get workflow run artifacts (specifically cast files)
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
      const allArtifacts = await githubService.getWorkflowRunArtifacts(runIdNumber);

      // Filter for cast files
      const artifacts = allArtifacts.filter((artifact: any) =>
        artifact.name.toLowerCase().includes('cast') ||
        artifact.name.toLowerCase().includes('asciinema') ||
        artifact.name.toLowerCase().includes('recording')
      );

      res.json({ artifacts });
    } catch (error) {
      const requestLogger = res.locals.logger || logger;
      requestLogger.error({ runId: req.params.runId, error }, "Error fetching workflow artifacts");
      res.status(500).json({ error: "Failed to fetch workflow artifacts" });
    }
  });

  // Download specific artifact
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
      const result = await githubService.downloadArtifact(artifactName, runIdNumber);

      if (!result) {
        return res.status(404).json({ error: "Artifact not found or failed to download" });
      }

      res.json({ message: result });
    } catch (error) {
      const requestLogger = res.locals.logger || logger;
      requestLogger.error({ runId: req.params.runId, artifactName: req.params.artifactName, error }, "Error downloading artifact");
      res.status(500).json({ error: "Failed to download artifact" });
    }
  });

  // Get pull requests for a commit SHA
  app.get("/api/github/pull-requests/:commitSha", requireAuth, requireRepositoryAccess, async (req, res) => {
    try {
      const { commitSha } = req.params;
      const requestLogger = res.locals.logger || logger;
      const githubToken = res.locals.githubToken;
      const githubService = getGitHubService(req.query, requestLogger, githubToken);

      if (!commitSha) {
        return res.status(400).json({ error: "Commit SHA is required" });
      }

      const pullRequests = await githubService.getPullRequestsForCommit(commitSha);
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
      const allArtifacts = await githubService.getWorkflowRunArtifacts(runIdNumber);

      // Filter for cast-related artifacts
      const castArtifacts = allArtifacts.filter((artifact: any) =>
        artifact.name.toLowerCase().includes('cast') ||
        artifact.name.toLowerCase().includes('asciinema') ||
        artifact.name.toLowerCase().includes('recording')
      );

      // Get cast files from each artifact
      const castFilesPromises = castArtifacts.map(async (artifact: any) => {
        const files = await githubService.getCastFilesList(artifact.id);
        return {
          artifact_id: artifact.id,
          artifact_name: artifact.name,
          expired: artifact.expired,
          files
        };
      });

      const castFiles = await Promise.all(castFilesPromises);

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