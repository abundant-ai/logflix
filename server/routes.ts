import type { Express } from "express";
import { createServer, type Server } from "http";
import { S3Service } from "./services/s3Service";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  const s3Service = new S3Service();

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

  const httpServer = createServer(app);
  return httpServer;
}
