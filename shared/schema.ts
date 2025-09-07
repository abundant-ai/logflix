import { z } from "zod";

// S3 data structure schemas based on the documentation
export const taskYamlSchema = z.object({
  instruction: z.string(),
  author_name: z.string(),
  author_email: z.string(),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  category: z.string(),
  tags: z.array(z.string()),
  parser_name: z.string(),
  max_agent_timeout_sec: z.number(),
});

export const resultsJsonSchema = z.object({
  id: z.string(),
  trial_name: z.string(),
  task_id: z.string(),
  instruction: z.string(),
  is_resolved: z.boolean(),
  failure_mode: z.string(),
  parser_results: z.record(z.string()).optional(), // test name -> 'passed'/'failed'
  recording_path: z.string(),
  total_input_tokens: z.number(),
  total_output_tokens: z.number(),
  trial_started_at: z.string(),
  trial_ended_at: z.string(),
  agent_started_at: z.string(),
  agent_ended_at: z.string(),
  test_started_at: z.string().optional(),
  test_ended_at: z.string().optional(),
});

export const agentThoughtSchema = z.object({
  timestamp: z.number(),
  type: z.string(), // "i", "o", "m"
  content: z.string(),
});

export const agentCastHeaderSchema = z.object({
  version: z.number(),
  width: z.number(),
  height: z.number(),
  timestamp: z.number(),
  env: z.record(z.string()).optional(),
});

export const s3FileSchema = z.object({
  name: z.string(),
  size: z.number(),
  lastModified: z.string(),
  path: z.string(),
});

export const taskRunSchema = z.object({
  date: z.string(),
  taskId: z.string(),
  modelName: z.string(),
  taskYaml: taskYamlSchema.optional(),
  resultsJson: resultsJsonSchema.optional(),
  agentCast: z.string().optional(), // raw cast content
  taskCheck: z.string().optional(),
  taskDebug: z.string().optional(),
  files: z.array(s3FileSchema).optional(),
});

export const s3HierarchySchema = z.object({
  dates: z.array(z.object({
    date: z.string(),
    tasks: z.array(z.object({
      taskId: z.string(),
      models: z.array(z.object({
        modelName: z.string(),
        accuracy: z.number().optional(),
        duration: z.number().optional(),
        taskCompleted: z.boolean().optional(),
        hasData: z.boolean(),
      })),
    })),
  })),
});

export type TaskYaml = z.infer<typeof taskYamlSchema>;
export type ResultsJson = z.infer<typeof resultsJsonSchema>;
export type AgentThought = z.infer<typeof agentThoughtSchema>;
export type AgentCastHeader = z.infer<typeof agentCastHeaderSchema>;
export type S3File = z.infer<typeof s3FileSchema>;
export type TaskRun = z.infer<typeof taskRunSchema>;
export type S3Hierarchy = z.infer<typeof s3HierarchySchema>;
