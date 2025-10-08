import type { Express } from "express";
import { createServer, type Server } from "http";
import type { Logger } from "pino";
import { GitHubCliService } from "./services/githubCliService";

export async function registerRoutes(app: Express, logger: Logger): Promise<Server> {
  // Helper to create service instance with query params
  const getGitHubService = (query: any, requestLogger?: Logger) => {
    const owner = typeof query.owner === 'string' ? query.owner : undefined;
    const repo = typeof query.repo === 'string' ? query.repo : undefined;
    const workflow = typeof query.workflow === 'string' ? query.workflow : undefined;
    return new GitHubCliService(owner, repo, workflow, requestLogger || logger);
  };

  // ============= GITHUB API ROUTES =============

  // Get repository statistics (PR counts by state)
  app.get("/api/github/repo-stats/:owner/:repo", async (req, res) => {
    try {
      const { owner, repo } = req.params;
      const requestLogger = res.locals.logger || logger;
      const githubService = new GitHubCliService(owner, repo, undefined, requestLogger);
      
      const stats = await githubService.getRepositoryStats();
      res.json(stats);
    } catch (error) {
      const requestLogger = res.locals.logger || logger;
      requestLogger.error({ owner: req.params.owner, repo: req.params.repo, error }, "Error fetching repository stats");
      res.status(500).json({ error: "Failed to fetch repository stats" });
    }
  });

  // List pull requests with filters
  app.get("/api/github/pull-requests", async (req, res) => {
    try {
      const { state, limit, sort, direction } = req.query;
      const requestLogger = res.locals.logger || logger;
      const githubService = getGitHubService(req.query, requestLogger);
      
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
  app.get("/api/github/pull-request/:prNumber", async (req, res) => {
    try {
      const { prNumber } = req.params;
      const githubService = getGitHubService(req.query);
      
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
  app.get("/api/github/pr-workflow-runs/:prNumber", async (req, res) => {
    try {
      const { prNumber } = req.params;
      const { limit } = req.query;
      const requestLogger = res.locals.logger || logger;
      const githubService = getGitHubService(req.query, requestLogger);
      
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
  app.get("/api/github/pr-bot-comments/:prNumber", async (req, res) => {
    try {
      const { prNumber } = req.params;
      const githubService = getGitHubService(req.query);
      
      if (!prNumber || isNaN(parseInt(prNumber, 10))) {
        return res.status(400).json({ error: "Invalid PR number parameter" });
      }

      const prNumberInt = parseInt(prNumber, 10);
      const comments = await githubService.getWorkflowBotComments(prNumberInt);
      
      res.json({ comments });
    } catch (error) {
      console.error("Error fetching workflow bot comments:", error);
      res.status(500).json({ error: "Failed to fetch workflow bot comments" });
    }
  });

  // Get GitHub workflow hierarchy (kept for backwards compatibility)
  app.get("/api/github/hierarchy", async (req, res) => {
    try {
      const { limit } = req.query;
      const githubService = getGitHubService(req.query);
      const limitNumber = limit && typeof limit === 'string' ? parseInt(limit, 10) : 30;
      
      if (isNaN(limitNumber) || limitNumber < 1 || limitNumber > 100) {
        return res.status(400).json({ error: "Invalid limit parameter (must be 1-100)" });
      }

      const hierarchy = await githubService.getHierarchy(limitNumber);
      res.json(hierarchy);
    } catch (error) {
      console.error("Error fetching GitHub hierarchy:", error);
      res.status(500).json({ error: "Failed to fetch GitHub workflow hierarchy" });
    }
  });

  // Get specific workflow run details with logs and artifacts
  app.get("/api/github/workflow-run/:runId", async (req, res) => {
    try {
      const { runId } = req.params;
      const githubService = getGitHubService(req.query);
      
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
      console.error("Error fetching workflow run details:", error);
      res.status(500).json({ error: "Failed to fetch workflow run details" });
    }
  });

  // Get workflow run logs
  app.get("/api/github/workflow-logs/:runId", async (req, res) => {
    try {
      const { runId } = req.params;
      const githubService = getGitHubService(req.query);
      
      if (!runId || isNaN(parseInt(runId, 10))) {
        return res.status(400).json({ error: "Invalid run ID parameter" });
      }

      const runIdNumber = parseInt(runId, 10);
      const logs = await githubService.getWorkflowRunLogs(runIdNumber);
      
      res.json({ logs });
    } catch (error) {
      console.error("Error fetching workflow logs:", error);
      res.status(500).json({ error: "Failed to fetch workflow logs" });
    }
  });

  // Get workflow run artifacts (specifically cast files)
  app.get("/api/github/workflow-artifacts/:runId", async (req, res) => {
    try {
      const { runId } = req.params;
      const githubService = getGitHubService(req.query);
      
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
      console.error("Error fetching workflow artifacts:", error);
      res.status(500).json({ error: "Failed to fetch workflow artifacts" });
    }
  });

  // Download specific artifact
  app.get("/api/github/download-artifact/:runId/:artifactName", async (req, res) => {
    try {
      const { runId, artifactName } = req.params;
      const githubService = getGitHubService(req.query);
      
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
      console.error("Error downloading artifact:", error);
      res.status(500).json({ error: "Failed to download artifact" });
    }
  });

  // Get pull requests for a commit SHA
  app.get("/api/github/pull-requests/:commitSha", async (req, res) => {
    try {
      const { commitSha } = req.params;
      const githubService = getGitHubService(req.query);
      
      if (!commitSha) {
        return res.status(400).json({ error: "Commit SHA is required" });
      }

      const pullRequests = await githubService.getPullRequestsForCommit(commitSha);
      res.json({ pullRequests });
    } catch (error) {
      console.error("Error fetching pull requests:", error);
      res.status(500).json({ error: "Failed to fetch pull requests" });
    }
  });

  // Get review comments for a pull request
  app.get("/api/github/review-comments/:prNumber", async (req, res) => {
    try {
      const { prNumber } = req.params;
      const githubService = getGitHubService(req.query);
      
      if (!prNumber || isNaN(parseInt(prNumber, 10))) {
        return res.status(400).json({ error: "Invalid PR number parameter" });
      }

      const prNumberInt = parseInt(prNumber, 10);
      const comments = await githubService.getReviewComments(prNumberInt);
      
      res.json({ comments });
    } catch (error) {
      console.error("Error fetching review comments:", error);
      res.status(500).json({ error: "Failed to fetch review comments" });
    }
  });

  // Get cast file content from artifact (DEPRECATED - use cast-file-by-path instead)
  app.get("/api/github/cast-file/:artifactId", async (req, res) => {
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
  app.get("/api/github/cast-list/:runId", async (req, res) => {
    try {
      const { runId } = req.params;
      const githubService = getGitHubService(req.query);
      
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
      console.error("Error listing cast files:", error);
      res.status(500).json({ error: "Failed to list cast files" });
    }
  });

  // Get specific cast file by path from artifact
  app.get("/api/github/cast-file-by-path/:artifactId", async (req, res) => {
    try {
      const { artifactId } = req.params;
      const { path } = req.query;
      const githubService = getGitHubService(req.query);
      
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
  app.get("/api/github/pr-files/:prNumber", async (req, res) => {
    try {
      const { prNumber } = req.params;
      const githubService = getGitHubService(req.query);
      
      if (!prNumber || isNaN(parseInt(prNumber, 10))) {
        return res.status(400).json({ error: "Invalid PR number parameter" });
      }

      const prNumberInt = parseInt(prNumber, 10);
      const files = await githubService.getPRFiles(prNumberInt);
      
      res.json({ files });
    } catch (error) {
      console.error("Error fetching PR files:", error);
      res.status(500).json({ error: "Failed to fetch PR files" });
    }
  });

  // List all tasks in a pull request
  app.get("/api/github/pr-tasks/:prNumber", async (req, res) => {
    try {
      const { prNumber } = req.params;
      const githubService = getGitHubService(req.query);
      
      if (!prNumber || isNaN(parseInt(prNumber, 10))) {
        return res.status(400).json({ error: "Invalid PR number parameter" });
      }

      const prNumberInt = parseInt(prNumber, 10);
      const tasks = await githubService.listPRTasks(prNumberInt);
      
      res.json({ tasks, total_count: tasks.length });
    } catch (error) {
      console.error("Error fetching PR tasks:", error);
      res.status(500).json({ error: "Failed to fetch PR tasks" });
    }
  });

  

  // Get specific file content from PR
  app.get("/api/github/pr-file-content/:prNumber", async (req, res) => {
    try {
      const { prNumber } = req.params;
      const { path } = req.query;
      const githubService = getGitHubService(req.query);
      
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
      console.error("Error fetching file content:", error);
      res.status(500).json({ error: "Failed to fetch file content" });
    }
  });

  // Get commit details
  app.get("/api/github/commit/:commitSha", async (req, res) => {
    try {
      const { commitSha } = req.params;
      const githubService = getGitHubService(req.query);
      
      if (!commitSha) {
        return res.status(400).json({ error: "Commit SHA is required" });
      }

      const commitDetails = await githubService.getCommitDetails(commitSha);
      
      if (!commitDetails) {
        return res.status(404).json({ error: "Commit not found" });
      }

      res.json(commitDetails);
    } catch (error) {
      console.error("Error fetching commit details:", error);
      res.status(500).json({ error: "Failed to fetch commit details" });
    }
  });

  // Get commits for a pull request
  app.get("/api/github/pr-commits/:prNumber", async (req, res) => {
    try {
      const { prNumber } = req.params;
      const githubService = getGitHubService(req.query);
      
      if (!prNumber || isNaN(parseInt(prNumber, 10))) {
        return res.status(400).json({ error: "Invalid PR number parameter" });
      }

      const prNumberInt = parseInt(prNumber, 10);
      const commits = await githubService.getPRCommits(prNumberInt);
      
      res.json({ commits });
    } catch (error) {
      console.error("Error fetching PR commits:", error);
      res.status(500).json({ error: "Failed to fetch PR commits" });
    }
  });

  // Get jobs for a workflow run
  app.get("/api/github/workflow-jobs/:runId", async (req, res) => {
    try {
      const { runId } = req.params;
      const githubService = getGitHubService(req.query);
      
      if (!runId || isNaN(parseInt(runId, 10))) {
        return res.status(400).json({ error: "Invalid run ID parameter" });
      }

      const runIdNumber = parseInt(runId, 10);
      const jobs = await githubService.getWorkflowJobs(runIdNumber);
      
      res.json({ jobs });
    } catch (error) {
      console.error("Error fetching workflow jobs:", error);
      res.status(500).json({ error: "Failed to fetch workflow jobs" });
    }
  });

  // Get log files from artifact
  app.get("/api/github/artifact-logs/:artifactId", async (req, res) => {
    try {
      const { artifactId } = req.params;
      const githubService = getGitHubService(req.query);
      
      if (!artifactId || isNaN(parseInt(artifactId, 10))) {
        return res.status(400).json({ error: "Invalid artifact ID parameter" });
      }

      const artifactIdNumber = parseInt(artifactId, 10);
      const logFiles = await githubService.getArtifactLogFiles(artifactIdNumber);
      
      res.json({ logFiles });
    } catch (error) {
      console.error("Error extracting log files:", error);
      res.status(500).json({ error: "Failed to extract log files" });
    }
  });

  // Get specific log file content from artifact
  app.get("/api/github/artifact-log-content/:artifactId", async (req, res) => {
    try {
      const { artifactId } = req.params;
      const { path } = req.query;
      const githubService = getGitHubService(req.query);
      
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
      console.error("Error reading log file:", error);
      res.status(500).json({ error: "Failed to read log file" });
    }
  });

  // Get review comments for a workflow run
  app.get("/api/github/review-comments-for-run/:runId", async (req, res) => {
    try {
      const { runId } = req.params;
      const githubService = getGitHubService(req.query);
      
      if (!runId || isNaN(parseInt(runId, 10))) {
        return res.status(400).json({ error: "Invalid run ID parameter" });
      }

      const runIdNumber = parseInt(runId, 10);
      const comments = await githubService.getReviewCommentsForRun(runIdNumber);
      
      res.json({ comments });
    } catch (error) {
      console.error("Error fetching review comments for run:", error);
      res.status(500).json({ error: "Failed to fetch review comments for run" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}