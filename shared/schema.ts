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

// GitHub workflow schemas
export const githubWorkflowRunSchema = z.object({
  id: z.number(),
  name: z.string().nullable(),
  status: z.enum(['queued', 'in_progress', 'completed']),
  conclusion: z.enum(['success', 'failure', 'neutral', 'cancelled', 'skipped', 'timed_out', 'action_required']).nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  html_url: z.string(),
  workflow_id: z.number().optional(),
  workflow_name: z.string().optional(),
  head_sha: z.string(),
  head_branch: z.string().nullable(),
  run_number: z.number(),
  run_attempt: z.number(),
});

export const githubWorkflowLogSchema = z.object({
  job_name: z.string(),
  job_id: z.number(),
  content: z.string(),
  steps: z.array(z.object({
    name: z.string(),
    number: z.number(),
    conclusion: z.enum(['success', 'failure', 'cancelled', 'skipped']).nullable(),
    content: z.string(),
  })).optional(),
});

export const githubWorkflowArtifactSchema = z.object({
  id: z.number(),
  name: z.string(),
  size_in_bytes: z.number(),
  download_url: z.string(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  expired: z.boolean(),
  workflow_run_id: z.number(),
});

export const githubWorkflowHierarchySchema = z.object({
  workflow_runs: z.array(z.object({
    run: githubWorkflowRunSchema,
    logs: z.array(githubWorkflowLogSchema).optional(),
    artifacts: z.array(githubWorkflowArtifactSchema).optional(),
    hasData: z.boolean(),
  })),
  total_count: z.number(),
  repository: z.object({
    owner: z.string(),
    name: z.string(),
    workflow_name: z.string(),
  }),
});

export type TaskYaml = z.infer<typeof taskYamlSchema>;
export type ResultsJson = z.infer<typeof resultsJsonSchema>;
export type AgentThought = z.infer<typeof agentThoughtSchema>;
export type AgentCastHeader = z.infer<typeof agentCastHeaderSchema>;
export type S3File = z.infer<typeof s3FileSchema>;
export type TaskRun = z.infer<typeof taskRunSchema>;
export type S3Hierarchy = z.infer<typeof s3HierarchySchema>;

// GitHub workflow types
export type GitHubWorkflowRun = z.infer<typeof githubWorkflowRunSchema>;
export type GitHubWorkflowLog = z.infer<typeof githubWorkflowLogSchema>;
export type GitHubWorkflowArtifact = z.infer<typeof githubWorkflowArtifactSchema>;
export type GitHubWorkflowHierarchy = z.infer<typeof githubWorkflowHierarchySchema>;
