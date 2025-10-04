import { exec } from 'child_process';
import { promisify } from 'util';
import * as yaml from 'js-yaml';
import {
  GitHubWorkflowRun,
  GitHubWorkflowLog,
  GitHubWorkflowArtifact,
  GitHubWorkflowHierarchy,
  GitHubReviewComment,
  GitHubPullRequest
} from '@shared/schema';

const execAsync = promisify(exec);

interface GHRunJSON {
  databaseId: number;
  displayTitle: string;
  status: string;
  conclusion: string | null;
  createdAt: string;
  updatedAt: string;
  url: string;
  workflowDatabaseId: number;
  workflowName: string;
  headSha: string;
  headBranch: string;
  number: number;
  attempt: number;
}

interface GHArtifactJSON {
  name: string;
  id: number;
  size: number;
  url: string;
  createdAt: string;
  updatedAt: string;
  expired: boolean;
}

interface GHPullRequestJSON {
  number: number;
  title: string;
  state: string;
  author: {
    login: string;
  };
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  url: string;
  headRefName: string;
  headRefOid: string;
  baseRefName: string;
  baseRefOid: string;
}

interface GHReviewCommentJSON {
  id: number;
  author: {
    login: string;
    avatarUrl?: string;
  };
  body: string;
  path: string;
  position: number | null;
  line: number | null;
  commit: {
    oid: string;
  };
  createdAt: string;
  updatedAt: string;
  url: string;
  replyTo?: number | null;
  pullRequestReview?: {
    pullRequest: {
      number: number;
    };
  };
}

export class GitHubCliService {
  private repositoryOwner: string;
  private repositoryName: string;
  private workflowFileName: string;

  constructor(owner?: string, repo?: string, workflow?: string) {
    // Hardcoded for now - will be parameterized for multi-repo support in the future
    this.repositoryOwner = owner || 'abundant-ai';
    this.repositoryName = repo || 'tbench-hammer';
    this.workflowFileName = workflow || 'test-tasks.yaml';
  }

  /**
   * Execute gh CLI command and return parsed JSON result
   */
  private async executeGhCommand<T = any>(command: string): Promise<T> {
    try {
      const { stdout, stderr } = await execAsync(`gh ${command}`);
      
      if (stderr && !stderr.includes('Validation')) {
        console.warn('gh CLI warning:', stderr);
      }
      
      return JSON.parse(stdout) as T;
    } catch (error: any) {
      console.error('Error executing gh command:', error.message);
      if (error.stdout) console.error('stdout:', error.stdout);
      if (error.stderr) console.error('stderr:', error.stderr);
      throw new Error(`Failed to execute gh command: ${error.message}`);
    }
  }

  /**
   * Get current repository context
   */
  private getRepoContext(): string {
    if (this.repositoryOwner && this.repositoryName) {
      return `--repo ${this.repositoryOwner}/${this.repositoryName}`;
    }
    // If not specified, gh CLI will use the current directory's repo
    return '';
  }

  /**
   * Get workflow hierarchy with runs, logs, and artifacts
   */
  async getHierarchy(limit: number = 30): Promise<GitHubWorkflowHierarchy> {
    try {
      const repoContext = this.getRepoContext();
      
      // Fetch workflow runs
      const runsCommand = `run list ${repoContext} --workflow="${this.workflowFileName}" --limit ${limit} --json databaseId,displayTitle,status,conclusion,createdAt,updatedAt,url,workflowDatabaseId,workflowName,headSha,headBranch,number,attempt`;
      
      const runs = await this.executeGhCommand<GHRunJSON[]>(runsCommand);

      const workflowRuns = await Promise.all(
        runs.map(async (run) => {
          try {
            // Fetch logs and artifacts in parallel
            const [logs, artifacts] = await Promise.allSettled([
              this.getWorkflowRunLogs(run.databaseId),
              this.getWorkflowRunArtifacts(run.databaseId),
            ]);

            return {
              run: {
                id: run.databaseId,
                name: run.displayTitle || null,
                status: run.status as 'queued' | 'in_progress' | 'completed',
                conclusion: run.conclusion as 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | null,
                created_at: run.createdAt,
                updated_at: run.updatedAt,
                html_url: run.url,
                workflow_id: run.workflowDatabaseId,
                workflow_name: run.workflowName,
                head_sha: run.headSha,
                head_branch: run.headBranch,
                run_number: run.number,
                run_attempt: run.attempt,
              } as GitHubWorkflowRun,
              logs: logs.status === 'fulfilled' ? logs.value : undefined,
              artifacts: artifacts.status === 'fulfilled' ? artifacts.value : undefined,
              hasData: logs.status === 'fulfilled' || artifacts.status === 'fulfilled',
            };
          } catch (error) {
            console.error(`Error fetching data for workflow run ${run.databaseId}:`, error);
            return {
              run: {
                id: run.databaseId,
                name: run.displayTitle || null,
                status: run.status as 'queued' | 'in_progress' | 'completed',
                conclusion: run.conclusion as 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | null,
                created_at: run.createdAt,
                updated_at: run.updatedAt,
                html_url: run.url,
                workflow_id: run.workflowDatabaseId,
                workflow_name: run.workflowName,
                head_sha: run.headSha,
                head_branch: run.headBranch,
                run_number: run.number,
                run_attempt: run.attempt,
              } as GitHubWorkflowRun,
              hasData: false,
            };
          }
        })
      );

      return {
        workflow_runs: workflowRuns,
        total_count: runs.length,
        repository: {
          owner: this.repositoryOwner,
          name: this.repositoryName,
          workflow_name: this.workflowFileName,
        },
      };
    } catch (error) {
      console.error('Error fetching GitHub workflow hierarchy:', error);
      return {
        workflow_runs: [],
        total_count: 0,
        repository: {
          owner: this.repositoryOwner,
          name: this.repositoryName,
          workflow_name: this.workflowFileName,
        },
      };
    }
  }

  /**
   * Get workflow run logs with increased buffer for large logs
   */
  async getWorkflowRunLogs(runId: number): Promise<GitHubWorkflowLog[]> {
    try {
      const repoContext = this.getRepoContext();
      
      // Get run logs with increased buffer size (50MB) for large terminal bench logs
      const logCommand = `run view ${runId} ${repoContext} --log`;
      const { stdout } = await execAsync(`gh ${logCommand}`, {
        maxBuffer: 50 * 1024 * 1024 // 50MB buffer
      });
      
      // Parse the logs - gh CLI returns the full log as text
      // We'll create a single log entry with all content
      const logs: GitHubWorkflowLog[] = [{
        job_name: 'Workflow Run',
        job_id: runId,
        content: stdout,
        steps: [],
      }];

      return logs;
    } catch (error) {
      console.error(`Error fetching workflow run logs for run ${runId}:`, error);
      return [];
    }
  }

  /**
   * Get workflow run artifacts using GitHub API
   */
  async getWorkflowRunArtifacts(runId: number): Promise<GitHubWorkflowArtifact[]> {
    try {
      const repoContext = this.getRepoContext();
      
      // Use GitHub API to fetch artifacts since gh run view doesn't support artifacts field
      const artifactsCommand = `api repos/${this.repositoryOwner}/${this.repositoryName}/actions/runs/${runId}/artifacts --jq '.artifacts[] | {id: .id, name: .name, size: .size_in_bytes, url: .archive_download_url, createdAt: .created_at, updatedAt: .updated_at, expired: .expired}'`;
      const { stdout } = await execAsync(`gh ${artifactsCommand}`);
      
      // Parse newline-delimited JSON
      const artifacts: GHArtifactJSON[] = stdout
        .trim()
        .split('\n')
        .filter(line => line)
        .map(line => JSON.parse(line));
      
      return artifacts.map(artifact => ({
        id: artifact.id,
        name: artifact.name,
        size_in_bytes: artifact.size,
        download_url: artifact.url,
        created_at: artifact.createdAt,
        updated_at: artifact.updatedAt,
        expired: artifact.expired,
        workflow_run_id: runId,
      }));
    } catch (error) {
      console.error(`Error fetching workflow run artifacts for run ${runId}:`, error);
      return [];
    }
  }

  /**
   * Download artifact to a specific path
   */
  async downloadArtifact(artifactName: string, runId?: number): Promise<string | null> {
    try {
      const repoContext = this.getRepoContext();
      
      // Download artifact (gh CLI downloads to current directory by default)
      const downloadCommand = `run download ${runId || ''} ${repoContext} --name "${artifactName}"`;
      await execAsync(`gh ${downloadCommand}`);
      
      return `Downloaded artifact: ${artifactName}`;
    } catch (error) {
      console.error(`Error downloading artifact ${artifactName}:`, error);
      return null;
    }
  }

  /**
   * Download and extract cast file content from artifact
   */
  async getCastFileContent(artifactId: number): Promise<string | null> {
    try {
      // Download artifact using GitHub API
      const downloadCommand = `api repos/${this.repositoryOwner}/${this.repositoryName}/actions/artifacts/${artifactId}/zip --output -`;
      const { stdout } = await execAsync(`gh ${downloadCommand}`, {
        encoding: 'buffer',
        maxBuffer: 50 * 1024 * 1024 // 50MB buffer
      });
      
      // The artifact is a zip file, we need to extract the .cast file
      // For now, return indication that we have the zip
      return stdout.toString('base64');
    } catch (error) {
      console.error(`Error downloading cast file for artifact ${artifactId}:`, error);
      return null;
    }
  }


  /**
   * Get specific workflow run details
   */
  async getWorkflowRun(runId: number): Promise<GitHubWorkflowRun | null> {
    try {
      const repoContext = this.getRepoContext();
      
      const runCommand = `run view ${runId} ${repoContext} --json databaseId,displayTitle,status,conclusion,createdAt,updatedAt,url,workflowDatabaseId,workflowName,headSha,headBranch,number,attempt`;
      const run = await this.executeGhCommand<GHRunJSON>(runCommand);
      
      return {
        id: run.databaseId,
        name: run.displayTitle || null,
        status: run.status as 'queued' | 'in_progress' | 'completed',
        conclusion: run.conclusion as 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | null,
        created_at: run.createdAt,
        updated_at: run.updatedAt,
        html_url: run.url,
        workflow_id: run.workflowDatabaseId,
        workflow_name: run.workflowName,
        head_sha: run.headSha,
        head_branch: run.headBranch,
        run_number: run.number,
        run_attempt: run.attempt,
      };
    } catch (error) {
      console.error(`Error fetching workflow run ${runId}:`, error);
      return null;
    }
  }

  /**
   * List all pull requests with optional filtering and sorting
   */
  async listPullRequests(
    state: 'open' | 'closed' | 'all' = 'all',
    limit: number = 30,
    sortBy: 'created' | 'updated' | 'popularity' | 'long-running' = 'updated',
    sortDirection: 'asc' | 'desc' = 'desc'
  ): Promise<GitHubPullRequest[]> {
    try {
      const repoContext = this.getRepoContext();
      
      const stateFlag = state === 'all' ? '' : `--state ${state}`;
      const prCommand = `pr list ${repoContext} ${stateFlag} --limit ${limit} --json number,title,state,author,createdAt,updatedAt,mergedAt,url,headRefName,headRefOid,baseRefName,baseRefOid`;
      
      const prs = await this.executeGhCommand<GHPullRequestJSON[]>(prCommand);
      
      const mappedPRs = prs.map(pr => ({
        number: pr.number,
        title: pr.title,
        state: pr.state as 'open' | 'closed',
        user: {
          login: pr.author.login,
        },
        created_at: pr.createdAt,
        updated_at: pr.updatedAt,
        merged_at: pr.mergedAt,
        html_url: pr.url,
        head: {
          ref: pr.headRefName,
          sha: pr.headRefOid,
        },
        base: {
          ref: pr.baseRefName,
          sha: pr.baseRefOid,
        },
      }));

      // Apply sorting
      mappedPRs.sort((a, b) => {
        let comparison = 0;
        if (sortBy === 'created') {
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        } else if (sortBy === 'updated') {
          comparison = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
        }
        return sortDirection === 'desc' ? -comparison : comparison;
      });

      return mappedPRs;
    } catch (error) {
      console.error('Error fetching pull requests:', error);
      return [];
    }
  }

  /**
   * Get pull requests associated with a commit SHA
   */
  async getPullRequestsForCommit(commitSha: string): Promise<GitHubPullRequest[]> {
    try {
      const repoContext = this.getRepoContext();
      
      // Search for PRs with this commit
      const prCommand = `pr list ${repoContext} --search "${commitSha}" --json number,title,state,author,createdAt,updatedAt,mergedAt,url,headRefName,headRefOid,baseRefName,baseRefOid --limit 10`;
      const prs = await this.executeGhCommand<GHPullRequestJSON[]>(prCommand);
      
      return prs.map(pr => ({
        number: pr.number,
        title: pr.title,
        state: pr.state as 'open' | 'closed',
        user: {
          login: pr.author.login,
        },
        created_at: pr.createdAt,
        updated_at: pr.updatedAt,
        merged_at: pr.mergedAt,
        html_url: pr.url,
        head: {
          ref: pr.headRefName,
          sha: pr.headRefOid,
        },
        base: {
          ref: pr.baseRefName,
          sha: pr.baseRefOid,
        },
      }));
    } catch (error) {
      console.error(`Error fetching PRs for commit ${commitSha}:`, error);
      return [];
    }
  }

  /**
   * Get review comments for a pull request
   */
  async getReviewComments(prNumber: number): Promise<GitHubReviewComment[]> {
    try {
      const repoContext = this.getRepoContext();
      
      // Get PR review comments
      const commentsCommand = `pr view ${prNumber} ${repoContext} --json reviews`;
      const result = await this.executeGhCommand<{ reviews: any[] }>(commentsCommand);
      
      const comments: GitHubReviewComment[] = [];
      
      // Parse review comments from the reviews
      for (const review of result.reviews) {
        if (review.body) {
          comments.push({
            id: review.databaseId || Date.now(),
            pull_request_number: prNumber,
            user: {
              login: review.author?.login || 'unknown',
              avatar_url: review.author?.avatarUrl,
            },
            body: review.body,
            created_at: review.createdAt,
            updated_at: review.updatedAt || review.createdAt,
            html_url: review.url,
            in_reply_to_id: null,
          });
        }
      }
      
      return comments;
    } catch (error) {
      console.error(`Error fetching review comments for PR ${prNumber}:`, error);
      return [];
    }
  }

  /**
   * Get all review comments for a workflow run by finding associated PRs
   */
  async getReviewCommentsForRun(runId: number): Promise<GitHubReviewComment[]> {
    try {
      // Get the workflow run to find the commit SHA
      const run = await this.getWorkflowRun(runId);
      if (!run) {
        return [];
      }

      // Find PRs associated with this commit
      const prs = await this.getPullRequestsForCommit(run.head_sha);
      
      if (prs.length === 0) {
        return [];
      }

      // Get review comments for all associated PRs
      const allComments: GitHubReviewComment[] = [];
      for (const pr of prs) {
        const comments = await this.getReviewComments(pr.number);
        allComments.push(...comments);
      }

      return allComments;
    } catch (error) {
      console.error(`Error fetching review comments for run ${runId}:`, error);
      return [];
    }
  }

  /**
   * Get workflow runs associated with a pull request
   */
  async getWorkflowRunsForPR(prNumber: number, limit: number = 10): Promise<GitHubWorkflowRun[]> {
    try {
      const repoContext = this.getRepoContext();
      
      // Get PR details to get the head SHA
      const prCommand = `pr view ${prNumber} ${repoContext} --json headRefOid`;
      const prData = await this.executeGhCommand<{ headRefOid: string }>(prCommand);
      
      // Get workflow runs for this commit
      const runsCommand = `run list ${repoContext} --commit ${prData.headRefOid} --limit ${limit} --json databaseId,displayTitle,status,conclusion,createdAt,updatedAt,url,workflowDatabaseId,workflowName,headSha,headBranch,number,attempt`;
      const runs = await this.executeGhCommand<GHRunJSON[]>(runsCommand);

      return runs.map(run => ({
        id: run.databaseId,
        name: run.displayTitle || null,
        status: run.status as 'queued' | 'in_progress' | 'completed',
        conclusion: run.conclusion as 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | null,
        created_at: run.createdAt,
        updated_at: run.updatedAt,
        html_url: run.url,
        workflow_id: run.workflowDatabaseId,
        workflow_name: run.workflowName,
        head_sha: run.headSha,
        head_branch: run.headBranch,
        run_number: run.number,
        run_attempt: run.attempt,
      }));
    } catch (error) {
      console.error(`Error fetching workflow runs for PR ${prNumber}:`, error);
      return [];
    }
  }

  /**
   * Get workflow bot comments on a pull request (comments from github-actions bot)
   */
  async getWorkflowBotComments(prNumber: number): Promise<GitHubReviewComment[]> {
    try {
      const repoContext = this.getRepoContext();
      
      // Get all comments on the PR
      const commentsCommand = `pr view ${prNumber} ${repoContext} --json comments`;
      const result = await this.executeGhCommand<{ comments: any[] }>(commentsCommand);
      
      const botComments: GitHubReviewComment[] = [];
      
      // Filter for bot comments
      for (const comment of result.comments) {
        // Check if the author is a bot (github-actions, etc.)
        if (comment.author?.login?.includes('bot') || comment.author?.login === 'github-actions') {
          botComments.push({
            id: comment.databaseId || Date.now(),
            pull_request_number: prNumber,
            user: {
              login: comment.author?.login || 'bot',
              avatar_url: comment.author?.avatarUrl,
            },
            body: comment.body,
            created_at: comment.createdAt,
            updated_at: comment.updatedAt || comment.createdAt,
            html_url: comment.url,
            in_reply_to_id: null,
          });
        }
      }
      
      return botComments;
    } catch (error) {
      console.error(`Error fetching workflow bot comments for PR ${prNumber}:`, error);
      return [];
    }
  }

  /**
   * Get a specific pull request by number
   */
  async getPullRequest(prNumber: number): Promise<GitHubPullRequest | null> {
    try {
      const repoContext = this.getRepoContext();
      
      const prCommand = `pr view ${prNumber} ${repoContext} --json number,title,state,author,createdAt,updatedAt,mergedAt,url,headRefName,headRefOid,baseRefName,baseRefOid`;
      const pr = await this.executeGhCommand<GHPullRequestJSON>(prCommand);
      
      return {
        number: pr.number,
        title: pr.title,
        state: pr.state as 'open' | 'closed',
        user: {
          login: pr.author.login,
        },
        created_at: pr.createdAt,
        updated_at: pr.updatedAt,
        merged_at: pr.mergedAt,
        html_url: pr.url,
        head: {
          ref: pr.headRefName,
          sha: pr.headRefOid,
        },
        base: {
          ref: pr.baseRefName,
          sha: pr.baseRefOid,
        },
      };
    } catch (error) {
      console.error(`Error fetching PR ${prNumber}:`, error);
      return null;
    }
  }

  /**
   * Get files changed in a pull request
   */
  async getPRFiles(prNumber: number): Promise<any[]> {
    try {
      // Use GitHub API to get PR files
      const filesCommand = `api repos/${this.repositoryOwner}/${this.repositoryName}/pulls/${prNumber}/files --jq '.[] | {name: .filename, path: .filename, sha: .sha, size: (.additions + .deletions), type: "file", download_url: .raw_url}'`;
      const { stdout } = await execAsync(`gh ${filesCommand}`);
      
      // Parse newline-delimited JSON
      const files = stdout
        .trim()
        .split('\n')
        .filter(line => line)
        .map(line => JSON.parse(line));
      
      return files;
    } catch (error) {
      console.error(`Error fetching PR files for ${prNumber}:`, error);
      return [];
    }
  }

  /**
   * Get file content from PR
   */
  async getPRFileContent(prNumber: number, filePath: string): Promise<string | null> {
    try {
      // Get PR to find the head SHA
      const pr = await this.getPullRequest(prNumber);
      if (!pr) return null;

      // Fetch file content from the PR's head commit
      const contentCommand = `api repos/${this.repositoryOwner}/${this.repositoryName}/contents/${filePath}?ref=${pr.head.sha} --jq '.content'`;
      const { stdout } = await execAsync(`gh ${contentCommand}`);
      
      // Decode base64 content
      const base64Content = stdout.trim().replace(/"/g, '');
      return Buffer.from(base64Content, 'base64').toString('utf-8');
    } catch (error) {
      console.error(`Error fetching file content ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Get task.yaml content and parse it
   */
  async getTaskYaml(prNumber: number): Promise<any | null> {
    try {
      const files = await this.getPRFiles(prNumber);
      
      // Find task.yaml file in the PR files
      const taskYamlFile = files.find(f =>
        f.name.endsWith('task.yaml') || f.name.endsWith('task.yml')
      );
      
      if (!taskYamlFile) {
        console.log(`No task.yaml found in PR ${prNumber}`);
        return null;
      }

      // Fetch and parse task.yaml content
      const content = await this.getPRFileContent(prNumber, taskYamlFile.path);
      if (!content) return null;

      // Parse YAML
      return yaml.load(content);
    } catch (error) {
      console.error(`Error fetching task.yaml for PR ${prNumber}:`, error);
      return null;
    }
  }

  /**
   * Extract task ID from PR files (directory name)
   */
  async getTaskId(prNumber: number): Promise<string | null> {
    try {
      const files = await this.getPRFiles(prNumber);
      
      // Find the common directory prefix (task ID)
      if (files.length === 0) return null;
      
      // Extract directory from first file path
      const firstPath = files[0].path;
      const parts = firstPath.split('/');
      
      // If in tasks/ directory, return the task folder name
      if (parts[0] === 'tasks' && parts.length > 1) {
        return parts[1];
      }
      
      // Otherwise return the first directory
      return parts.length > 1 ? parts[0] : null;
    } catch (error) {
      console.error(`Error extracting task ID for PR ${prNumber}:`, error);
      return null;
    }
  }

  /**
   * Get commit details including message
   */
  async getCommitDetails(commitSha: string): Promise<{ message: string; author: string } | null> {
    try {
      const commitCommand = `api repos/${this.repositoryOwner}/${this.repositoryName}/commits/${commitSha} --jq '{message: .commit.message, author: .commit.author.name}'`;
      const { stdout } = await execAsync(`gh ${commitCommand}`);
      
      return JSON.parse(stdout.trim());
    } catch (error) {
      console.error(`Error fetching commit details for ${commitSha}:`, error);
      return null;
    }
  }
}