import { exec } from 'child_process';
import { promisify } from 'util';
import * as yaml from 'js-yaml';
import AdmZip from 'adm-zip';
import type { Logger } from 'pino';
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
  private logger: Logger;

  constructor(owner?: string, repo?: string, workflow?: string, logger?: Logger) {
    // Hardcoded for now - will be parameterized for multi-repo support in the future
    this.repositoryOwner = owner || 'abundant-ai';
    this.repositoryName = repo || 'tbench-hammer';
    this.workflowFileName = workflow || 'test-tasks.yaml';
    this.logger = logger?.child({
      component: 'GitHubCliService',
      repo: `${this.repositoryOwner}/${this.repositoryName}`,
      workflow: this.workflowFileName
    }) || console as any; // Fallback to console if no logger provided
  }

  /**
   * Execute gh CLI command and return parsed JSON result
   */
  private async executeGhCommand<T = any>(command: string): Promise<T> {
    try {
      this.logger.debug({ command: `gh ${command}` }, 'Executing gh CLI command');
      const { stdout, stderr } = await execAsync(`gh ${command}`);
      
      if (stderr && !stderr.includes('Validation')) {
        this.logger.warn({ stderr, command }, 'gh CLI warning');
      }
      
      return JSON.parse(stdout) as T;
    } catch (error: any) {
      this.logger.error({
        error: error.message,
        command: `gh ${command}`,
        stdout: error.stdout,
        stderr: error.stderr
      }, 'Failed to execute gh command');
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
            this.logger.error({ runId: run.databaseId, error }, 'Error fetching data for workflow run');
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
      this.logger.error({ error, limit }, 'Error fetching GitHub workflow hierarchy');
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
      this.logger.error({ runId, error }, 'Error fetching workflow run logs');
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
      this.logger.error({ runId, error }, 'Error fetching workflow run artifacts');
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
      this.logger.error({ artifactName, runId, error }, 'Error downloading artifact');
      return null;
    }
  }

  

  /**
   * List all .cast files in an artifact
   */
  async getCastFilesList(artifactId: number): Promise<Array<{ name: string; path: string; size: number }>> {
    try {
      // Download artifact zip
      const downloadCommand = `api repos/${this.repositoryOwner}/${this.repositoryName}/actions/artifacts/${artifactId}/zip`;
      const { stdout } = await execAsync(`gh ${downloadCommand}`, {
        encoding: 'buffer',
        maxBuffer: 50 * 1024 * 1024
      });
      
      // Extract zip and find cast files
      const zip = new AdmZip(stdout);
      const zipEntries = zip.getEntries();
      
      const castFiles: Array<{ name: string; path: string; size: number }> = [];
      zipEntries.forEach((entry: any) => {
        if (!entry.isDirectory && entry.entryName.endsWith('.cast')) {
          castFiles.push({
            name: entry.entryName.split('/').pop() || entry.entryName,
            path: entry.entryName,
            size: entry.header.size
          });
        }
      });
      
      return castFiles;
    } catch (error: any) {
      // Check if artifact has expired
      if (error.message?.includes('Artifact has expired') || error.stderr?.includes('HTTP 410')) {
        this.logger.warn({ artifactId }, 'Artifact has expired');
        return [];
      }
      this.logger.error({ artifactId, error }, 'Error listing cast files from artifact');
      return [];
    }
  }

  /**
   * Get specific cast file content from artifact by path
   */
  async getCastFileByPath(artifactId: number, filePath: string): Promise<string | null> {
    try {
      // Decode URL-encoded path safely (handle double-encoding)
      let decodedPath = filePath;
      try {
        // Decode until no more changes (handles multiple encoding layers)
        let previousPath = '';
        while (previousPath !== decodedPath) {
          previousPath = decodedPath;
          decodedPath = decodeURIComponent(decodedPath);
        }
      } catch (decodeError) {
        this.logger.warn({ filePath, error: decodeError }, 'Failed to decode path, using as-is');
        decodedPath = filePath;
      }

      // Validate path to prevent directory traversal
      const normalizedPath = decodedPath.replace(/\\/g, '/').replace(/\/+/g, '/');
      if (normalizedPath.includes('../') || normalizedPath.includes('..\\') || normalizedPath.startsWith('/')) {
        this.logger.error({ filePath, normalizedPath }, 'Invalid file path (directory traversal detected)');
        return null;
      }

      // Download artifact zip
      const downloadCommand = `api repos/${this.repositoryOwner}/${this.repositoryName}/actions/artifacts/${artifactId}/zip`;
      const { stdout } = await execAsync(`gh ${downloadCommand}`, {
        encoding: 'buffer',
        maxBuffer: 50 * 1024 * 1024
      });
      
      // Extract specific file using normalized path
      const zip = new AdmZip(stdout);
      const entry = zip.getEntry(normalizedPath);
      
      if (!entry) {
        this.logger.error({ artifactId, normalizedPath, originalPath: filePath }, 'Cast file not found in artifact');
        return null;
      }
      
      // Read as text and validate size
      const content = zip.readAsText(entry);
      if (content.length > 10 * 1024 * 1024) {
        this.logger.error({ artifactId, normalizedPath, size: content.length }, 'Cast file exceeds 10MB size limit');
        return null;
      }
      
      return content;
    } catch (error: any) {
      // Check if artifact has expired
      if (error.message?.includes('Artifact has expired') || error.stderr?.includes('HTTP 410')) {
        this.logger.warn({ artifactId, filePath }, 'Artifact has expired, cannot read cast file');
        return null;
      }
      this.logger.error({ artifactId, filePath, error }, 'Error reading cast file from artifact');
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
      this.logger.error({ runId, error }, 'Error fetching workflow run');
      return null;
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
      this.logger.error({ commitSha, error }, 'Error fetching PRs for commit');
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
      this.logger.error({ prNumber, error }, 'Error fetching review comments for PR');
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
      this.logger.error({ runId, error }, 'Error fetching review comments for run');
      return [];
    }
  }

  /**
   * Get workflow runs associated with a pull request (including ALL attempts)
   * Fixed to properly fetch multiple attempts for same run numbers
   */
  async getWorkflowRunsForPR(prNumber: number, limit: number = 50): Promise<GitHubWorkflowRun[]> {
    try {
      // Get all commits for this PR to find the commit range
      const commits = await this.getPRCommits(prNumber);
      
      if (commits.length === 0) {
        this.logger.warn({ prNumber }, 'No commits found for PR');
        return [];
      }

      this.logger.info({
        prNumber,
        commitCount: commits.length,
        commitRange: `${commits[commits.length - 1]?.sha?.substring(0, 7)}...${commits[0]?.sha?.substring(0, 7)}`
      }, 'Fetching workflow runs for PR commits');

      // Fallback to original working commit-based approach with enhanced attempts fetching
      const allRuns: GitHubWorkflowRun[] = [];
      
      for (const commit of commits) {
        try {
          // Use the proven working approach - get runs by commit with explicit repo context
          const repoContext = this.getRepoContext();
          const runsCommand = `run list ${repoContext} --commit ${commit.sha} --workflow="${this.workflowFileName}" --limit ${Math.ceil(limit / commits.length)} --json databaseId,displayTitle,status,conclusion,createdAt,updatedAt,url,workflowDatabaseId,workflowName,headSha,headBranch,number,attempt`;
          const runs = await this.executeGhCommand<GHRunJSON[]>(runsCommand);
          
          this.logger.info({
            commitSha: commit.sha.substring(0, 7),
            runsFound: runs.length,
            runNumbers: runs.map(r => `#${r.number}.${r.attempt}`)
          }, 'Found runs for commit');

          // For each run found, check if it has multiple attempts by checking for previous attempts
          for (const run of runs) {
            try {
              // First, add the current attempt (what we have from gh run list)
              const currentRun = {
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

              // Check if this run has previous attempts
              if (run.attempt > 1) {
                this.logger.info({
                  runId: run.databaseId,
                  runNumber: run.number,
                  currentAttempt: run.attempt
                }, 'Run has multiple attempts, fetching previous attempts');

                // Try to fetch previous attempts (attempt 1, 2, etc.)
                const allAttempts = [currentRun];
                
                for (let attemptNum = 1; attemptNum < run.attempt; attemptNum++) {
                  try {
                    const prevAttemptCommand = `api repos/${this.repositoryOwner}/${this.repositoryName}/actions/runs/${run.databaseId}/attempts/${attemptNum} --jq '{id: .id, run_number: .run_number, run_attempt: .run_attempt, status: .status, conclusion: .conclusion, created_at: .created_at, updated_at: .updated_at, html_url: .html_url, head_sha: .head_sha}'`;
                    
                    const { stdout: prevStdout } = await execAsync(`gh ${prevAttemptCommand}`, {
                      maxBuffer: 10 * 1024 * 1024
                    });
                    
                    const prevAttempt = JSON.parse(prevStdout.trim());
                    
                    const prevRun = {
                      id: run.databaseId * 1000 + attemptNum, // Unique ID for each attempt
                      name: run.displayTitle || null,
                      status: prevAttempt.status as 'queued' | 'in_progress' | 'completed',
                      conclusion: prevAttempt.conclusion as 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | null,
                      created_at: prevAttempt.created_at,
                      updated_at: prevAttempt.updated_at,
                      html_url: `${prevAttempt.html_url}/attempts/${attemptNum}`,
                      workflow_id: run.workflowDatabaseId,
                      workflow_name: run.workflowName,
                      head_sha: prevAttempt.head_sha,
                      head_branch: run.headBranch,
                      run_number: prevAttempt.run_number,
                      run_attempt: prevAttempt.run_attempt,
                    };
                    
                    allAttempts.unshift(prevRun); // Add to beginning (chronological order)
                  } catch (prevError: any) {
                    this.logger.debug({ runId: run.databaseId, attemptNum, error: prevError.message }, 'Could not fetch previous attempt');
                    break;
                  }
                }
                
                if (allAttempts.length > 1) {
                  this.logger.info({
                    runId: run.databaseId,
                    runNumber: run.number,
                    attemptCount: allAttempts.length,
                    attempts: allAttempts.map(a => `attempt ${a.run_attempt} (${a.status}/${a.conclusion})`)
                  }, 'Successfully found multiple attempts for run');
                }
                
                allRuns.push(...allAttempts);
              } else {
                // Single attempt run
                allRuns.push(currentRun);
              }
            } catch (attemptError: any) {
              this.logger.warn({ runId: run.databaseId, error: attemptError.message }, 'Error processing attempts for run');
              
              // Fallback to just the basic run
              allRuns.push({
                id: run.databaseId,
                name: run.displayTitle || null,
                status: run.status as 'queued' | 'in_progress' | 'completed' | 'requested' | 'waiting' | 'pending',
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
              });
            }
          }
        } catch (error) {
          this.logger.error({ commitSha: commit.sha, prNumber, error }, 'Error fetching runs for commit');
        }
      }
      
      // Sort by created_at descending and limit to requested number
      allRuns.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      
      // Log run grouping for debugging
      const runGroups = allRuns.reduce((acc: Record<number, number>, run) => {
        acc[run.run_number] = (acc[run.run_number] || 0) + 1;
        return acc;
      }, {});
      
      const multiAttemptRuns = Object.entries(runGroups).filter(([_, count]) => count > 1);
      
      this.logger.info({
        prNumber,
        totalRuns: allRuns.length,
        multiAttemptRuns: multiAttemptRuns.map(([runNum, count]) => `#${runNum}:${count}`),
        hasMultipleAttempts: multiAttemptRuns.length > 0
      }, 'PR workflow runs analysis complete');
      
      return allRuns.slice(0, limit);
    } catch (error) {
      this.logger.error({ prNumber, limit, error }, 'Error fetching workflow runs for PR');
      return [];
    }
  }

  /**
   * Get workflow ID for filtering runs
   */
  private async getWorkflowId(): Promise<number> {
    try {
      const workflowCommand = `api repos/${this.repositoryOwner}/${this.repositoryName}/actions/workflows --jq '.workflows[] | select(.name == "Test Tasks with Multiple Agents") | .id'`;
      const { stdout } = await execAsync(`gh ${workflowCommand}`);
      return parseInt(stdout.trim(), 10);
    } catch (error) {
      this.logger.warn({ error }, 'Could not determine workflow ID, using workflow name filter');
      // Return a default that won't match, forcing name-based filtering
      return 0;
    }
  }

  /**
   * Get workflow bot comments on a pull request (comments from github-actions bot and Claude bot)
   */
  async getWorkflowBotComments(prNumber: number): Promise<GitHubReviewComment[]> {
    try {
      const repoContext = this.getRepoContext();
      
      // Get all comments on the PR
      const commentsCommand = `pr view ${prNumber} ${repoContext} --json comments`;
      const result = await this.executeGhCommand<{ comments: any[] }>(commentsCommand);
      
      const botComments: GitHubReviewComment[] = [];
      
      // Filter for bot comments (expanded to include Claude and other automation)
      for (const comment of result.comments) {
        const authorLogin = comment.author?.login?.toLowerCase() || '';
        
        // Check if the author is a bot or automation system
        const isBotComment =
          authorLogin.includes('bot') ||
          authorLogin === 'github-actions' ||
          authorLogin.includes('claude') ||
          authorLogin.includes('automated') ||
          // Check for agent analysis content patterns
          comment.body?.includes('Agent Test Results Overview') ||
          comment.body?.includes('Detailed Failure Analysis') ||
          comment.body?.includes('## Agent Test Results Overview');
        
        if (isBotComment) {
          botComments.push({
            id: comment.databaseId || comment.id || Date.now(),
            pull_request_number: prNumber,
            user: {
              login: comment.author?.login || 'bot',
              avatar_url: comment.author?.avatarUrl,
            },
            body: comment.body || '',
            created_at: comment.createdAt,
            updated_at: comment.updatedAt || comment.createdAt,
            html_url: comment.url || `https://github.com/${this.repositoryOwner}/${this.repositoryName}/pull/${prNumber}`,
            in_reply_to_id: null,
          });
        }
      }
      
      this.logger.info({ prNumber, count: botComments.length }, 'Found bot comments for PR');
      return botComments;
    } catch (error) {
      this.logger.error({ prNumber, error }, 'Error fetching workflow bot comments for PR');
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
      this.logger.error({ prNumber, error }, 'Error fetching PR');
      return null;
    }
  }

  /**
   * Get files changed in a pull request
   */
  async getPRFiles(prNumber: number): Promise<any[]> {
    try {
      // Use GitHub API to get PR files with additions and deletions
      const filesCommand = `api repos/${this.repositoryOwner}/${this.repositoryName}/pulls/${prNumber}/files --jq '.[] | {name: .filename, path: .filename, sha: .sha, size: (.additions + .deletions), additions: .additions, deletions: .deletions, type: "file", download_url: .raw_url}'`;
      const { stdout } = await execAsync(`gh ${filesCommand}`);
      
      // Parse newline-delimited JSON
      const files = stdout
        .trim()
        .split('\n')
        .filter(line => line)
        .map(line => JSON.parse(line));
      
      return files;
    } catch (error) {
      this.logger.error({ prNumber, error }, 'Error fetching PR files');
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
      this.logger.error({ prNumber, filePath, error }, 'Error fetching file content');
      return null;
    }
  }

  

  

  /**
   * List all tasks in a PR by discovering task subdirectories (not just task.yaml files)
   * Returns array of {taskId, pathPrefix, taskYaml}
   */
  async listPRTasks(prNumber: number): Promise<Array<{ taskId: string; pathPrefix: string; taskYaml: any }>> {
    try {
      const files = await this.getPRFiles(prNumber);
      
      // Find all unique task subdirectories under tasks/
      const taskSubdirs = new Set<string>();
      files.forEach(f => {
        if (f.path.startsWith('tasks/')) {
          const parts = f.path.split('/');
          if (parts.length > 1) {
            taskSubdirs.add(parts[1]); // Extract task subdirectory name
          }
        }
      });
      
      if (taskSubdirs.size === 0) {
        this.logger.info({ prNumber }, 'No task subdirectories found in PR');
        return [];
      }

      this.logger.info({ prNumber, taskCount: taskSubdirs.size, tasks: Array.from(taskSubdirs) }, 'Found task subdirectories in PR');

      // For each task subdirectory, try to find and parse task.yaml
      const tasks = await Promise.all(
        Array.from(taskSubdirs).map(async (taskId) => {
          try {
            const pathPrefix = `tasks/${taskId}`;
            
            // Try to find task.yaml in this subdirectory
            const taskYamlPath = `${pathPrefix}/task.yaml`;
            const taskYmlPath = `${pathPrefix}/task.yml`;
            
            let taskYaml = null;
            
            // Try to fetch and parse task.yaml if it exists
            try {
              let content = await this.getPRFileContent(prNumber, taskYamlPath);
              if (!content) {
                content = await this.getPRFileContent(prNumber, taskYmlPath);
              }
              if (content) {
                taskYaml = yaml.load(content);
              }
            } catch (error) {
              this.logger.warn({ taskId, prNumber }, 'task.yaml not found for task, including task without yaml');
            }

            return { taskId, pathPrefix, taskYaml };
          } catch (error) {
            this.logger.error({ taskId, prNumber, error }, 'Error processing task');
            return { taskId, pathPrefix: `tasks/${taskId}`, taskYaml: null };
          }
        })
      );

      this.logger.info({ prNumber, taskCount: tasks.length, subdirCount: taskSubdirs.size }, 'Returning tasks from subdirectories');
      return tasks;
    } catch (error) {
      this.logger.error({ prNumber, error }, 'Error listing tasks for PR');
      return [];
    }
  }

  /**
   * Get commit details including message and email
   */
  async getCommitDetails(commitSha: string): Promise<{ message: string; author: string; email: string } | null> {
    try {
      const commitCommand = `api repos/${this.repositoryOwner}/${this.repositoryName}/commits/${commitSha} --jq '{message: .commit.message, author: .commit.author.name, email: .commit.author.email}'`;
      const { stdout } = await execAsync(`gh ${commitCommand}`);
      
      return JSON.parse(stdout.trim());
    } catch (error) {
      this.logger.error({ commitSha, error }, 'Error fetching commit details');
      return null;
    }
  }

  /**
   * Get all commits for a pull request
   */
  async getPRCommits(prNumber: number): Promise<Array<{ sha: string; message: string; author: string; date: string }>> {
    try {
      // Use GitHub API to get PR commits
      const commitsCommand = `api repos/${this.repositoryOwner}/${this.repositoryName}/pulls/${prNumber}/commits --jq '.[] | {sha: .sha, message: .commit.message, author: .commit.author.name, date: .commit.author.date}'`;
      const { stdout } = await execAsync(`gh ${commitsCommand}`);
      
      // Parse newline-delimited JSON
      const commits = stdout
        .trim()
        .split('\n')
        .filter(line => line)
        .map(line => JSON.parse(line));
      
      return commits;
    } catch (error) {
      this.logger.error({ prNumber, error }, 'Error fetching commits for PR');
      return [];
    }
  }

  /**
   * Get jobs for a workflow run (to show individual agent results)
   */
  async getWorkflowJobs(runId: number): Promise<Array<{ name: string; conclusion: string | null; status: string }>> {
    try {
      const jobsCommand = `api repos/${this.repositoryOwner}/${this.repositoryName}/actions/runs/${runId}/jobs --jq '.jobs[] | {name: .name, conclusion: .conclusion, status: .status}'`;
      const { stdout } = await execAsync(`gh ${jobsCommand}`);
      
      // Parse newline-delimited JSON
      const jobs = stdout
        .trim()
        .split('\n')
        .filter(line => line)
        .map(line => JSON.parse(line));
      
      return jobs;
    } catch (error) {
      this.logger.error({ runId, error }, 'Error fetching jobs for run');
      return [];
    }
  }

  /**
   * Download artifact and extract log files
   */
  async getArtifactLogFiles(artifactId: number): Promise<Array<{ name: string; path: string }>> {
    try {
      // Download artifact zip
      const downloadCommand = `api repos/${this.repositoryOwner}/${this.repositoryName}/actions/artifacts/${artifactId}/zip`;
      const { stdout } = await execAsync(`gh ${downloadCommand}`, {
        encoding: 'buffer',
        maxBuffer: 50 * 1024 * 1024
      });
      
      // Extract zip and find log files
      const zip = new AdmZip(stdout);
      const zipEntries = zip.getEntries();
      
      const logFiles: Array<{ name: string; path: string }> = [];
      zipEntries.forEach((entry: any) => {
        if (!entry.isDirectory && entry.entryName.endsWith('.log')) {
          logFiles.push({
            name: entry.entryName.split('/').pop() || entry.entryName,
            path: entry.entryName
          });
        }
      });
      
      return logFiles;
    } catch (error: any) {
      // Check if artifact has expired
      if (error.message?.includes('Artifact has expired') || error.stderr?.includes('HTTP 410')) {
        this.logger.warn({ artifactId }, 'Artifact has expired');
        return [];
      }
      this.logger.error({ artifactId, error }, 'Error extracting log files from artifact');
      return [];
    }
  }

  /**
   * Get specific log file content from artifact
   */
  async getArtifactLogContent(artifactId: number, filePath: string): Promise<string | null> {
    try {
      // Decode URL-encoded path safely (handle double-encoding)
      let decodedPath = filePath;
      try {
        // Decode until no more changes (handles multiple encoding layers)
        let previousPath = '';
        while (previousPath !== decodedPath) {
          previousPath = decodedPath;
          decodedPath = decodeURIComponent(decodedPath);
        }
      } catch (decodeError) {
        this.logger.warn({ filePath, error: decodeError }, 'Failed to decode path, using as-is');
        decodedPath = filePath;
      }

      // Validate path to prevent directory traversal
      const normalizedPath = decodedPath.replace(/\\/g, '/').replace(/\/+/g, '/');
      if (normalizedPath.includes('../') || normalizedPath.includes('..\\') || normalizedPath.startsWith('/')) {
        this.logger.error({ filePath, normalizedPath }, 'Invalid file path (directory traversal detected)');
        return null;
      }

      // Download artifact zip
      const downloadCommand = `api repos/${this.repositoryOwner}/${this.repositoryName}/actions/artifacts/${artifactId}/zip`;
      const { stdout } = await execAsync(`gh ${downloadCommand}`, {
        encoding: 'buffer',
        maxBuffer: 50 * 1024 * 1024
      });
      
      // Extract specific file using normalized path
      const zip = new AdmZip(stdout);
      const entry = zip.getEntry(normalizedPath);
      
      if (!entry) {
        this.logger.error({ artifactId, normalizedPath, originalPath: filePath }, 'File not found in artifact');
        return null;
      }
      
      return zip.readAsText(entry);
    } catch (error: any) {
      // Check if artifact has expired
      if (error.message?.includes('Artifact has expired') || error.stderr?.includes('HTTP 410')) {
        this.logger.warn({ artifactId, filePath }, 'Artifact has expired, cannot read log file');
        return null;
      }
      this.logger.error({ artifactId, filePath, error }, 'Error reading log file from artifact');
      return null;
    }
  }

  /**
   * Get repository statistics (PR counts by state) using GitHub Search API
   */
  async getRepositoryStats(): Promise<{ open: number; closed: number; merged: number }> {
    try {
      this.logger.info({ repo: `${this.repositoryOwner}/${this.repositoryName}` }, 'Getting repository stats');
      
      // Use the working GitHub Search API format
      const openCommand = `api 'search/issues?q=repo:${this.repositoryOwner}/${this.repositoryName}+is:pr+is:open' --jq '.total_count'`;
      const closedCommand = `api 'search/issues?q=repo:${this.repositoryOwner}/${this.repositoryName}+is:pr+is:closed' --jq '.total_count'`;
      const mergedCommand = `api 'search/issues?q=repo:${this.repositoryOwner}/${this.repositoryName}+is:pr+is:merged' --jq '.total_count'`;
      
      this.logger.debug('Executing GitHub Search API commands for repository stats');
      
      const [openResult, closedResult, mergedResult] = await Promise.all([
        execAsync(`gh ${openCommand}`, { maxBuffer: 10 * 1024 * 1024 }),
        execAsync(`gh ${closedCommand}`, { maxBuffer: 10 * 1024 * 1024 }),
        execAsync(`gh ${mergedCommand}`, { maxBuffer: 10 * 1024 * 1024 })
      ]);
      
      const open = parseInt(openResult.stdout.trim()) || 0;
      const merged = parseInt(mergedResult.stdout.trim()) || 0;
      const totalClosed = parseInt(closedResult.stdout.trim()) || 0;
      const closed = Math.max(0, totalClosed - merged); // Closed but not merged
      
      this.logger.info({ open, totalClosed, merged, closed }, 'Repository stats computed');
      
      return { open, closed, merged };
    } catch (error) {
      this.logger.error({ error }, 'Error fetching repository stats');
      return { open: 0, closed: 0, merged: 0 };
    }
  }

  /**
   * List all pull requests using GitHub GraphQL API (single call, no pagination complexity)
   * Optimized for sidebar with minimal fields only
   */
  async listPullRequests(
    state: 'open' | 'closed' | 'all' = 'all',
    limit: number = 1000,
    sortBy: 'created' | 'updated' = 'created',
    sortDirection: 'asc' | 'desc' = 'desc'
  ): Promise<GitHubPullRequest[]> {
    try {
      this.logger.info({
        repo: `${this.repositoryOwner}/${this.repositoryName}`,
        limit,
        state,
        sortBy
      }, 'Fetching PRs using GitHub GraphQL API');
      
      // Map states to GraphQL format
      let states = 'OPEN, CLOSED, MERGED';
      if (state === 'open') states = 'OPEN';
      if (state === 'closed') states = 'CLOSED, MERGED';
      
      // Map sort field
      const sortField = sortBy === 'created' ? 'CREATED_AT' : 'UPDATED_AT';
      const direction = sortDirection.toUpperCase();
      
      // Use official GraphQL hasNextPage pattern (GitHub best practice)
      // More robust than pre-calculating calls - handles dynamic data changes
      const allPRs: any[] = [];
      let hasNextPage = true;
      let currentCursor: string | null = null;
      let callCount = 0;
      let totalAvailable = 0;
      
      this.logger.debug({ limit }, 'Starting GraphQL cursor pagination');
      
      // Official GitHub GraphQL pagination pattern: loop while hasNextPage
      while (hasNextPage && allPRs.length < limit && callCount < 10) { // Safety limit
        callCount++;
        
        // Build GraphQL query with cursor for next page
        const afterClause = currentCursor ? `, after: "${currentCursor}"` : '';
        const pageSize = Math.min(limit - allPRs.length, 100); // GitHub limit: 100 per call
        
        const graphqlQuery = `query {
          repository(owner: "${this.repositoryOwner}", name: "${this.repositoryName}") {
            pullRequests(first: ${pageSize}, orderBy: {field: ${sortField}, direction: ${direction}}, states: [${states}]${afterClause}) {
              totalCount
              pageInfo {
                hasNextPage
                endCursor
              }
              nodes {
                number
                title
                state
                isDraft
                createdAt
                updatedAt
                mergedAt
                author {
                  login
                }
              }
            }
          }
        }`;
        
        this.logger.debug({
          callCount,
          pageSize,
          cursor: currentCursor?.substring(0, 10),
          isFirstPage: !currentCursor
        }, 'GraphQL pagination call');
        
        try {
          const { stdout } = await execAsync(`gh api graphql -f query='${graphqlQuery}'`, {
            maxBuffer: 50 * 1024 * 1024
          });
          
          const result = JSON.parse(stdout);
          
          if (result.errors) {
            this.logger.error({ callCount, errors: result.errors }, 'GraphQL errors in pagination call');
            break;
          }
          
          const pullRequestsData = result.data.repository.pullRequests;
          totalAvailable = pullRequestsData.totalCount;
          
          this.logger.debug({
            callCount,
            received: pullRequestsData.nodes.length,
            hasNext: pullRequestsData.pageInfo.hasNextPage,
            totalFetched: allPRs.length + pullRequestsData.nodes.length,
            totalAvailable
          }, 'GraphQL pagination call result');
          
          // Add PRs to our collection
          allPRs.push(...pullRequestsData.nodes);
          
          // Use GitHub's hasNextPage to decide if we continue (official pattern)
          hasNextPage = pullRequestsData.pageInfo.hasNextPage;
          currentCursor = pullRequestsData.pageInfo.endCursor;
          
          // Safety checks
          if (pullRequestsData.nodes.length === 0) {
            this.logger.warn({ callCount }, 'No PRs returned on pagination call, stopping');
            break;
          }
          
        } catch (error: any) {
          this.logger.error({ callCount, error: error.message }, 'GraphQL pagination call failed');
          break;
        }
      }
      
      this.logger.info({ 
  fetched: allPRs.length, 
  totalAvailable, 
  callCount, 
  method: 'GraphQL hasNextPage pattern' 
}, 'GraphQL pagination complete');
      
      // Map to our schema format
      const mappedPRs: GitHubPullRequest[] = allPRs.map((pr: any) => ({
        number: pr.number,
        title: pr.title,
        state: pr.state === 'MERGED' ? 'closed' as const : pr.state.toLowerCase() as 'open' | 'closed',
        draft: pr.isDraft || false,
        user: {
          login: pr.author?.login || 'unknown',
        },
        created_at: pr.createdAt,
        updated_at: pr.updatedAt,
        merged_at: pr.mergedAt,
        html_url: `https://github.com/${this.repositoryOwner}/${this.repositoryName}/pull/${pr.number}`,
        head: {
          ref: '', // Not needed for sidebar, filled by detailed fetch
          sha: '',
        },
        base: {
          ref: '',
          sha: '',
        },
      }));
      
      this.logger.info({ count: mappedPRs.length, method: 'GraphQL cursor pagination' }, 'Returning PRs to client');
      return mappedPRs;
    } catch (error: any) {
      this.logger.error({ error }, 'Error fetching pull requests with GitHub GraphQL API');
      
      // Check for authentication issues
      if (error.message?.includes('authentication') || error.stderr?.includes('authentication')) {
        this.logger.error('GitHub authentication failed. Please run: gh auth login');
      }
      
      return [];
    }
  }
}
