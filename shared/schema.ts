import { z } from "zod";

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

export const githubReviewCommentSchema = z.object({
  id: z.number(),
  pull_request_number: z.number(),
  user: z.object({
    login: z.string(),
    avatar_url: z.string().optional(),
  }),
  body: z.string(),
  path: z.string().optional(),
  position: z.number().nullable().optional(),
  line: z.number().nullable().optional(),
  commit_id: z.string().optional(),
  created_at: z.string(),
  updated_at: z.string(),
  html_url: z.string(),
  in_reply_to_id: z.number().nullable().optional(),
});

export const githubPullRequestSchema = z.object({
  number: z.number(),
  title: z.string(),
  state: z.enum(['open', 'closed']),
  user: z.object({
    login: z.string(),
    avatar_url: z.string().optional(),
  }),
  created_at: z.string(),
  updated_at: z.string(),
  merged_at: z.string().nullable().optional(),
  html_url: z.string(),
  head: z.object({
    ref: z.string(),
    sha: z.string(),
  }),
  base: z.object({
    ref: z.string(),
    sha: z.string(),
  }),
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

// GitHub workflow types
export type GitHubWorkflowRun = z.infer<typeof githubWorkflowRunSchema>;
export type GitHubWorkflowLog = z.infer<typeof githubWorkflowLogSchema>;
export type GitHubWorkflowArtifact = z.infer<typeof githubWorkflowArtifactSchema>;
export type GitHubWorkflowHierarchy = z.infer<typeof githubWorkflowHierarchySchema>;
export type GitHubReviewComment = z.infer<typeof githubReviewCommentSchema>;
export type GitHubPullRequest = z.infer<typeof githubPullRequestSchema>;

// GitHub PR selection type
export const githubPRSelectionSchema = z.object({
  type: z.literal('pr'),
  prNumber: z.number(),
  prTitle: z.string(),
});

export type GitHubPRSelection = z.infer<typeof githubPRSelectionSchema>;
