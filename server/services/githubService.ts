import { Octokit } from '@octokit/rest';
import { 
  GitHubWorkflowRun, 
  GitHubWorkflowLog, 
  GitHubWorkflowArtifact, 
  GitHubWorkflowHierarchy 
} from '@shared/schema';

export class GitHubService {
  private repositoryOwner = 'abundant-ai';
  private repositoryName = 'tbench-hammer';
  private workflowFileName = 'test-tasks.yaml';

  private async getAccessToken(): Promise<string> {
    let connectionSettings: any;

    const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
    const xReplitToken = process.env.REPL_IDENTITY 
      ? 'repl ' + process.env.REPL_IDENTITY 
      : process.env.WEB_REPL_RENEWAL 
      ? 'depl ' + process.env.WEB_REPL_RENEWAL 
      : null;

    if (!xReplitToken) {
      throw new Error('X_REPLIT_TOKEN not found for repl/depl');
    }

    connectionSettings = await fetch(
      'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=github',
      {
        headers: {
          'Accept': 'application/json',
          'X_REPLIT_TOKEN': xReplitToken
        }
      }
    ).then(res => res.json()).then(data => data.items?.[0]);

    const accessToken = connectionSettings?.settings?.access_token ?? connectionSettings?.settings?.oauth?.credentials?.access_token;

    if (!connectionSettings || !accessToken) {
      throw new Error('GitHub not connected');
    }
    return accessToken;
  }

  // WARNING: Never cache this client.
  // Access tokens expire, so a new client must be created each time.
  // Always call this function again to get a fresh client.
  private async getUncachableGitHubClient(): Promise<Octokit> {
    const accessToken = await this.getAccessToken();
    return new Octokit({ auth: accessToken });
  }

  async getHierarchy(limit: number = 30): Promise<GitHubWorkflowHierarchy> {
    try {
      const octokit = await this.getUncachableGitHubClient();
      
      // First, get the workflow ID for test-tasks.yaml
      const workflowsResponse = await octokit.rest.actions.listRepoWorkflows({
        owner: this.repositoryOwner,
        repo: this.repositoryName,
      });

      const targetWorkflow = workflowsResponse.data.workflows.find(
        workflow => workflow.path.includes(this.workflowFileName)
      );

      if (!targetWorkflow) {
        throw new Error(`Workflow ${this.workflowFileName} not found in repository`);
      }

      // Get workflow runs for the specific workflow
      const workflowRunsResponse = await octokit.rest.actions.listWorkflowRuns({
        owner: this.repositoryOwner,
        repo: this.repositoryName,
        workflow_id: targetWorkflow.id,
        per_page: limit,
      });

      const workflowRuns = await Promise.all(
        workflowRunsResponse.data.workflow_runs.map(async (run) => {
          try {
            // Try to fetch logs and artifacts for each run
            const [logs, artifacts] = await Promise.allSettled([
              this.getWorkflowRunLogs(run.id),
              this.getWorkflowRunArtifacts(run.id),
            ]);

            return {
              run: {
                id: run.id,
                name: run.name || null,
                status: run.status as 'queued' | 'in_progress' | 'completed',
                conclusion: run.conclusion as 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | null,
                created_at: run.created_at,
                updated_at: run.updated_at,
                html_url: run.html_url,
                workflow_id: run.workflow_id,
                workflow_name: targetWorkflow.name,
                head_sha: run.head_sha,
                head_branch: run.head_branch,
                run_number: run.run_number,
                run_attempt: run.run_attempt ?? 1,
              } as GitHubWorkflowRun,
              logs: logs.status === 'fulfilled' ? logs.value : undefined,
              artifacts: artifacts.status === 'fulfilled' ? artifacts.value : undefined,
              hasData: logs.status === 'fulfilled' || artifacts.status === 'fulfilled',
            };
          } catch (error) {
            console.error(`Error fetching data for workflow run ${run.id}:`, error);
            return {
              run: {
                id: run.id,
                name: run.name || null,
                status: run.status as 'queued' | 'in_progress' | 'completed',
                conclusion: run.conclusion as 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | null,
                created_at: run.created_at,
                updated_at: run.updated_at,
                html_url: run.html_url,
                workflow_id: run.workflow_id,
                workflow_name: targetWorkflow.name,
                head_sha: run.head_sha,
                head_branch: run.head_branch,
                run_number: run.run_number,
                run_attempt: run.run_attempt ?? 1,
              } as GitHubWorkflowRun,
              hasData: false,
            };
          }
        })
      );

      return {
        workflow_runs: workflowRuns,
        total_count: workflowRunsResponse.data.total_count,
        repository: {
          owner: this.repositoryOwner,
          name: this.repositoryName,
          workflow_name: targetWorkflow.name,
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

  async getWorkflowRunLogs(runId: number): Promise<GitHubWorkflowLog[]> {
    try {
      const octokit = await this.getUncachableGitHubClient();
      
      // Get jobs for the workflow run
      const jobsResponse = await octokit.rest.actions.listJobsForWorkflowRun({
        owner: this.repositoryOwner,
        repo: this.repositoryName,
        run_id: runId,
      });

      const logs: GitHubWorkflowLog[] = [];

      for (const job of jobsResponse.data.jobs) {
        try {
          // Get logs for each job
          const logResponse = await octokit.rest.actions.downloadJobLogsForWorkflowRun({
            owner: this.repositoryOwner,
            repo: this.repositoryName,
            job_id: job.id,
          });

          // Extract step information from job
          const steps = job.steps?.map((step, index) => ({
            name: step.name,
            number: step.number || index + 1,
            conclusion: step.conclusion as 'success' | 'failure' | 'cancelled' | 'skipped' | null,
            content: '', // Individual step logs would require additional API calls
          }));

          logs.push({
            job_name: job.name,
            job_id: job.id,
            content: typeof logResponse.data === 'string' ? logResponse.data : '',
            steps,
          });
        } catch (error) {
          console.error(`Error fetching logs for job ${job.id}:`, error);
          // Continue with other jobs even if one fails
        }
      }

      return logs;
    } catch (error) {
      console.error(`Error fetching workflow run logs for run ${runId}:`, error);
      return [];
    }
  }

  async getWorkflowRunArtifacts(runId: number): Promise<GitHubWorkflowArtifact[]> {
    try {
      const octokit = await this.getUncachableGitHubClient();
      
      const artifactsResponse = await octokit.rest.actions.listWorkflowRunArtifacts({
        owner: this.repositoryOwner,
        repo: this.repositoryName,
        run_id: runId,
      });

      return artifactsResponse.data.artifacts.map(artifact => ({
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
      console.error(`Error fetching workflow run artifacts for run ${runId}:`, error);
      return [];
    }
  }

  async downloadArtifact(artifactId: number): Promise<ArrayBuffer | null> {
    try {
      const octokit = await this.getUncachableGitHubClient();
      
      const response = await octokit.rest.actions.downloadArtifact({
        owner: this.repositoryOwner,
        repo: this.repositoryName,
        artifact_id: artifactId,
        archive_format: 'zip',
      });

      return response.data as ArrayBuffer;
    } catch (error) {
      console.error(`Error downloading artifact ${artifactId}:`, error);
      return null;
    }
  }

  async getCastArtifacts(runId: number): Promise<GitHubWorkflowArtifact[]> {
    try {
      const artifacts = await this.getWorkflowRunArtifacts(runId);
      
      // Filter for .cast files or artifacts that might contain asciinema recordings
      return artifacts.filter(artifact => 
        artifact.name.toLowerCase().includes('cast') ||
        artifact.name.toLowerCase().includes('asciinema') ||
        artifact.name.toLowerCase().includes('recording')
      );
    } catch (error) {
      console.error(`Error fetching cast artifacts for run ${runId}:`, error);
      return [];
    }
  }

  async getWorkflowRun(runId: number): Promise<GitHubWorkflowRun | null> {
    try {
      const octokit = await this.getUncachableGitHubClient();
      
      const response = await octokit.rest.actions.getWorkflowRun({
        owner: this.repositoryOwner,
        repo: this.repositoryName,
        run_id: runId,
      });

      const run = response.data;
      
      return {
        id: run.id,
        name: run.name || null,
        status: run.status as 'queued' | 'in_progress' | 'completed',
        conclusion: run.conclusion as 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | null,
        created_at: run.created_at,
        updated_at: run.updated_at,
        html_url: run.html_url,
        workflow_id: run.workflow_id,
        head_sha: run.head_sha,
        head_branch: run.head_branch,
        run_number: run.run_number,
        run_attempt: run.run_attempt || 1,
      };
    } catch (error) {
      console.error(`Error fetching workflow run ${runId}:`, error);
      return null;
    }
  }
}