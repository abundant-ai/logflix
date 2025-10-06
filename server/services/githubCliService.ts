import { exec } from 'child_process';
import { promisify } from 'util';
import * as yaml from 'js-yaml';
import AdmZip from 'adm-zip';
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
      const downloadCommand = `api repos/${this.repositoryOwner}/${this.repositoryName}/actions/artifacts/${artifactId}/zip`;
      const { stdout } = await execAsync(`gh ${downloadCommand}`, {
        encoding: 'buffer',
        maxBuffer: 50 * 1024 * 1024 // 50MB buffer
      });
      
      // Extract zip and find .cast file
      const zip = new AdmZip(stdout);
      const zipEntries = zip.getEntries();
      
      // Find first .cast file
      const castEntry = zipEntries.find((entry: any) =>
        !entry.isDirectory && entry.entryName.endsWith('.cast')
      );
      
      if (!castEntry) {
        console.error(`No .cast file found in artifact ${artifactId}`);
        return null;
      }
      
      // Read as text and validate size (max 10MB for cast files)
      const content = zip.readAsText(castEntry);
      if (content.length > 10 * 1024 * 1024) {
        console.error(`Cast file ${castEntry.entryName} exceeds 10MB size limit`);
        return null;
      }
      
      return content;
    } catch (error) {
      console.error(`Error downloading cast file for artifact ${artifactId}:`, error);
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
        console.warn(`Artifact ${artifactId} has expired`);
        return [];
      }
      console.error(`Error listing cast files from artifact ${artifactId}:`, error);
      return [];
    }
  }

  /**
   * Get specific cast file content from artifact by path
   */
  async getCastFileByPath(artifactId: number, filePath: string): Promise<string | null> {
    try {
      // Download artifact zip
      const downloadCommand = `api repos/${this.repositoryOwner}/${this.repositoryName}/actions/artifacts/${artifactId}/zip`;
      const { stdout } = await execAsync(`gh ${downloadCommand}`, {
        encoding: 'buffer',
        maxBuffer: 50 * 1024 * 1024
      });
      
      // Extract specific file
      const zip = new AdmZip(stdout);
      const entry = zip.getEntry(filePath);
      
      if (!entry) {
        console.error(`Cast file ${filePath} not found in artifact`);
        return null;
      }
      
      // Read as text and validate size
      const content = zip.readAsText(entry);
      if (content.length > 10 * 1024 * 1024) {
        console.error(`Cast file ${filePath} exceeds 10MB size limit`);
        return null;
      }
      
      return content;
    } catch (error: any) {
      // Check if artifact has expired
      if (error.message?.includes('Artifact has expired') || error.stderr?.includes('HTTP 410')) {
        console.warn(`Artifact ${artifactId} has expired, cannot read cast file ${filePath}`);
        return null;
      }
      console.error(`Error reading cast file ${filePath} from artifact ${artifactId}:`, error);
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
   * List all pull requests using direct GitHub REST API with pagination to bypass gh pr list limitations
   */
  async listPullRequests(
    state: 'open' | 'closed' | 'all' = 'all',
    limit: number = 30,
    sortBy: 'created' | 'updated' | 'popularity' | 'long-running' = 'updated',
    sortDirection: 'asc' | 'desc' = 'desc'
  ): Promise<GitHubPullRequest[]> {
    try {
      console.log(`Fetching PRs using GitHub REST API for ${this.repositoryOwner}/${this.repositoryName}`);
      console.log(`Requested: ${limit} PRs, state: ${state}, sort: ${sortBy}`);
      
      const allPRs: any[] = [];
      let page = 1;
      const perPage = 100; // GitHub API max per page
      
      // Keep fetching pages until we get less than perPage PRs (indicates end of data)
      while (true) {
        const stateParam = state === 'all' ? '' : `&state=${state}`;
        const sortParam = sortBy === 'long-running' ? '&sort=created&direction=asc' : `&sort=${sortBy}&direction=${sortDirection}`;
        
        const apiCommand = `api repos/${this.repositoryOwner}/${this.repositoryName}/pulls?per_page=${perPage}&page=${page}${stateParam}${sortParam}`;
        
        console.log(`Fetching page ${page} with command: gh ${apiCommand}`);
        
        const { stdout } = await execAsync(`gh ${apiCommand}`, {
          maxBuffer: 50 * 1024 * 1024 // 50MB buffer for large PR responses
        });
        const pagePRs = JSON.parse(stdout);
        
        console.log(`Page ${page} returned ${pagePRs.length} PRs`);
        
        // Stop if we get no results or less than perPage (end of data)
        if (pagePRs.length === 0) {
          console.log(`No more PRs found at page ${page}, stopping pagination`);
          break;
        }
        
        allPRs.push(...pagePRs);
        
        // If we got fewer than perPage PRs, we've reached the end
        if (pagePRs.length < perPage) {
          console.log(`Got ${pagePRs.length} PRs (less than ${perPage}), reached end of data`);
          break;
        }
        
        // Stop if we have enough PRs for the request
        if (allPRs.length >= limit) {
          console.log(`Collected ${allPRs.length} PRs, reached requested limit of ${limit}`);
          break;
        }
        
        page++;
        
        // Safety limit to prevent infinite loops
        if (page > 20) {
          console.log(`Reached maximum pages (20), stopping`);
          break;
        }
      }
      
      console.log(`GitHub REST API returned total ${allPRs.length} unique PRs (no duplicates fetched)`);
      
      // Map to our schema format (all PRs are already unique from smart pagination)
      const mappedPRs = allPRs.map(pr => ({
        number: pr.number,
        title: pr.title,
        state: pr.state as 'open' | 'closed',
        user: {
          login: pr.user.login,
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

      // Apply client-requested sorting (GitHub API sorting might not be exactly what we want)
      mappedPRs.sort((a, b) => {
        let comparison = 0;
        if (sortBy === 'created') {
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        } else if (sortBy === 'updated') {
          comparison = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
        }
        return sortDirection === 'desc' ? -comparison : comparison;
      });

      // Return up to the requested limit
      const finalPRs = mappedPRs.slice(0, limit);
      console.log(`Returning ${finalPRs.length} PRs to client`);
      return finalPRs;
    } catch (error: any) {
      console.error('Error fetching pull requests with GitHub REST API:', error);
      
      // Check for authentication issues
      if (error.message?.includes('authentication') || error.stderr?.includes('authentication')) {
        console.error('GitHub authentication failed. Please run: gh auth login');
      }
      
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
   * Get workflow runs associated with a pull request (for all commits)
   */
  async getWorkflowRunsForPR(prNumber: number, limit: number = 50): Promise<GitHubWorkflowRun[]> {
    try {
      const repoContext = this.getRepoContext();
      
      // Get all commits for this PR
      const commits = await this.getPRCommits(prNumber);
      
      if (commits.length === 0) {
        return [];
      }

      // Fetch workflow runs for all commits in the PR
      const allRuns: GitHubWorkflowRun[] = [];
      
      for (const commit of commits) {
        try {
          // Filter to only test-tasks.yaml workflow runs
          const runsCommand = `run list ${repoContext} --commit ${commit.sha} --workflow="${this.workflowFileName}" --limit ${Math.ceil(limit / commits.length)} --json databaseId,displayTitle,status,conclusion,createdAt,updatedAt,url,workflowDatabaseId,workflowName,headSha,headBranch,number,attempt`;
          const runs = await this.executeGhCommand<GHRunJSON[]>(runsCommand);
          
          const mappedRuns = runs.map(run => ({
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
          
          allRuns.push(...mappedRuns);
        } catch (error) {
          console.error(`Error fetching runs for commit ${commit.sha}:`, error);
          // Continue with other commits
        }
      }
      
      // Sort by created_at descending and limit to requested number
      allRuns.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return allRuns.slice(0, limit);
    } catch (error) {
      console.error(`Error fetching workflow runs for PR ${prNumber}:`, error);
      return [];
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
      
      console.log(`Found ${botComments.length} bot comments for PR ${prNumber}`);
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
   * Get commit details including message and email
   */
  async getCommitDetails(commitSha: string): Promise<{ message: string; author: string; email: string } | null> {
    try {
      const commitCommand = `api repos/${this.repositoryOwner}/${this.repositoryName}/commits/${commitSha} --jq '{message: .commit.message, author: .commit.author.name, email: .commit.author.email}'`;
      const { stdout } = await execAsync(`gh ${commitCommand}`);
      
      return JSON.parse(stdout.trim());
    } catch (error) {
      console.error(`Error fetching commit details for ${commitSha}:`, error);
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
      console.error(`Error fetching commits for PR ${prNumber}:`, error);
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
      console.error(`Error fetching jobs for run ${runId}:`, error);
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
        console.warn(`Artifact ${artifactId} has expired`);
        return [];
      }
      console.error(`Error extracting log files from artifact ${artifactId}:`, error);
      return [];
    }
  }

  /**
   * Get specific log file content from artifact
   */
  async getArtifactLogContent(artifactId: number, filePath: string): Promise<string | null> {
    try {
      // Download artifact zip
      const downloadCommand = `api repos/${this.repositoryOwner}/${this.repositoryName}/actions/artifacts/${artifactId}/zip`;
      const { stdout } = await execAsync(`gh ${downloadCommand}`, {
        encoding: 'buffer',
        maxBuffer: 50 * 1024 * 1024
      });
      
      // Extract specific file
      const zip = new AdmZip(stdout);
      const entry = zip.getEntry(filePath);
      
      if (!entry) {
        console.error(`File ${filePath} not found in artifact`);
        return null;
      }
      
      return zip.readAsText(entry);
    } catch (error: any) {
      // Check if artifact has expired
      if (error.message?.includes('Artifact has expired') || error.stderr?.includes('HTTP 410')) {
        console.warn(`Artifact ${artifactId} has expired, cannot read log file ${filePath}`);
        return null;
      }
      console.error(`Error reading log file ${filePath} from artifact ${artifactId}:`, error);
      return null;
    }
  }

  /**
   * Get repository statistics (PR counts by state) using GitHub Search API
   */
  async getRepositoryStats(): Promise<{ open: number; closed: number; merged: number }> {
    try {
      console.log(`Getting repository stats for ${this.repositoryOwner}/${this.repositoryName}`);
      
      // Use the working GitHub Search API format
      const openCommand = `api 'search/issues?q=repo:${this.repositoryOwner}/${this.repositoryName}+is:pr+is:open' --jq '.total_count'`;
      const closedCommand = `api 'search/issues?q=repo:${this.repositoryOwner}/${this.repositoryName}+is:pr+is:closed' --jq '.total_count'`;
      const mergedCommand = `api 'search/issues?q=repo:${this.repositoryOwner}/${this.repositoryName}+is:pr+is:merged' --jq '.total_count'`;
      
      console.log(`Executing GitHub Search API commands...`);
      
      const [openResult, closedResult, mergedResult] = await Promise.all([
        execAsync(`gh ${openCommand}`, { maxBuffer: 10 * 1024 * 1024 }),
        execAsync(`gh ${closedCommand}`, { maxBuffer: 10 * 1024 * 1024 }),
        execAsync(`gh ${mergedCommand}`, { maxBuffer: 10 * 1024 * 1024 })
      ]);
      
      const open = parseInt(openResult.stdout.trim()) || 0;
      const merged = parseInt(mergedResult.stdout.trim()) || 0;
      const totalClosed = parseInt(closedResult.stdout.trim()) || 0;
      const closed = Math.max(0, totalClosed - merged); // Closed but not merged
      
      console.log(`Repository stats: open=${open}, totalClosed=${totalClosed}, merged=${merged}, closed=${closed}`);
      
      return { open, closed, merged };
    } catch (error) {
      console.error(`Error fetching repository stats:`, error);
      return { open: 0, closed: 0, merged: 0 };
    }
  }
}
