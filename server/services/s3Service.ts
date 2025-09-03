import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { S3Hierarchy, TaskRun, TaskYaml, ResultsJson } from "@shared/schema";
import * as yaml from "js-yaml";

export class S3Service {
  private s3Client: S3Client;
  private bucketName = "t-bench-mam";
  private basePath = "tb-2.0-audit";

  constructor() {
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || "us-west-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
      },
    });
  }

  async getHierarchy(): Promise<S3Hierarchy> {
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: `${this.basePath}/`,
        Delimiter: "/",
      });

      const response = await this.s3Client.send(command);
      const dates: S3Hierarchy["dates"] = [];

      if (response.CommonPrefixes) {
        for (const prefix of response.CommonPrefixes) {
          if (!prefix.Prefix) continue;
          
          const datePath = prefix.Prefix.replace(`${this.basePath}/`, "").replace("/", "");
          const tasks = await this.getTasksForDate(datePath);
          
          dates.push({
            date: datePath,
            tasks,
          });
        }
      }

      return { dates };
    } catch (error) {
      console.error("Error fetching S3 hierarchy:", error);
      return { dates: [] };
    }
  }

  private async getTasksForDate(date: string) {
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: `${this.basePath}/${date}/`,
        Delimiter: "/",
      });

      const response = await this.s3Client.send(command);
      const tasks: any[] = [];

      if (response.CommonPrefixes) {
        for (const prefix of response.CommonPrefixes) {
          if (!prefix.Prefix) continue;
          
          const taskId = prefix.Prefix.replace(`${this.basePath}/${date}/`, "").replace("/", "");
          const models = await this.getModelsForTask(date, taskId);
          
          tasks.push({
            taskId,
            models,
          });
        }
      }

      return tasks;
    } catch (error) {
      console.error(`Error fetching tasks for date ${date}:`, error);
      return [];
    }
  }

  private async getModelsForTask(date: string, taskId: string) {
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: `${this.basePath}/${date}/${taskId}/`,
        Delimiter: "/",
      });

      const response = await this.s3Client.send(command);
      const models: any[] = [];

      if (response.CommonPrefixes) {
        for (const prefix of response.CommonPrefixes) {
          if (!prefix.Prefix) continue;
          
          const modelName = prefix.Prefix.replace(`${this.basePath}/${date}/${taskId}/`, "").replace("/", "");
          
          // Try to get accuracy from results.json
          let accuracy: number | undefined;
          try {
            const resultsJson = await this.getResultsJson(date, taskId, modelName);
            // Find the result that matches the current task_id
            const results = (resultsJson as any)?.results || [];
            const result = results.find((r: any) => r.task_id === taskId);
            if (result) {
              accuracy = result.is_resolved ? 1.0 : 0.0;
            }
          } catch {
            // Ignore if results.json doesn't exist
          }
          
          models.push({
            modelName,
            accuracy,
            hasData: true,
          });
        }
      }

      return models;
    } catch (error) {
      console.error(`Error fetching models for task ${taskId}:`, error);
      return [];
    }
  }

  async getTaskRun(date: string, taskId: string, modelName: string): Promise<TaskRun | null> {
    try {
      const basePath = `${this.basePath}/${date}/${taskId}/${modelName}`;
      
      const [taskYaml, resultsJson, agentCast, taskCheck, taskDebug, files] = await Promise.allSettled([
        this.getTaskYamlForModel(date, taskId, modelName),
        this.getResultsJson(date, taskId, modelName),
        this.getAgentCast(date, taskId, modelName),
        this.getTaskCheck(date, taskId, modelName),
        this.getTaskDebug(date, taskId, modelName),
        this.getFiles(date, taskId, modelName),
      ]);

      return {
        date,
        taskId,
        modelName,
        taskYaml: taskYaml.status === "fulfilled" ? taskYaml.value : undefined,
        resultsJson: resultsJson.status === "fulfilled" ? resultsJson.value : undefined,
        agentCast: agentCast.status === "fulfilled" ? agentCast.value : undefined,
        taskCheck: taskCheck.status === "fulfilled" ? taskCheck.value : undefined,
        taskDebug: taskDebug.status === "fulfilled" ? taskDebug.value : undefined,
        files: files.status === "fulfilled" ? files.value : undefined,
      };
    } catch (error) {
      console.error(`Error fetching task run ${date}/${taskId}/${modelName}:`, error);
      return null;
    }
  }

  private async getS3Object(key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    const response = await this.s3Client.send(command);
    const body = await response.Body?.transformToString();
    return body || "";
  }

  async getTaskYaml(date: string, taskId: string, modelName?: string): Promise<TaskYaml | null> {
    // Use first available model if none specified
    if (!modelName) {
      const hierarchy = await this.getHierarchy();
      const dateEntry = hierarchy.dates.find(d => d.date === date);
      const taskEntry = dateEntry?.tasks.find(t => t.taskId === taskId);
      const firstModel = taskEntry?.models.find(m => m.hasData);
      
      if (!firstModel) {
        return null;
      }
      
      modelName = firstModel.modelName;
    }
    
    return this.getTaskYamlForModel(date, taskId, modelName);
  }

  private async getTaskYamlForModel(date: string, taskId: string, modelName: string): Promise<TaskYaml> {
    const key = `${this.basePath}/${date}/${taskId}/${modelName}/task.yaml`;
    const content = await this.getS3Object(key);
    return yaml.load(content) as TaskYaml;
  }

  private async getResultsJson(date: string, taskId: string, modelName: string): Promise<ResultsJson> {
    const key = `${this.basePath}/${date}/${taskId}/${modelName}/results.json`;
    const content = await this.getS3Object(key);
    return JSON.parse(content) as ResultsJson;
  }

  private async getAgentCast(date: string, taskId: string, modelName: string): Promise<string> {
    const key = `${this.basePath}/${date}/${taskId}/${modelName}/agent.cast`;
    return await this.getS3Object(key);
  }

  private async getTaskCheck(date: string, taskId: string, modelName: string): Promise<string> {
    const key = `${this.basePath}/${date}/${taskId}/${modelName}/task.check.json`;
    return await this.getS3Object(key);
  }

  private async getTaskDebug(date: string, taskId: string, modelName: string): Promise<string> {
    const key = `${this.basePath}/${date}/${taskId}/${modelName}/task.debug.json`;
    return await this.getS3Object(key);
  }

  private async getFiles(date: string, taskId: string, modelName: string) {
    const prefix = `${this.basePath}/${date}/${taskId}/${modelName}/`;
    
    const command = new ListObjectsV2Command({
      Bucket: this.bucketName,
      Prefix: prefix,
    });

    const response = await this.s3Client.send(command);
    
    return response.Contents?.map(obj => ({
      name: obj.Key?.replace(prefix, "") || "",
      size: obj.Size || 0,
      lastModified: obj.LastModified?.toISOString() || "",
      path: obj.Key || "",
    })) || [];
  }

  async downloadFile(path: string): Promise<string> {
    return await this.getS3Object(path);
  }
}
