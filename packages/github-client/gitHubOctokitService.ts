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

const OctokitWithPlugins = Octokit.plugin(paginateRest, throttling);


/**
 * Creates configured Octokit client with rate limiting and pagination support
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

        if (retryCount < 2) {
          logger?.info({ retryAfter }, 'Rate limit exceeded, retrying request');
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

        if (retryCount < 1) {
          logger?.info({ retryAfter }, 'Secondary rate limit hit, retrying request');
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
  private workflowName: string | null = null;
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
    }) || ({
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      child: () => this.logger,
    } as unknown as Logger);

    if (!githubToken) {
      throw new Error('GitHub token is required for GitHubOctokitService');
    }

    this.octokit = createOctokitClient(githubToken, this.logger);
  }

  /**
   * Fetches the actual workflow name from GitHub API
   */
  private async getWorkflowName(): Promise<string> {
    if (this.workflowName !== null) {
      return this.workflowName;
    }

    try {
      const { data: workflow } = await this.octokit.actions.getWorkflow({
        owner: this.repositoryOwner,
        repo: this.repositoryName,
        workflow_id: this.workflowFileName,
      });
      this.workflowName = workflow.name;
      return workflow.name;
    } catch (error) {
      this.logger.warn({ workflow: this.workflowFileName, error }, 'Could not fetch workflow name, using fallback');
      this.workflowName = 'Test Tasks with Multiple Agents'; // Fallback
      return this.workflowName;
    }
  }

  /**
   * Retrieves workflow hierarchy including runs, logs, and artifacts
   */
  async getHierarchy(limit: number = 30): Promise<GitHubWorkflowHierarchy> {
    try {
      this.logger.debug({ limit, workflow: this.workflowFileName }, 'Retrieving workflow hierarchy');
      
      const { data: runsResponse } = await this.octokit.actions.listWorkflowRuns({
        owner: this.repositoryOwner,
        repo: this.repositoryName,
        workflow_id: this.workflowFileName,
        per_page: Math.min(limit, 100),
      });

      const workflowRuns = await Promise.all(
        runsResponse.workflow_runs.slice(0, limit).map(async (run) => {
          try {
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
                workflow_name: 'Test Tasks with Multiple Agents',
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
                workflow_name: await this.getWorkflowName(),
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
   * Downloads and processes workflow run logs into unified format
   */
  async getWorkflowRunLogs(runId: number): Promise<GitHubWorkflowLog[]> {
    try {
      this.logger.debug({ runId }, 'Downloading workflow logs');

      const response = await this.octokit.actions.downloadWorkflowRunLogs({
        owner: this.repositoryOwner,
        repo: this.repositoryName,
        run_id: runId,
      });

      const zipResponse = await fetch(response.url);
      const zipBuffer = Buffer.from(await zipResponse.arrayBuffer());
      
      const zip = new AdmZip(zipBuffer);
      const entries = zip.getEntries();
      
      let allLogContent = '';
      entries.forEach(entry => {
        if (!entry.isDirectory && entry.entryName.endsWith('.txt')) {
          const content = zip.readAsText(entry);
          allLogContent += `\n=== ${entry.entryName} ===\n${content}\n`;
        }
      });

      if (allLogContent) {
        this.logger.debug({ runId, contentLength: allLogContent.length }, 'Successfully processed workflow logs');
      }

      return [{
        job_name: 'Workflow Run',
        job_id: runId,
        content: allLogContent,
        steps: [],
      }];
    } catch (error) {
      this.logger.error({ runId, error }, 'Error fetching workflow run logs');
      return [];
    }
  }

  /**
   * Retrieves all artifacts for a workflow run with pagination
   */
  async getWorkflowRunArtifacts(runId: number): Promise<GitHubWorkflowArtifact[]> {
    try {
      this.logger.debug({ runId }, 'Fetching workflow artifacts');
      
      const artifacts = await this.octokit.paginate(this.octokit.actions.listWorkflowRunArtifacts, {
        owner: this.repositoryOwner,
        repo: this.repositoryName,
        run_id: runId,
        per_page: 100,
      });

      const mappedArtifacts = artifacts.map(artifact => ({
        id: artifact.id,
        name: artifact.name,
        size_in_bytes: artifact.size_in_bytes,
        download_url: artifact.archive_download_url,
        created_at: artifact.created_at,
        updated_at: artifact.updated_at,
        expired: artifact.expired,
        workflow_run_id: runId,
      }));

      this.logger.debug({ runId, artifactCount: mappedArtifacts.length }, 'Retrieved workflow artifacts');
      return mappedArtifacts;
    } catch (error) {
      this.logger.error({ runId, error }, 'Error fetching workflow run artifacts');
      return [];
    }
  }

  /**
   * Downloads specific artifact by name and returns confirmation message
   */
  async downloadArtifact(artifactName: string, runId?: number): Promise<string | null> {
    try {
      if (!runId) {
        this.logger.warn({ artifactName }, 'Download requested without run ID');
        return null;
      }

      this.logger.debug({ artifactName, runId }, 'Looking up artifact for download');
      
      const artifacts = await this.getWorkflowRunArtifacts(runId);
      const artifact = artifacts.find(a => a.name === artifactName);
      
      if (!artifact) {
        this.logger.warn({ artifactName, runId, availableArtifacts: artifacts.map(a => a.name) }, 'Artifact not found');
        return null;
      }

      await this.octokit.actions.downloadArtifact({
        owner: this.repositoryOwner,
        repo: this.repositoryName,
        artifact_id: artifact.id,
        archive_format: 'zip',
      });
      
      this.logger.info({ artifactName, runId, artifactId: artifact.id }, 'Artifact download initiated');
      return `Downloaded artifact: ${artifactName}`;
    } catch (error) {
      this.logger.error({ artifactName, runId, error }, 'Error downloading artifact');
      return null;
    }
  }

  /**
   * Lists all cast files within an artifact
   */
  async getCastFilesList(artifactId: number): Promise<Array<{ name: string; path: string; size: number }>> {
    try {
      this.logger.debug({ artifactId }, 'Listing cast files in artifact');
      
      const response = await this.octokit.actions.downloadArtifact({
        owner: this.repositoryOwner,
        repo: this.repositoryName,
        artifact_id: artifactId,
        archive_format: 'zip',
      });

      const zipResponse = await fetch(response.url);
      const zipBuffer = Buffer.from(await zipResponse.arrayBuffer());
      
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
      
      this.logger.debug({ artifactId, castFileCount: castFiles.length }, 'Found cast files in artifact');
      return castFiles;
    } catch (error: any) {
      if (error.status === 410 || error.message?.includes('Artifact has expired')) {
        this.logger.warn({ artifactId }, 'Artifact expired, cast files unavailable');
        return [];
      }
      this.logger.error({ artifactId, error }, 'Failed to list cast files from artifact');
      return [];
    }
  }

  /**
   * Retrieves cast file content by path with security validation
   */
  async getCastFileByPath(artifactId: number, filePath: string): Promise<string | null> {
    try {
      this.logger.debug({ artifactId, filePath }, 'Retrieving cast file content');
      
      let decodedPath = filePath;
      try {
        let previousPath = '';
        while (previousPath !== decodedPath) {
          previousPath = decodedPath;
          decodedPath = decodeURIComponent(decodedPath);
        }
      } catch (decodeError) {
        this.logger.warn({ filePath, error: decodeError }, 'Path decode failed, using original');
        decodedPath = filePath;
      }

      const normalizedPath = decodedPath.replace(/\\/g, '/').replace(/\/+/g, '/');
      if (normalizedPath.includes('../') || normalizedPath.includes('..\\') || normalizedPath.startsWith('/')) {
        this.logger.error({ filePath, normalizedPath }, 'Invalid file path (directory traversal detected)');
        return null;
      }

      const response = await this.octokit.actions.downloadArtifact({
        owner: this.repositoryOwner,
        repo: this.repositoryName,
        artifact_id: artifactId,
        archive_format: 'zip',
      });

      const zipResponse = await fetch(response.url);
      const zipBuffer = Buffer.from(await zipResponse.arrayBuffer());
      
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
      if (error.status === 410 || error.message?.includes('Artifact has expired')) {
        this.logger.warn({ artifactId, filePath }, 'Artifact expired, cast file unavailable');
        return null;
      }
      this.logger.error({ artifactId, filePath, error }, 'Failed to read cast file from artifact');
      return null;
    }
  }

  /**
   * Fetches detailed information for a specific workflow run
   */
  async getWorkflowRun(runId: number): Promise<GitHubWorkflowRun | null> {
    try {
      this.logger.debug({ runId }, 'Fetching workflow run details');
      
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
        workflow_name: await this.getWorkflowName(),
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
   * Get review comments for a pull request (includes both review summaries and diff comments)
   */
  async getReviewComments(prNumber: number): Promise<GitHubReviewComment[]> {
    try {
      // Get both review summaries and individual diff comments
      const [reviews, reviewComments] = await Promise.all([
        this.octokit.paginate(this.octokit.pulls.listReviews, {
          owner: this.repositoryOwner,
          repo: this.repositoryName,
          pull_number: prNumber,
          per_page: 100,
        }),
        this.octokit.paginate(this.octokit.pulls.listReviewComments, {
          owner: this.repositoryOwner,
          repo: this.repositoryName,
          pull_number: prNumber,
          per_page: 100,
        })
      ]);
      
      const comments: GitHubReviewComment[] = [];
      
      // Add review summary comments
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
      
      // Add individual diff review comments
      for (const comment of reviewComments) {
        comments.push({
          id: comment.id,
          pull_request_number: prNumber,
          user: {
            login: comment.user?.login || 'unknown',
            avatar_url: comment.user?.avatar_url,
          },
          body: comment.body || '',
          created_at: comment.created_at,
          updated_at: comment.updated_at,
          html_url: comment.html_url,
          in_reply_to_id: comment.in_reply_to_id,
        });
      }
      
      // Sort by creation date for chronological order
      comments.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      
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
   * Retrieves workflow runs for a PR, including all run attempts
   * Filters specifically for test-tasks.yaml workflow runs
   */
  async getWorkflowRunsForPR(prNumber: number, limit: number = 50): Promise<GitHubWorkflowRun[]> {
    try {
      this.logger.debug({ prNumber, limit }, 'Starting workflow runs retrieval for PR');
      
      const commits = await this.getPRCommits(prNumber);
      
      if (commits.length === 0) {
        this.logger.warn({ prNumber }, 'PR has no commits, cannot find workflow runs');
        return [];
      }

      this.logger.info({
        prNumber,
        commitCount: commits.length,
        commitRange: `${commits[commits.length - 1]?.sha?.substring(0, 7)}...${commits[0]?.sha?.substring(0, 7)}`,
        workflow: this.workflowFileName
      }, 'Processing commits to find workflow runs');

      const allRuns: GitHubWorkflowRun[] = [];
      
      for (const commit of commits) {
        try {
          const { data: runsResponse } = await this.octokit.actions.listWorkflowRuns({
            owner: this.repositoryOwner,
            repo: this.repositoryName,
            workflow_id: this.workflowFileName,
            head_sha: commit.sha,
            per_page: 100,
          });
          
          if (runsResponse.workflow_runs.length > 0) {
            this.logger.debug({
              commitSha: commit.sha.substring(0, 7),
              runsFound: runsResponse.workflow_runs.length,
              runNumbers: runsResponse.workflow_runs.map(r => `#${r.run_number}.${r.run_attempt || 1}`)
            }, 'Discovered workflow runs for commit');
          }

          for (const run of runsResponse.workflow_runs) {
            try {
              const currentRun: GitHubWorkflowRun = {
                id: run.id,
                name: run.display_title || run.name || null,
                status: run.status as 'queued' | 'in_progress' | 'completed',
                conclusion: run.conclusion as 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | null,
                created_at: run.created_at,
                updated_at: run.updated_at,
                html_url: run.html_url,
                workflow_id: run.workflow_id,
                workflow_name: await this.getWorkflowName(),
                head_sha: run.head_sha,
                head_branch: run.head_branch,
                run_number: run.run_number,
                run_attempt: run.run_attempt || 1,
              };

              const maxAttempt = run.run_attempt || 1;
              if (maxAttempt > 1) {
                this.logger.debug({
                  runId: run.id,
                  runNumber: run.run_number,
                  maxAttempt
                }, 'Processing multi-attempt workflow run');

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
                      workflow_name: await this.getWorkflowName(),
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
                  this.logger.debug({
                    runId: run.id,
                    runNumber: run.run_number,
                    attemptCount: allAttempts.length,
                    attempts: allAttempts.map(a => `${a.run_attempt}:${a.status}`)
                  }, 'Collected all attempts for workflow run');
                }
                
                allRuns.push(...allAttempts);
              } else {
                allRuns.push(currentRun);
              }
            } catch (attemptError: any) {
              this.logger.warn({ runId: run.id, error: attemptError.message }, 'Attempt processing failed, using basic run');
              
              allRuns.push({
                id: run.id,
                name: run.display_title || run.name || null,
                status: run.status as 'queued' | 'in_progress' | 'completed' | 'requested' | 'waiting' | 'pending',
                conclusion: run.conclusion as 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | null,
                created_at: run.created_at,
                updated_at: run.updated_at,
                html_url: run.html_url,
                workflow_id: run.workflow_id,
                workflow_name: await this.getWorkflowName(),
                head_sha: run.head_sha,
                head_branch: run.head_branch,
                run_number: run.run_number,
                run_attempt: run.run_attempt || 1,
              });
            }
          }
        } catch (error) {
          this.logger.error({ commitSha: commit.sha, prNumber, error }, 'Failed to fetch runs for commit');
        }
      }
      
      allRuns.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      
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
   * Filters PR comments for bot-generated content including agent analysis
   */
  async getWorkflowBotComments(prNumber: number): Promise<GitHubReviewComment[]> {
    try {
      this.logger.debug({ prNumber }, 'Filtering PR comments for bot content');
      
      const comments = await this.octokit.paginate(this.octokit.issues.listComments, {
        owner: this.repositoryOwner,
        repo: this.repositoryName,
        issue_number: prNumber, // PR comments use issue_number
        per_page: 100,
      });
      
      const botComments: GitHubReviewComment[] = [];
      
      for (const comment of comments) {
        const authorLogin = comment.user?.login?.toLowerCase() || '';
        
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
      
      this.logger.debug({ prNumber, botComments: botComments.length, totalComments: comments.length }, 'Bot comment filtering completed');
      return botComments;
    } catch (error) {
      this.logger.error({ prNumber, error }, 'Error fetching workflow bot comments for PR');
      return [];
    }
  }

  /**
   * Retrieves detailed information for a specific pull request
   */
  async getPullRequest(prNumber: number): Promise<GitHubPullRequest | null> {
    try {
      this.logger.debug({ prNumber }, 'Fetching pull request details');
      
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
   * Lists all files modified in a pull request with GitHub API pagination
   */
  async getPRFiles(prNumber: number): Promise<any[]> {
    try {
      this.logger.debug({ prNumber }, 'Retrieving modified files for PR');

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

      this.logger.debug({ prNumber, fileCount: mappedFiles.length }, 'PR files retrieved');

      if (mappedFiles.length > 2500) {
        this.logger.warn({
          prNumber,
          fileCount: mappedFiles.length
        }, 'Large PR detected - approaching GitHub API file limits');
      }

      return mappedFiles;
    } catch (error) {
      this.logger.error({ prNumber, error }, 'Error fetching PR files');
      return [];
    }
  }

  /**
   * Retrieves file content from PR head commit with base64 decoding
   */
  async getPRFileContent(prNumber: number, filePath: string): Promise<string | null> {
    try {
      const pr = await this.getPullRequest(prNumber);
      if (!pr) {
        this.logger.warn({ prNumber, filePath }, 'Cannot get file content - PR not found');
        return null;
      }

      this.logger.debug({ prNumber, filePath, headSha: pr.head.sha.substring(0, 7) }, 'Fetching file content from PR head');
      
      const { data: content } = await this.octokit.repos.getContent({
        owner: this.repositoryOwner,
        repo: this.repositoryName,
        path: filePath,
        ref: pr.head.sha,
      });
      
      if ('content' in content && typeof content.content === 'string') {
        const decoded = Buffer.from(content.content, 'base64').toString('utf-8');
        this.logger.debug({ prNumber, filePath, contentLength: decoded.length }, 'File content decoded successfully');
        return decoded;
      }
      
      this.logger.warn({ prNumber, filePath }, 'File content not available or invalid format');
      return null;
    } catch (error) {
      this.logger.error({ prNumber, filePath, error }, 'Error fetching file content');
      return null;
    }
  }

  /**
   * Discovers and parses task definitions from PR file changes
   */
  async listPRTasks(prNumber: number): Promise<Array<{ taskId: string; pathPrefix: string; taskYaml: any }>> {
    try {
      this.logger.debug({ prNumber }, 'Discovering task definitions in PR');
      
      const files = await this.getPRFiles(prNumber);

      const taskSubdirs = new Set<string>();
      files.forEach(f => {
        if (f.path.startsWith('tasks/')) {
          const parts = f.path.split('/');
          if (parts.length > 1) {
            taskSubdirs.add(parts[1]);
          }
        }
      });

      if (taskSubdirs.size === 0) {
        this.logger.debug({ prNumber }, 'No task directories found in PR');
        return [];
      }

      this.logger.debug({ prNumber, taskCount: taskSubdirs.size, tasks: Array.from(taskSubdirs) }, 'Discovered task directories');

      const tasks = await Promise.all(
        Array.from(taskSubdirs).map(async (taskId) => {
          try {
            const pathPrefix = `tasks/${taskId}`;
            const taskYamlPath = `${pathPrefix}/task.yaml`;
            const taskYmlPath = `${pathPrefix}/task.yml`;
            let taskYaml = null;

            try {
              let content = await this.getPRFileContent(prNumber, taskYamlPath);
              if (!content) {
                content = await this.getPRFileContent(prNumber, taskYmlPath);
              }
              if (content) {
                taskYaml = yaml.load(content);
                this.logger.debug({ taskId }, 'Task definition parsed successfully');
              }
            } catch (error) {
              this.logger.debug({ taskId, prNumber }, 'Task definition not found or invalid');
            }

            return { taskId, pathPrefix, taskYaml };
          } catch (error) {
            this.logger.error({ taskId, prNumber, error }, 'Task processing failed');
            return { taskId, pathPrefix: `tasks/${taskId}`, taskYaml: null };
          }
        })
      );

      this.logger.debug({
        prNumber,
        taskCount: tasks.length,
        tasksWithDefinitions: tasks.filter(t => t.taskYaml).length
      }, 'Task discovery completed');

      return tasks;
    } catch (error) {
      this.logger.error({ prNumber, error }, 'Error listing tasks for PR');
      return [];
    }
  }

  /**
   * Retrieves commit metadata including author information
   */
  async getCommitDetails(commitSha: string): Promise<{ message: string; author: string; email: string } | null> {
    try {
      this.logger.debug({ commitSha: commitSha.substring(0, 7) }, 'Fetching commit details');
      
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
   * Retrieves all commits for a pull request with pagination
   */
  async getPRCommits(prNumber: number): Promise<Array<{ sha: string; message: string; author: string; date: string }>> {
    try {
      this.logger.debug({ prNumber }, 'Fetching PR commits');
      
      const commits = await this.octokit.paginate(this.octokit.pulls.listCommits, {
        owner: this.repositoryOwner,
        repo: this.repositoryName,
        pull_number: prNumber,
        per_page: 100,
      });
      
      const mappedCommits = commits.map(commit => ({
        sha: commit.sha,
        message: commit.commit.message,
        author: commit.commit.author?.name || 'Unknown',
        date: commit.commit.author?.date || new Date().toISOString(),
      }));

      this.logger.debug({ prNumber, commitCount: mappedCommits.length }, 'PR commits retrieved');
      return mappedCommits;
    } catch (error) {
      this.logger.error({ prNumber, error }, 'Error fetching commits for PR');
      return [];
    }
  }

  /**
   * Retrieves individual job results for a workflow run
   */
  async getWorkflowJobs(runId: number): Promise<Array<{ name: string; conclusion: string | null; status: string }>> {
    try {
      this.logger.debug({ runId }, 'Fetching workflow job results');
      
      const jobs = await this.octokit.paginate(this.octokit.actions.listJobsForWorkflowRun, {
        owner: this.repositoryOwner,
        repo: this.repositoryName,
        run_id: runId,
        per_page: 100,
      });
      
      const mappedJobs = jobs.map(job => ({
        name: job.name,
        conclusion: job.conclusion,
        status: job.status,
      }));

      this.logger.debug({ runId, jobCount: mappedJobs.length }, 'Workflow jobs retrieved');
      return mappedJobs;
    } catch (error) {
      this.logger.error({ runId, error }, 'Error fetching jobs for run');
      return [];
    }
  }

  /**
   * Extracts log file listings from artifact archive
   */
  async getArtifactLogFiles(artifactId: number): Promise<Array<{ name: string; path: string }>> {
    try {
      this.logger.debug({ artifactId }, 'Extracting log files from artifact');
      
      const response = await this.octokit.actions.downloadArtifact({
        owner: this.repositoryOwner,
        repo: this.repositoryName,
        artifact_id: artifactId,
        archive_format: 'zip',
      });

      const zipResponse = await fetch(response.url);
      const zipBuffer = Buffer.from(await zipResponse.arrayBuffer());
      
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
      
      this.logger.debug({ artifactId, logFileCount: logFiles.length }, 'Log files extracted from artifact');
      return logFiles;
    } catch (error: any) {
      if (error.status === 410 || error.message?.includes('Artifact has expired')) {
        this.logger.warn({ artifactId }, 'Artifact expired, log files unavailable');
        return [];
      }
      this.logger.error({ artifactId, error }, 'Failed to extract log files from artifact');
      return [];
    }
  }

  /**
   * Retrieves specific log file content with path security validation
   */
  async getArtifactLogContent(artifactId: number, filePath: string): Promise<string | null> {
    try {
      this.logger.debug({ artifactId, filePath }, 'Retrieving log file content');
      
      let decodedPath = filePath;
      try {
        let previousPath = '';
        while (previousPath !== decodedPath) {
          previousPath = decodedPath;
          decodedPath = decodeURIComponent(decodedPath);
        }
      } catch (decodeError) {
        this.logger.warn({ filePath, error: decodeError }, 'Path decode failed, using original');
        decodedPath = filePath;
      }

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

      const zipResponse = await fetch(response.url);
      const zipBuffer = Buffer.from(await zipResponse.arrayBuffer());
      
      const zip = new AdmZip(zipBuffer);
      const entry = zip.getEntry(normalizedPath);
      
      if (!entry) {
        this.logger.error({ artifactId, normalizedPath, originalPath: filePath }, 'File not found in artifact');
        return null;
      }
      
      return zip.readAsText(entry);
    } catch (error: any) {
      if (error.status === 410 || error.message?.includes('Artifact has expired')) {
        this.logger.warn({ artifactId, filePath }, 'Artifact expired, log file unavailable');
        return null;
      }
      this.logger.error({ artifactId, filePath, error }, 'Failed to read log file from artifact');
      return null;
    }
  }

  /**
   * Calculates repository PR statistics using GitHub Search API
   */
  async getRepositoryStats(): Promise<{ open: number; closed: number; merged: number; draft: number }> {
    try {
      this.logger.debug({ repo: `${this.repositoryOwner}/${this.repositoryName}` }, 'Computing repository statistics');

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
      const closed = Math.max(0, totalClosed - merged);

      const stats = { open, closed, merged, draft };
      this.logger.info({ ...stats, totalClosed }, 'Repository statistics calculated');

      return stats;
    } catch (error) {
      this.logger.error({ error }, 'Error fetching repository stats');
      return { open: 0, closed: 0, merged: 0, draft: 0 };
    }
  }

  /**
   * Lists pull requests with efficient REST API pagination
   */
  async listPullRequests(
    state: 'open' | 'closed' | 'all' = 'all',
    limit: number = 1000,
    sortBy: 'created' | 'updated' = 'created',
    sortDirection: 'asc' | 'desc' = 'desc'
  ): Promise<GitHubPullRequest[]> {
    try {
      this.logger.debug({
        repo: `${this.repositoryOwner}/${this.repositoryName}`,
        limit,
        state,
        sortBy,
        sortDirection
      }, 'Retrieving pull requests via REST API');
      
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