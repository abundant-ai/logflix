import { Octokit } from '@octokit/rest';
import { paginateRest } from '@octokit/plugin-paginate-rest';
import { throttling } from '@octokit/plugin-throttling';
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
} from '@logflix/shared/schema';

// Extend Octokit with plugins
const OctokitWithPlugins = Octokit.plugin(paginateRest, throttling);

/**
 * Create Octokit client with throttling and pagination plugins
 */
function createOctokitClient(githubToken: string, logger?: Logger) {
  return new OctokitWithPlugins({
    auth: githubToken,
    userAgent: 'LogFlix-App/1.0.0',
    throttle: {
      onRateLimit: (retryAfter, options, octokit, retryCount) => {
        if (logger) {
          logger.warn({
            method: options.method,
            url: options.url,
            retryAfter,
            retryCount,
          }, 'Request quota exhausted');
        }

        // Retry up to 2 times
        if (retryCount < 2) {
          if (logger) {
            logger.info(`Retrying after ${retryAfter} seconds`);
          }
          return true;
        }
        return false;
      },
      onSecondaryRateLimit: (retryAfter, options, octokit, retryCount) => {
        if (logger) {
          logger.warn({
            method: options.method,
            url: options.url,
            retryAfter,
            retryCount,
          }, 'Secondary rate limit hit');
        }

        // Retry secondary rate limits once
        if (retryCount < 1) {
          if (logger) {
            logger.info(`Retrying after ${retryAfter} seconds`);
          }
          return true;
        }
        return false;
      },
    },
    request: {
      retries: 3,
      retryAfter: 3,
    },
    log: logger ? {
      debug: (msg: string, info?: any) => logger.debug(info, msg),
      info: (msg: string, info?: any) => logger.info(info, msg),
      warn: (msg: string, info?: any) => logger.warn(info, msg),
      error: (msg: string, info?: any) => logger.error(info, msg),
    } : undefined,
  });
}

export class GitHubOctokitService {
  private repositoryOwner: string;
  private repositoryName: string;
  private workflowFileName: string;
  private logger: Logger;
  private octokit: InstanceType<typeof OctokitWithPlugins>;

  constructor(owner?: string, repo?: string, workflow?: string, logger?: Logger, githubToken?: string) {
    this.repositoryOwner = owner || 'abundant-ai';
    this.repositoryName = repo || 'tbench-hammer';
    this.workflowFileName = workflow || 'test-tasks.yaml';
    this.logger = logger?.child({
      component: 'GitHubOctokitService',
      repo: `${this.repositoryOwner}/${this.repositoryName}`,
      workflow: this.workflowFileName,
      hasToken: !!githubToken
    }) || console as any;

    if (!githubToken) {
      throw new Error('GitHub token is required for GitHubOctokitService');
    }

    this.octokit = createOctokitClient(githubToken, this.logger);
  }

  /**
   * Get workflow hierarchy with runs, logs, and artifacts
   */
  async getHierarchy(limit: number = 30): Promise<GitHubWorkflowHierarchy> {
    try {
      this.logger.debug({ limit }, 'Fetching workflow hierarchy using Octokit');
      
      // List workflow runs for the specific workflow
      const { data: runsResponse } = await this.octokit.actions.listWorkflowRuns({
        owner: this.repositoryOwner,
        repo: this.repositoryName,
        workflow_id: this.workflowFileName,
        per_page: Math.min(limit, 100),
      });

      const workflowRuns = await Promise.all(
        runsResponse.workflow_runs.slice(0, limit).map(async (run) => {
          try {
            // Fetch logs and artifacts in parallel
            const [logs, artifacts] = await Promise.allSettled([
              this.getWorkflowRunLogs(run.id),
              this.getWorkflowRunArtifacts(run.id),
            ]);

            return {
              run: {
                id: run.id,
                name: run.display_title || run.name || null,
                status: run.status as 'queued' | 'in_progress' | 'completed',
                conclusion: run.conclusion as 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | null,
                created_at: run.created_at,
                updated_at: run.updated_at,
                html_url: run.html_url,
                workflow_id: run.workflow_id,
                workflow_name: 'Test Tasks with Multiple Agents', // Static name for consistency
                head_sha: run.head_sha,
                head_branch: run.head_branch,
                run_number: run.run_number,
                run_attempt: run.run_attempt || 1,
              } as GitHubWorkflowRun,
              logs: logs.status === 'fulfilled' ? logs.value : undefined,
              artifacts: artifacts.status === 'fulfilled' ? artifacts.value : undefined,
              hasData: (logs.status === 'fulfilled' && logs.value.length > 0) ||
                       (artifacts.status === 'fulfilled' && artifacts.value.length > 0),
            };
          } catch (error) {
            this.logger.error({ runId: run.id, error }, 'Error fetching data for workflow run');
            return {
              run: {
                id: run.id,
                name: run.display_title || run.name || null,
                status: run.status as 'queued' | 'in_progress' | 'completed',
                conclusion: run.conclusion as 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | null,
                created_at: run.created_at,
                updated_at: run.updated_at,
                html_url: run.html_url,
                workflow_id: run.workflow_id,
                workflow_name: 'Test Tasks with Multiple Agents',
                head_sha: run.head_sha,
                head_branch: run.head_branch,
                run_number: run.run_number,
                run_attempt: run.run_attempt || 1,
              } as GitHubWorkflowRun,
              hasData: false,
            };
          }
        })
      );

      return {
        workflow_runs: workflowRuns,
        total_count: Math.min(runsResponse.total_count, workflowRuns.length),
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
   * Get workflow run logs by downloading and concatenating log files
   */
  async getWorkflowRunLogs(runId: number): Promise<GitHubWorkflowLog[]> {
    try {
      this.logger.debug({ runId }, 'Downloading workflow run logs via Octokit');

      // Download logs zip file
      const response = await this.octokit.actions.downloadWorkflowRunLogs({
        owner: this.repositoryOwner,
        repo: this.repositoryName,
        run_id: runId,
      });

      // Follow redirect to get the actual zip content
      const zipResponse = await fetch(response.url);
      const zipBuffer = Buffer.from(await zipResponse.arrayBuffer());
      
      // Extract and concatenate all log files
      const zip = new AdmZip(zipBuffer);
      const entries = zip.getEntries();
      
      let allLogContent = '';
      entries.forEach(entry => {
        if (!entry.isDirectory && entry.entryName.endsWith('.txt')) {
          const content = zip.readAsText(entry);
          allLogContent += `\n=== ${entry.entryName} ===\n${content}\n`;
        }
      });

      // Create a single log entry with all content (matches current UI expectations)
      const logs: GitHubWorkflowLog[] = [{
        job_name: 'Workflow Run',
        job_id: runId,
        content: allLogContent,
        steps: [],
      }];

      return logs;
    } catch (error) {
      this.logger.error({ runId, error }, 'Error fetching workflow run logs');
      return [];
    }
  }

  /**
   * Get workflow run artifacts
   */
  async getWorkflowRunArtifacts(runId: number): Promise<GitHubWorkflowArtifact[]> {
    try {
      const artifacts = await this.octokit.paginate(this.octokit.actions.listWorkflowRunArtifacts, {
        owner: this.repositoryOwner,
        repo: this.repositoryName,
        run_id: runId,
        per_page: 100,
      });

      return artifacts.map(artifact => ({
        id: artifact.id,
        name: artifact.name,
        size_in_bytes: artifact.size_in_bytes,
        download_url: artifact.archive_download_url,
        created_at: artifact.created_at,
        updated_at: artifact.updated_at,
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
      if (!runId) {
        return null;
      }

      // List artifacts to find the one with matching name
      const artifacts = await this.getWorkflowRunArtifacts(runId);
      const artifact = artifacts.find(a => a.name === artifactName);
      
      if (!artifact) {
        this.logger.warn({ artifactName, runId }, 'Artifact not found');
        return null;
      }

      // Download the artifact (this returns a redirect URL)
      await this.octokit.actions.downloadArtifact({
        owner: this.repositoryOwner,
        repo: this.repositoryName,
        artifact_id: artifact.id,
        archive_format: 'zip',
      });
      
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
      const response = await this.octokit.actions.downloadArtifact({
        owner: this.repositoryOwner,
        repo: this.repositoryName,
        artifact_id: artifactId,
        archive_format: 'zip',
      });

      // Follow redirect to get the zip content
      const zipResponse = await fetch(response.url);
      const zipBuffer = Buffer.from(await zipResponse.arrayBuffer());
      
      // Extract zip and find cast files
      const zip = new AdmZip(zipBuffer);
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
      if (error.status === 410 || error.message?.includes('Artifact has expired')) {
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
      const response = await this.octokit.actions.downloadArtifact({
        owner: this.repositoryOwner,
        repo: this.repositoryName,
        artifact_id: artifactId,
        archive_format: 'zip',
      });

      // Follow redirect to get the zip content
      const zipResponse = await fetch(response.url);
      const zipBuffer = Buffer.from(await zipResponse.arrayBuffer());
      
      // Extract specific file using normalized path
      const zip = new AdmZip(zipBuffer);
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
      if (error.status === 410 || error.message?.includes('Artifact has expired')) {
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
      const { data: run } = await this.octokit.actions.getWorkflowRun({
        owner: this.repositoryOwner,
        repo: this.repositoryName,
        run_id: runId,
      });
      
      return {
        id: run.id,
        name: run.display_title || run.name || null,
        status: run.status as 'queued' | 'in_progress' | 'completed',
        conclusion: run.conclusion as 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | null,
        created_at: run.created_at,
        updated_at: run.updated_at,
        html_url: run.html_url,
        workflow_id: run.workflow_id,
        workflow_name: 'Test Tasks with Multiple Agents',
        head_sha: run.head_sha,
        head_branch: run.head_branch,
        run_number: run.run_number,
        run_attempt: run.run_attempt || 1,
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
      const pulls = await this.octokit.paginate(this.octokit.repos.listPullRequestsAssociatedWithCommit, {
        owner: this.repositoryOwner,
        repo: this.repositoryName,
        commit_sha: commitSha,
        per_page: 100,
      });
      
      return pulls.map(pr => ({
        number: pr.number,
        title: pr.title,
        state: pr.state as 'open' | 'closed',
        user: {
          login: pr.user?.login || 'unknown',
        },
        created_at: pr.created_at,
        updated_at: pr.updated_at,
        merged_at: pr.merged_at,
        html_url: pr.html_url,
        head: {
          ref: pr.head.ref,
          sha: pr.head.sha,
        },
        base: {
          ref: pr.base.ref,
          sha: pr.base.sha,
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
      const reviews = await this.octokit.paginate(this.octokit.pulls.listReviews, {
        owner: this.repositoryOwner,
        repo: this.repositoryName,
        pull_number: prNumber,
        per_page: 100,
      });
      
      const comments: GitHubReviewComment[] = [];
      
      // Parse review comments from the reviews
      for (const review of reviews) {
        if (review.body) {
          comments.push({
            id: review.id,
            pull_request_number: prNumber,
            user: {
              login: review.user?.login || 'unknown',
              avatar_url: review.user?.avatar_url,
            },
            body: review.body,
            created_at: review.submitted_at || new Date().toISOString(),
            updated_at: review.submitted_at || new Date().toISOString(),
            html_url: review.html_url,
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
   * Get workflow runs associated with a pull request
   * CRITICAL: Must preserve the exact logic for finding "Test Tasks with Multiple Agents" runs
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

      const allRuns: GitHubWorkflowRun[] = [];
      
      for (const commit of commits) {
        try {
          // Get runs for this specific commit and workflow
          const { data: runsResponse } = await this.octokit.actions.listWorkflowRuns({
            owner: this.repositoryOwner,
            repo: this.repositoryName,
            workflow_id: this.workflowFileName, // Use file name: test-tasks.yaml
            head_sha: commit.sha,
            per_page: 100,
          });
          
          this.logger.info({
            commitSha: commit.sha.substring(0, 7),
            runsFound: runsResponse.workflow_runs.length,
            runNumbers: runsResponse.workflow_runs.map(r => `#${r.run_number}.${r.run_attempt || 1}`)
          }, 'Found runs for commit');

          // For each run found, check if it has multiple attempts
          for (const run of runsResponse.workflow_runs) {
            try {
              // First, add the current attempt (what we have from list runs)
              const currentRun: GitHubWorkflowRun = {
                id: run.id,
                name: run.display_title || run.name || null,
                status: run.status as 'queued' | 'in_progress' | 'completed',
                conclusion: run.conclusion as 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | null,
                created_at: run.created_at,
                updated_at: run.updated_at,
                html_url: run.html_url,
                workflow_id: run.workflow_id,
                workflow_name: 'Test Tasks with Multiple Agents',
                head_sha: run.head_sha,
                head_branch: run.head_branch,
                run_number: run.run_number,
                run_attempt: run.run_attempt || 1,
              };

              // Check if this run has previous attempts (run_attempt > 1)
              const maxAttempt = run.run_attempt || 1;
              if (maxAttempt > 1) {
                this.logger.info({
                  runId: run.id,
                  runNumber: run.run_number,
                  maxAttempt
                }, 'Run has multiple attempts, fetching previous attempts');

                // Fetch all attempts for this run
                const allAttempts = [currentRun];
                
                for (let attemptNum = 1; attemptNum < maxAttempt; attemptNum++) {
                  try {
                    const { data: prevAttempt } = await this.octokit.actions.getWorkflowRunAttempt({
                      owner: this.repositoryOwner,
                      repo: this.repositoryName,
                      run_id: run.id,
                      attempt_number: attemptNum,
                    });
                    
                    const prevRun: GitHubWorkflowRun = {
                      id: run.id * 1000 + attemptNum, // Unique ID for each attempt
                      name: prevAttempt.display_title || prevAttempt.name || null,
                      status: prevAttempt.status as 'queued' | 'in_progress' | 'completed',
                      conclusion: prevAttempt.conclusion as 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | null,
                      created_at: prevAttempt.created_at,
                      updated_at: prevAttempt.updated_at,
                      html_url: `${prevAttempt.html_url}/attempts/${attemptNum}`,
                      workflow_id: prevAttempt.workflow_id,
                      workflow_name: 'Test Tasks with Multiple Agents',
                      head_sha: prevAttempt.head_sha,
                      head_branch: prevAttempt.head_branch,
                      run_number: prevAttempt.run_number,
                      run_attempt: prevAttempt.run_attempt || attemptNum,
                    };
                    
                    allAttempts.unshift(prevRun); // Add to beginning (chronological order)
                  } catch (prevError: any) {
                    this.logger.debug({ runId: run.id, attemptNum, error: prevError.message }, 'Could not fetch previous attempt');
                    break;
                  }
                }
                
                if (allAttempts.length > 1) {
                  this.logger.info({
                    runId: run.id,
                    runNumber: run.run_number,
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
              this.logger.warn({ runId: run.id, error: attemptError.message }, 'Error processing attempts for run');
              
              // Fallback to just the basic run
              allRuns.push({
                id: run.id,
                name: run.display_title || run.name || null,
                status: run.status as 'queued' | 'in_progress' | 'completed' | 'requested' | 'waiting' | 'pending',
                conclusion: run.conclusion as 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | null,
                created_at: run.created_at,
                updated_at: run.updated_at,
                html_url: run.html_url,
                workflow_id: run.workflow_id,
                workflow_name: 'Test Tasks with Multiple Agents',
                head_sha: run.head_sha,
                head_branch: run.head_branch,
                run_number: run.run_number,
                run_attempt: run.run_attempt || 1,
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
   * Get workflow bot comments on a pull request
   */
  async getWorkflowBotComments(prNumber: number): Promise<GitHubReviewComment[]> {
    try {
      // Get all comments on the PR
      const comments = await this.octokit.paginate(this.octokit.issues.listComments, {
        owner: this.repositoryOwner,
        repo: this.repositoryName,
        issue_number: prNumber, // PR comments use issue_number
        per_page: 100,
      });
      
      const botComments: GitHubReviewComment[] = [];
      
      // Filter for bot comments (expanded to include Claude and other automation)
      for (const comment of comments) {
        const authorLogin = comment.user?.login?.toLowerCase() || '';
        
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
            id: comment.id,
            pull_request_number: prNumber,
            user: {
              login: comment.user?.login || 'bot',
              avatar_url: comment.user?.avatar_url,
            },
            body: comment.body || '',
            created_at: comment.created_at,
            updated_at: comment.updated_at,
            html_url: comment.html_url,
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
      const { data: pr } = await this.octokit.pulls.get({
        owner: this.repositoryOwner,
        repo: this.repositoryName,
        pull_number: prNumber,
      });
      
      return {
        number: pr.number,
        title: pr.title,
        state: pr.state as 'open' | 'closed',
        user: {
          login: pr.user?.login || 'unknown',
        },
        created_at: pr.created_at,
        updated_at: pr.updated_at,
        merged_at: pr.merged_at,
        html_url: pr.html_url,
        head: {
          ref: pr.head.ref,
          sha: pr.head.sha,
        },
        base: {
          ref: pr.base.ref,
          sha: pr.base.sha,
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
      this.logger.debug({ prNumber }, 'Fetching PR files with pagination');

      const files = await this.octokit.paginate(this.octokit.pulls.listFiles, {
        owner: this.repositoryOwner,
        repo: this.repositoryName,
        pull_number: prNumber,
        per_page: 100,
      });

      const mappedFiles = files.map(file => ({
        name: file.filename,
        path: file.filename,
        sha: file.sha,
        size: file.additions + file.deletions,
        additions: file.additions,
        deletions: file.deletions,
        type: "file",
        download_url: file.raw_url,
      }));

      this.logger.info({
        prNumber,
        fileCount: mappedFiles.length
      }, 'Fetched PR files');

      // Warn if we're approaching GitHub's limits
      if (mappedFiles.length > 2500) {
        this.logger.warn({
          prNumber,
          fileCount: mappedFiles.length
        }, 'PR has very large number of files - approaching GitHub API limits (3000 max)');
      }

      return mappedFiles;
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
      const { data: content } = await this.octokit.repos.getContent({
        owner: this.repositoryOwner,
        repo: this.repositoryName,
        path: filePath,
        ref: pr.head.sha,
      });
      
      // Decode base64 content
      if ('content' in content && typeof content.content === 'string') {
        return Buffer.from(content.content, 'base64').toString('utf-8');
      }
      
      return null;
    } catch (error) {
      this.logger.error({ prNumber, filePath, error }, 'Error fetching file content');
      return null;
    }
  }

  /**
   * List all tasks in a PR by discovering task subdirectories
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

            // Fetch via PR file content (uses HEAD commit)
            try {
              let content = await this.getPRFileContent(prNumber, taskYamlPath);
              if (!content) {
                content = await this.getPRFileContent(prNumber, taskYmlPath);
              }
              if (content) {
                taskYaml = yaml.load(content);
              }
            } catch (error) {
              this.logger.warn({ taskId, prNumber, error }, 'task.yaml not found at HEAD commit for task');
            }

            return { taskId, pathPrefix, taskYaml };
          } catch (error) {
            this.logger.error({ taskId, prNumber, error }, 'Error processing task');
            return { taskId, pathPrefix: `tasks/${taskId}`, taskYaml: null };
          }
        })
      );

      this.logger.info({
        prNumber,
        taskCount: tasks.length,
        subdirCount: taskSubdirs.size,
        tasksWithYaml: tasks.filter(t => t.taskYaml).length,
        tasksWithoutYaml: tasks.filter(t => !t.taskYaml).length
      }, 'Returning tasks from subdirectories');

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
      const { data: commit } = await this.octokit.repos.getCommit({
        owner: this.repositoryOwner,
        repo: this.repositoryName,
        ref: commitSha,
      });
      
      return {
        message: commit.commit.message,
        author: commit.commit.author?.name || 'Unknown',
        email: commit.commit.author?.email || 'unknown@example.com',
      };
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
      const commits = await this.octokit.paginate(this.octokit.pulls.listCommits, {
        owner: this.repositoryOwner,
        repo: this.repositoryName,
        pull_number: prNumber,
        per_page: 100,
      });
      
      return commits.map(commit => ({
        sha: commit.sha,
        message: commit.commit.message,
        author: commit.commit.author?.name || 'Unknown',
        date: commit.commit.author?.date || new Date().toISOString(),
      }));
    } catch (error) {
      this.logger.error({ prNumber, error }, 'Error fetching commits for PR');
      return [];
    }
  }

  /**
   * Get jobs for a workflow run
   */
  async getWorkflowJobs(runId: number): Promise<Array<{ name: string; conclusion: string | null; status: string }>> {
    try {
      const jobs = await this.octokit.paginate(this.octokit.actions.listJobsForWorkflowRun, {
        owner: this.repositoryOwner,
        repo: this.repositoryName,
        run_id: runId,
        per_page: 100,
      });
      
      return jobs.map(job => ({
        name: job.name,
        conclusion: job.conclusion,
        status: job.status,
      }));
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
      const response = await this.octokit.actions.downloadArtifact({
        owner: this.repositoryOwner,
        repo: this.repositoryName,
        artifact_id: artifactId,
        archive_format: 'zip',
      });

      // Follow redirect to get the zip content
      const zipResponse = await fetch(response.url);
      const zipBuffer = Buffer.from(await zipResponse.arrayBuffer());
      
      // Extract zip and find log files
      const zip = new AdmZip(zipBuffer);
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
      if (error.status === 410 || error.message?.includes('Artifact has expired')) {
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
      const response = await this.octokit.actions.downloadArtifact({
        owner: this.repositoryOwner,
        repo: this.repositoryName,
        artifact_id: artifactId,
        archive_format: 'zip',
      });

      // Follow redirect to get the zip content
      const zipResponse = await fetch(response.url);
      const zipBuffer = Buffer.from(await zipResponse.arrayBuffer());
      
      // Extract specific file using normalized path
      const zip = new AdmZip(zipBuffer);
      const entry = zip.getEntry(normalizedPath);
      
      if (!entry) {
        this.logger.error({ artifactId, normalizedPath, originalPath: filePath }, 'File not found in artifact');
        return null;
      }
      
      return zip.readAsText(entry);
    } catch (error: any) {
      // Check if artifact has expired
      if (error.status === 410 || error.message?.includes('Artifact has expired')) {
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
  async getRepositoryStats(): Promise<{ open: number; closed: number; merged: number; draft: number }> {
    try {
      this.logger.info({ repo: `${this.repositoryOwner}/${this.repositoryName}` }, 'Getting repository stats');

      // Use GitHub Search API for accurate counts
      const [openResult, closedResult, mergedResult, draftResult] = await Promise.all([
        this.octokit.search.issuesAndPullRequests({
          q: `repo:${this.repositoryOwner}/${this.repositoryName} is:pr is:open`,
        }),
        this.octokit.search.issuesAndPullRequests({
          q: `repo:${this.repositoryOwner}/${this.repositoryName} is:pr is:closed`,
        }),
        this.octokit.search.issuesAndPullRequests({
          q: `repo:${this.repositoryOwner}/${this.repositoryName} is:pr is:merged`,
        }),
        this.octokit.search.issuesAndPullRequests({
          q: `repo:${this.repositoryOwner}/${this.repositoryName} is:pr is:draft`,
        }),
      ]);

      const open = openResult.data.total_count || 0;
      const merged = mergedResult.data.total_count || 0;
      const totalClosed = closedResult.data.total_count || 0;
      const draft = draftResult.data.total_count || 0;
      const closed = Math.max(0, totalClosed - merged); // Closed but not merged

      this.logger.info({ open, totalClosed, merged, closed, draft }, 'Repository stats computed');

      return { open, closed, merged, draft };
    } catch (error) {
      this.logger.error({ error }, 'Error fetching repository stats');
      return { open: 0, closed: 0, merged: 0, draft: 0 };
    }
  }

  /**
   * List all pull requests using REST API with pagination (more reliable than GraphQL)
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
      }, 'Fetching PRs using GitHub REST API with pagination');
      
      const restPulls = await this.octokit.paginate(this.octokit.pulls.list, {
        owner: this.repositoryOwner,
        repo: this.repositoryName,
        state: state === 'all' ? 'all' : (state as 'open' | 'closed'),
        sort: sortBy,
        direction: sortDirection,
        per_page: 100,
      });

      const limitedPulls = restPulls.slice(0, limit);
      
      const mappedPRs: GitHubPullRequest[] = limitedPulls.map((pr: any) => ({
        number: pr.number,
        title: pr.title,
        state: pr.state as 'open' | 'closed',
        draft: pr.draft || false,
        user: {
          login: pr.user?.login || 'unknown',
        },
        created_at: pr.created_at,
        updated_at: pr.updated_at,
        merged_at: pr.merged_at,
        html_url: pr.html_url,
        head: {
          ref: pr.head.ref || '',
          sha: pr.head.sha || '',
        },
        base: {
          ref: pr.base.ref || '',
          sha: pr.base.sha || '',
        },
      }));
      
      this.logger.info({ count: mappedPRs.length, method: 'REST API pagination' }, 'Successfully fetched PRs via REST API');
      return mappedPRs;
    } catch (error: any) {
      this.logger.error({ error }, 'Error fetching pull requests with GitHub REST API');
      return [];
    }
  }
}