import type { Express } from "express";
import { createServer, type Server } from "http";
import { S3Service } from "./services/s3Service";
import { GitHubService } from "./services/githubService";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  const s3Service = new S3Service();
  const githubService = new GitHubService();

  // Get S3 hierarchy (dates -> tasks -> models)
  app.get("/api/hierarchy", async (req, res) => {
    try {
      const hierarchy = await s3Service.getHierarchy();
      res.json(hierarchy);
    } catch (error) {
      console.error("Error fetching hierarchy:", error);
      res.status(500).json({ error: "Failed to fetch S3 hierarchy" });
    }
  });

  // Get specific task run data
  app.get("/api/task-run/:date/:taskId/:modelName", async (req, res) => {
    try {
      const { date, taskId, modelName } = req.params;
      
      if (!date || !taskId || !modelName) {
        return res.status(400).json({ error: "Missing required parameters" });
      }

      const taskRun = await s3Service.getTaskRun(date, taskId, modelName);
      
      if (!taskRun) {
        return res.status(404).json({ error: "Task run not found" });
      }

      res.json(taskRun);
    } catch (error) {
      console.error("Error fetching task run:", error);
      res.status(500).json({ error: "Failed to fetch task run data" });
    }
  });

  // Get task metadata (task.yaml) for task-level view
  app.get("/api/task-yaml/:date/:taskId", async (req, res) => {
    try {
      const { date, taskId } = req.params;
      
      if (!date || !taskId) {
        return res.status(400).json({ error: "Missing required parameters" });
      }

      const taskYaml = await s3Service.getTaskYaml(date, taskId);
      
      if (!taskYaml) {
        return res.status(404).json({ error: "Task metadata not found" });
      }

      res.json(taskYaml);
    } catch (error) {
      console.error("Error fetching task metadata:", error);
      res.status(500).json({ error: "Failed to fetch task metadata" });
    }
  });

  // Download specific file
  app.get("/api/download", async (req, res) => {
    try {
      const { path } = req.query;
      
      if (!path || typeof path !== "string") {
        return res.status(400).json({ error: "Missing file path" });
      }

      const content = await s3Service.downloadFile(path);
      
      // Set appropriate headers based on file type
      const filename = path.split('/').pop() || 'download';
      const extension = filename.split('.').pop()?.toLowerCase();
      
      let contentType = 'application/octet-stream';
      if (extension === 'json') contentType = 'application/json';
      else if (extension === 'yaml' || extension === 'yml') contentType = 'text/yaml';
      else if (extension === 'cast') contentType = 'application/json';
      else if (extension === 'check' || extension === 'debug') contentType = 'text/plain';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(content);
    } catch (error) {
      console.error("Error downloading file:", error);
      res.status(500).json({ error: "Failed to download file" });
    }
  });

  // Search tasks
  app.get("/api/search", async (req, res) => {
    try {
      const { q, difficulty, model } = req.query;
      
      // For now, return the full hierarchy and let frontend filter
      // In a real implementation, you'd implement server-side filtering
      const hierarchy = await s3Service.getHierarchy();
      
      // Basic filtering logic
      let filteredHierarchy = hierarchy;
      
      if (difficulty && typeof difficulty === 'string') {
        // This would require fetching task.yaml files to filter by difficulty
        // For now, return unfiltered results
      }
      
      if (q && typeof q === 'string') {
        // Filter tasks and models by search query
        filteredHierarchy = {
          dates: hierarchy.dates.map(date => ({
            ...date,
            tasks: date.tasks.filter(task => 
              task.taskId.toLowerCase().includes(q.toLowerCase()) ||
              task.models.some(model => model.modelName.toLowerCase().includes(q.toLowerCase()))
            ).map(task => ({
              ...task,
              models: task.models.filter(model => 
                model.modelName.toLowerCase().includes(q.toLowerCase()) ||
                task.taskId.toLowerCase().includes(q.toLowerCase())
              )
            }))
          })).filter(date => date.tasks.length > 0)
        };
      }
      
      res.json(filteredHierarchy);
    } catch (error) {
      console.error("Error searching:", error);
      res.status(500).json({ error: "Search failed" });
    }
  });

  // Get post-test file content
  app.get("/api/post-test/:date/:taskId/:modelName", async (req, res) => {
    try {
      const { date, taskId, modelName } = req.params;
      
      const postTestContent = await s3Service.getPostTestFile(date, taskId, modelName);
      
      if (postTestContent === null) {
        return res.status(404).json({ error: "Post-test file not found" });
      }
      
      res.json({ content: postTestContent });
    } catch (error) {
      console.error("Error fetching post-test file:", error);
      res.status(500).json({ error: "Failed to fetch post-test file" });
    }
  });

  // ============= GITHUB API ROUTES =============

  // Get GitHub workflow hierarchy
  app.get("/api/github/hierarchy", async (req, res) => {
    try {
      const { limit } = req.query;
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
      
      if (!runId || isNaN(parseInt(runId, 10))) {
        return res.status(400).json({ error: "Invalid run ID parameter" });
      }

      const runIdNumber = parseInt(runId, 10);
      
      // Fetch workflow run, logs, and artifacts in parallel
      const [workflowRun, logs, artifacts] = await Promise.allSettled([
        githubService.getWorkflowRun(runIdNumber),
        githubService.getWorkflowRunLogs(runIdNumber),
        githubService.getCastArtifacts(runIdNumber),
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
      
      if (!runId || isNaN(parseInt(runId, 10))) {
        return res.status(400).json({ error: "Invalid run ID parameter" });
      }

      const runIdNumber = parseInt(runId, 10);
      const artifacts = await githubService.getCastArtifacts(runIdNumber);
      
      res.json({ artifacts });
    } catch (error) {
      console.error("Error fetching workflow artifacts:", error);
      res.status(500).json({ error: "Failed to fetch workflow artifacts" });
    }
  });

  // Download specific artifact
  app.get("/api/github/download-artifact/:artifactId", async (req, res) => {
    try {
      const { artifactId } = req.params;
      
      if (!artifactId || isNaN(parseInt(artifactId, 10))) {
        return res.status(400).json({ error: "Invalid artifact ID parameter" });
      }

      const artifactIdNumber = parseInt(artifactId, 10);
      const content = await githubService.downloadArtifact(artifactIdNumber);
      
      if (!content) {
        return res.status(404).json({ error: "Artifact not found or expired" });
      }

      // Set appropriate headers for artifact download
      const filename = `artifact_${artifactIdNumber}.zip`;
      
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', content.byteLength.toString());
      
      // Convert ArrayBuffer to Buffer for Express response
      const buffer = Buffer.from(content);
      res.send(buffer);
    } catch (error) {
      console.error("Error downloading artifact:", error);
      res.status(500).json({ error: "Failed to download artifact" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
