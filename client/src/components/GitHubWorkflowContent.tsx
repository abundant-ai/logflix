import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import * as AsciinemaPlayer from "asciinema-player";
import "asciinema-player/dist/bundle/asciinema-player.css";
import { 
  ChevronRight,
  Download,
  ExternalLink, 
  Terminal, 
  FileCode, 
  CheckCircle, 
  XCircle, 
  Clock,
  GitPullRequest,
  MessageSquare,
  User,
  BarChart3,
  Bug
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  GitHubWorkflowRun,
  GitHubPullRequest,
  GitHubReviewComment,
  GitHubPRSelection,
  GitHubWorkflowLog,
  GitHubWorkflowArtifact
} from "@shared/schema";

interface GitHubWorkflowContentProps {
  selectedPR: GitHubPRSelection | null;
}

interface WorkflowRunDetails {
  run: GitHubWorkflowRun;
  logs: GitHubWorkflowLog[];
  artifacts: GitHubWorkflowArtifact[];
  hasData: boolean;
}

export default function GitHubWorkflowContent({ selectedPR }: GitHubWorkflowContentProps) {
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedCommitSha, setSelectedCommitSha] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [selectedFile, setSelectedFile] = useState<any | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const playerRef = useRef<HTMLDivElement>(null);

  // Fetch PR details
  const { data: prData, isLoading: isPRLoading } = useQuery<GitHubPullRequest>({
    queryKey: selectedPR ? ["/api/github/pull-request", selectedPR.prNumber] : [],
    enabled: !!selectedPR,
  });

  // Fetch commits for this PR
  const { data: commitsData } = useQuery<{ commits: Array<{ sha: string; message: string; author: string; date: string }> }>({
    queryKey: selectedPR ? ["/api/github/pr-commits", selectedPR.prNumber] : [],
    enabled: !!selectedPR,
  });

  // Auto-select the latest commit
  useEffect(() => {
    if (commitsData && commitsData.commits.length > 0 && !selectedCommitSha) {
      setSelectedCommitSha(commitsData.commits[commitsData.commits.length - 1].sha);
    }
  }, [commitsData, selectedCommitSha]);

  // Fetch workflow runs for this PR
  const { data: runsData, isLoading: isRunsLoading } = useQuery<{ runs: GitHubWorkflowRun[]; total_count: number }>({
    queryKey: selectedPR ? ["/api/github/pr-workflow-runs", selectedPR.prNumber] : [],
    enabled: !!selectedPR,
  });

  // Filter runs by selected commit
  const filteredRuns = runsData?.runs.filter(run => run.head_sha === selectedCommitSha) || [];

  // Auto-select the latest run for the selected commit
  useEffect(() => {
    if (filteredRuns.length > 0 && (!selectedRunId || !filteredRuns.find(r => r.id === selectedRunId))) {
      setSelectedRunId(filteredRuns[0].id);
    }
  }, [selectedCommitSha, filteredRuns, selectedRunId]);

  // Fetch details for selected workflow run
  const { data: runDetails, isLoading: isRunDetailsLoading } = useQuery<WorkflowRunDetails>({
    queryKey: selectedRunId ? ["/api/github/workflow-run", selectedRunId] : [],
    enabled: !!selectedRunId,
  });

  // Fetch bot comments for this PR
  const { data: botCommentsData } = useQuery<{ comments: GitHubReviewComment[] }>({
    queryKey: selectedPR ? ["/api/github/pr-bot-comments", selectedPR.prNumber] : [],
    enabled: !!selectedPR,
  });

  // Fetch task.yaml data for this PR
  const { data: taskData } = useQuery<{ taskYaml: any; taskId: string | null }>({
    queryKey: selectedPR ? ["/api/github/pr-task-yaml", selectedPR.prNumber] : [],
    enabled: !!selectedPR,
  });

  // Fetch PR files
  const { data: prFilesData } = useQuery<{ files: any[] }>({
    queryKey: selectedPR ? ["/api/github/pr-files", selectedPR.prNumber] : [],
    enabled: !!selectedPR,
  });

  // Get selected run from filtered runs
  const selectedRun = filteredRuns.find(r => r.id === selectedRunId);
  const selectedCommit = commitsData?.commits.find(c => c.sha === selectedCommitSha);

  // Fetch commit details for display
  const { data: commitData } = useQuery<{ message: string; author: string; email: string }>({
    queryKey: selectedCommitSha ? ["/api/github/commit", selectedCommitSha] : [],
    enabled: !!selectedCommitSha,
  });

  // Fetch jobs for selected run to show agent results
  const { data: jobsData } = useQuery<{ jobs: Array<{ name: string; conclusion: string | null; status: string }> }>({
    queryKey: selectedRunId ? ["/api/github/workflow-jobs", selectedRunId] : [],
    enabled: !!selectedRunId,
  });

  const duration = selectedRun ?
    Math.floor((new Date(selectedRun.updated_at).getTime() - new Date(selectedRun.created_at).getTime()) / 1000) : 0;
  const formatDuration = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins}m ${remainingSecs}s`;
  };

  // Find cast artifact
  const castArtifact = runDetails?.artifacts.find(a => 
    a.name.toLowerCase().includes('cast') || 
    a.name.toLowerCase().includes('asciinema') ||
    a.name.toLowerCase().includes('recording')
  );

  const getWorkflowStatusColor = (status: string, conclusion?: string | null) => {
    if (status === 'completed') {
      switch (conclusion) {
        case 'success': return 'bg-success/20 text-success';
        case 'failure': return 'bg-destructive/20 text-destructive';
        default: return 'bg-muted/20 text-muted-foreground';
      }
    } else if (status === 'in_progress') {
      return 'bg-warning/20 text-warning';
    }
    return 'bg-primary/20 text-primary';
  };

  const getWorkflowStatusIcon = (status: string, conclusion?: string | null) => {
    if (status === 'completed') {
      switch (conclusion) {
        case 'success': return <CheckCircle className="h-4 w-4 text-success" />;
        case 'failure': return <XCircle className="h-4 w-4 text-destructive" />;
        default: return <XCircle className="h-4 w-4 text-muted-foreground" />;
      }
    } else if (status === 'in_progress') {
      return <Clock className="h-4 w-4 text-warning animate-pulse" />;
    }
    return <Clock className="h-4 w-4 text-primary" />;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getStatusColor = (status: string, conclusion?: string | null) => {
    if (status === 'completed') {
      return conclusion === 'success' ? 'text-success' : 'text-destructive';
    } else if (status === 'in_progress') {
      return 'text-warning';
    }
    return 'text-muted-foreground';
  };

  const getStatusIcon = (status: string, conclusion?: string | null) => {
    if (status === 'completed') {
      return conclusion === 'success' ? <CheckCircle className="h-5 w-5" /> : <XCircle className="h-5 w-5" />;
    } else if (status === 'in_progress') {
      return <Clock className="h-5 w-5 animate-pulse" />;
    }
    return <Clock className="h-5 w-5" />;
  };

  if (!selectedPR) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center">
          <GitPullRequest className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-foreground mb-2">Select a Pull Request</h2>
          <p className="text-muted-foreground">Choose a PR from the sidebar to view details</p>
        </div>
      </div>
    );
  }

  if (isPRLoading || isRunsLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!prData) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center">
          <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h2 className="text-lg font-semibold">Failed to Load PR</h2>
        </div>
      </div>
    );
  }

  // Copy file content to clipboard
  const copyToClipboard = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  // Build file tree from flat list
  const buildFileTree = (files: any[]) => {
    const tree: any = {};
    files.forEach((file: any) => {
      const parts = file.path.split('/');
      let current = tree;
      parts.forEach((part: string, index: number) => {
        if (index === parts.length - 1) {
          // Leaf node (file)
          if (!current._files) current._files = [];
          current._files.push({ ...file, name: part });
        } else {
          // Directory node
          if (!current[part]) {
            current[part] = {};
          }
          current = current[part];
        }
      });
    });
    return tree;
  };

  // Render tree recursively
  const renderTree = (node: any, path: string = ''): JSX.Element[] => {
    const elements: JSX.Element[] = [];
    
    // Render directories
    Object.keys(node).forEach(key => {
      if (key === '_files') return;
      
      const fullPath = path ? `${path}/${key}` : key;
      elements.push(
        <div key={fullPath} className="ml-2">
          <div className="flex items-center gap-1 p-1 text-xs text-muted-foreground">
            <ChevronRight className="h-3 w-3" />
            <span>{key}/</span>
          </div>
          {renderTree(node[key], fullPath)}
        </div>
      );
    });
    
    // Render files
    if (node._files) {
      node._files.forEach((file: any) => {
        elements.push(
          <div
            key={file.sha}
            className={`flex items-center gap-2 p-2 ml-2 hover:bg-muted rounded cursor-pointer transition-colors ${
              selectedFile?.sha === file.sha ? 'bg-primary/20 border border-primary/30' : ''
            }`}
            onClick={async () => {
              setSelectedFile(file);
              // Fetch file content
              try {
                const response = await fetch(`/api/github/pr-file-content/${selectedPR.prNumber}?path=${encodeURIComponent(file.path)}`);
                const data = await response.json();
                if (data.content) {
                  setFileContent(data.content);
                }
              } catch (error) {
                console.error('Error fetching file:', error);
                setFileContent('Error loading file content');
              }
            }}
          >
            <FileCode className="h-3 w-3 text-accent flex-shrink-0" />
            <span className="text-sm truncate">{file.name}</span>
          </div>
        );
      });
    }
    
    return elements;
  };

  const fileTree = prFilesData ? buildFileTree(prFilesData.files) : {};

  return (
    <div className="flex-1 flex flex-col">
      {/* Header with Breadcrumbs and Run Selector */}
      <header className="bg-card border-b border-border px-6 py-5">
        <div className="flex items-center justify-between gap-8">
          <nav className="flex items-center space-x-2 text-base flex-shrink min-w-0" data-testid="breadcrumbs">
            <span className="text-muted-foreground font-medium truncate max-w-2xl" title={`#${prData.number}: ${prData.title}`}>
              #{prData.number}: {prData.title}
            </span>
            {selectedCommit && (
              <>
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <code className="text-foreground font-medium whitespace-nowrap" title={selectedCommit.message}>
                  {selectedCommit.sha.substring(0, 7)}
                </code>
              </>
            )}
            {selectedRun && (
              <>
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-foreground font-medium whitespace-nowrap">Run #{selectedRun.run_number}</span>
              </>
            )}
          </nav>

          <div className="flex items-center gap-3 flex-shrink-0">
            {/* Commit Selector */}
            {commitsData && commitsData.commits.length > 1 && (
              <Select
                value={selectedCommitSha || ""}
                onValueChange={(value) => setSelectedCommitSha(value)}
              >
                <SelectTrigger className="w-80 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="w-96">
                  {commitsData.commits.map((commit, index) => (
                    <SelectItem key={commit.sha} value={commit.sha}>
                      <div className="flex items-center gap-2" title={commit.message}>
                        <code className="text-xs font-mono flex-shrink-0">{commit.sha.substring(0, 7)}</code>
                        {index === commitsData.commits.length - 1 && <Badge variant="outline" className="text-xs">Latest</Badge>}
                        <span className="text-xs text-muted-foreground truncate">
                          {commit.message.split('\n')[0]}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Run Selector - Filtered by commit */}
            {filteredRuns.length > 1 && (
              <Select
                value={selectedRunId?.toString() || ""}
                onValueChange={(value) => setSelectedRunId(parseInt(value, 10))}
              >
                <SelectTrigger className="w-72 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="w-80">
                  {filteredRuns.map((run, index) => {
                    const date = new Date(run.created_at);
                    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                    
                    return (
                      <SelectItem key={run.id} value={run.id.toString()}>
                        <div className="flex items-center gap-3 min-w-0">
                          {getWorkflowStatusIcon(run.status, run.conclusion)}
                          <span className="font-mono flex-shrink-0">#{run.run_number}</span>
                          {index === 0 && <Badge variant="outline" className="text-xs px-1.5 flex-shrink-0">Latest</Badge>}
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {dateStr} {timeStr}
                          </span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}
            
            <Button variant="secondary" size="sm" asChild className="flex-shrink-0">
              <a
                href={prData.html_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                View on GitHub
              </a>
            </Button>
          </div>
        </div>
      </header>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">
          <div className="bg-card border-b border-border px-6">
            <TabsList className="grid grid-cols-5 w-full max-w-2xl bg-transparent h-auto p-0">
              <TabsTrigger
                value="overview"
                className="flex items-center gap-2 px-1 py-4 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
                data-testid="tab-overview"
              >
                <BarChart3 className="h-4 w-4" />
                Overview
              </TabsTrigger>
              <TabsTrigger
                value="terminal"
                className="flex items-center gap-2 px-1 py-4 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
                data-testid="tab-terminal"
              >
                <Terminal className="h-4 w-4" />
                Terminal
              </TabsTrigger>
              <TabsTrigger
                value="logs"
                className="flex items-center gap-2 px-1 py-4 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
                data-testid="tab-logs"
              >
                <Bug className="h-4 w-4" />
                Logs
              </TabsTrigger>
              <TabsTrigger
                value="files"
                className="flex items-center gap-2 px-1 py-4 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
                data-testid="tab-files"
              >
                <FileCode className="h-4 w-4" />
                Files
              </TabsTrigger>
              <TabsTrigger
                value="comments"
                className="flex items-center gap-2 px-1 py-4 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
                data-testid="tab-comments"
              >
                <MessageSquare className="h-4 w-4" />
                Comments
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="p-6 space-y-6 m-0">
            {!selectedRun && selectedCommitSha && filteredRuns.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-semibold mb-2">No Workflow Runs</h3>
                  <p className="text-muted-foreground">No workflow runs found for this commit.</p>
                </CardContent>
              </Card>
            ) : selectedRun ? (
              <>
                {/* Task Information - Three Column Layout */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Task Details</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div>
                          <label className="text-sm text-muted-foreground block mb-1">Task ID</label>
                          <p className="text-sm">{taskData?.taskId || 'N/A'}</p>
                        </div>
                        <div>
                          <label className="text-sm text-muted-foreground block mb-1">Duration</label>
                          <p className="text-sm">{formatDuration(duration)}</p>
                        </div>
                        <div>
                          <label className="text-sm text-muted-foreground block mb-1">Difficulty</label>
                          <p className="text-sm capitalize">{taskData?.taskYaml?.difficulty || 'N/A'}</p>
                        </div>
                        {taskData?.taskYaml?.category && (
                          <div>
                            <label className="text-sm text-muted-foreground block mb-1">Category</label>
                            <p className="text-sm">{taskData.taskYaml.category}</p>
                          </div>
                        )}
                        {taskData?.taskYaml?.max_agent_timeout_sec && (
                          <div>
                            <label className="text-sm text-muted-foreground block mb-1">Max Agent Timeout</label>
                            <p className="text-sm">{taskData.taskYaml.max_agent_timeout_sec}s</p>
                          </div>
                        )}
                        {taskData?.taskYaml?.max_test_timeout_sec && (
                          <div>
                            <label className="text-sm text-muted-foreground block mb-1">Max Test Timeout</label>
                            <p className="text-sm">{taskData.taskYaml.max_test_timeout_sec}s</p>
                          </div>
                        )}
                        {taskData?.taskYaml?.tags && taskData.taskYaml.tags.length > 0 && (
                          <div>
                            <label className="text-sm text-muted-foreground block mb-1">Tags</label>
                            <div className="flex flex-wrap gap-1">
                              {taskData.taskYaml.tags.map((tag: string) => (
                                <Badge key={tag} variant="secondary" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Agent Results</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {jobsData && jobsData.jobs.length > 0 ? (
                        <div className="space-y-2">
                          {jobsData.jobs.map((job, index) => (
                            <div key={index} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                              <span className="text-sm">{job.name}</span>
                              <div className="flex items-center gap-2">
                                {job.conclusion === 'success' ? (
                                  <>
                                    <CheckCircle className="h-4 w-4 text-success" />
                                    <span className="text-sm text-success font-medium">PASS</span>
                                  </>
                                ) : job.conclusion === 'failure' ? (
                                  <>
                                    <XCircle className="h-4 w-4 text-destructive" />
                                    <span className="text-sm text-destructive font-medium">FAIL</span>
                                  </>
                                ) : (
                                  <span className="text-sm text-muted-foreground">
                                    {job.status?.toUpperCase() || 'PENDING'}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No agent results available</p>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Pull Request Details</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div>
                          <label className="text-sm text-muted-foreground block mb-1">Author</label>
                          <p className="text-sm">
                            {taskData?.taskYaml?.author_name || commitData?.author || prData.user.login}
                            {(commitData?.email || taskData?.taskYaml?.author_email) && (
                              <> &lt;{commitData?.email || taskData?.taskYaml?.author_email}&gt; ({prData.user.login})</>
                            )}
                            {!(commitData?.email || taskData?.taskYaml?.author_email) && (
                              <> ({prData.user.login})</>
                            )}
                          </p>
                        </div>
                        <div>
                          <label className="text-sm text-muted-foreground block mb-1">Commit</label>
                          <Button
                            variant="link"
                            className="p-0 h-auto text-sm justify-start font-normal hover:underline"
                            asChild
                          >
                            <a
                              href={`https://github.com/abundant-ai/tbench-hammer/commit/${selectedCommitSha || selectedRun?.head_sha}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={commitData?.message || selectedCommit?.message}
                            >
                              <div className="flex items-center gap-2">
                                <code className="text-xs font-mono">{(selectedCommitSha || selectedRun?.head_sha || '').substring(0, 7)}</code>
                                <ChevronRight className="h-3 w-3" />
                                <span className="text-sm truncate max-w-md">
                                  {commitData?.message?.split('\n')[0] || selectedCommit?.message?.split('\n')[0] || 'View commit'}
                                </span>
                              </div>
                            </a>
                          </Button>
                          {selectedCommit && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {new Date(selectedCommit.date).toLocaleString()}
                            </p>
                          )}
                        </div>
                        <div>
                          <label className="text-sm text-muted-foreground block mb-1">Created At</label>
                          <p className="text-sm">{formatDate(prData.created_at)}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Task Instruction */}
                {taskData?.taskYaml?.instruction && (
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle>Task Instruction</CardTitle>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => copyToClipboard(taskData.taskYaml.instruction)}
                          title="Copy instruction"
                        >
                          <FileCode className="h-4 w-4 mr-1" />
                          Copy
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="bg-muted rounded-lg p-4">
                        <pre className="text-sm whitespace-pre-wrap text-foreground">
                          {taskData.taskYaml.instruction}
                        </pre>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : null}
          </TabsContent>

          <TabsContent value="terminal" className="p-6 space-y-6 m-0">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Terminal Recording</CardTitle>
                  {castArtifact && (
                    <Button 
                      variant="secondary" 
                      size="sm"
                      onClick={() => window.open(`/api/github/download-artifact/${selectedRunId}/${castArtifact.name}`, '_blank')}
                      disabled={castArtifact.expired}
                      data-testid="button-download-cast"
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Download .cast
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {castArtifact ? (
                  castArtifact.expired ? (
                    <div className="bg-black rounded-lg p-8 text-center">
                      <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
                      <p className="text-gray-400">This artifact has expired</p>
                      <p className="text-sm text-gray-500 mt-2">GitHub artifacts expire after 90 days</p>
                    </div>
                  ) : (
                    <div className="bg-black rounded-lg overflow-hidden">
                      <div ref={playerRef} className="w-full min-h-[400px] flex items-center justify-center">
                        <div className="text-green-400 font-mono text-sm p-4">
                          <Terminal className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p>Cast file: {castArtifact.name}</p>
                          <p className="text-xs text-gray-500 mt-2">Download to view locally</p>
                        </div>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="bg-black rounded-lg p-8 text-center">
                    <Terminal className="h-12 w-12 text-gray-600 mx-auto mb-4" />
                    <p className="text-gray-400">No terminal recording available</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="files" className="p-0 m-0 h-full">
            {prFilesData && prFilesData.files.length > 0 ? (
              <div className="flex h-full">
                {/* File Tree Sidebar */}
                <div className="w-80 border-r border-border bg-card overflow-y-auto scrollbar-thin">
                  <div className="p-4 border-b border-border">
                    <h3 className="font-semibold text-sm">Files ({prFilesData.files.length})</h3>
                  </div>
                  <div className="p-2">
                    {renderTree(fileTree)}
                  </div>
                </div>

                {/* File Content Viewer */}
                <div className="flex-1 flex flex-col">
                  {selectedFile && fileContent ? (
                    <>
                      <div className="p-4 border-b border-border bg-card flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-sm truncate">{selectedFile.name}</h3>
                          <p className="text-xs text-muted-foreground font-mono truncate">{selectedFile.path}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => copyToClipboard(fileContent || '')}
                            title="Copy file content"
                          >
                            <FileCode className="h-4 w-4 mr-1" />
                            Copy
                          </Button>
                          {selectedFile.download_url && (
                            <Button
                              variant="ghost"
                              size="sm"
                              asChild
                            >
                              <a
                                href={selectedFile.download_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="flex-1 overflow-auto bg-black p-4">
                        <pre className="text-xs font-mono text-green-400 whitespace-pre-wrap break-words">
                          {fileContent}
                        </pre>
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 flex items-center justify-center">
                      <div className="text-center">
                        <FileCode className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                        <p className="text-muted-foreground">Select a file to view its content</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full p-8">
                <div className="text-center">
                  <FileCode className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <p className="text-muted-foreground">No files found in this PR</p>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="logs" className="p-6 space-y-6 m-0">
            {runDetails?.logs && runDetails.logs.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Workflow Execution Logs</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-black rounded-lg p-4 max-h-[600px] overflow-y-auto scrollbar-thin">
                    <pre className="text-xs font-mono text-green-400 whitespace-pre-wrap">
                      {runDetails.logs[0]?.content || 'No logs available'}
                    </pre>
                  </div>
                </CardContent>
              </Card>
            ) : isRunDetailsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent"></div>
                <span className="ml-3 text-muted-foreground">Loading logs...</span>
              </div>
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <Terminal className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <p className="text-muted-foreground">No logs available</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="comments" className="p-6 space-y-6 m-0">
            {botCommentsData && botCommentsData.comments.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Workflow Bot Comments</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {botCommentsData.comments.map((comment) => (
                      <div 
                        key={comment.id}
                        className="border border-border rounded-lg p-4 bg-muted/30"
                      >
                        <div className="flex items-center gap-2 mb-3">
                          <Badge variant="secondary">{comment.user.login}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(comment.created_at)}
                          </span>
                        </div>
                        <div className="text-sm text-foreground whitespace-pre-wrap bg-background p-3 rounded border border-border">
                          {comment.body}
                        </div>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          asChild
                          className="h-7 text-xs mt-2"
                        >
                          <a 
                            href={comment.html_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1"
                          >
                            <ExternalLink className="h-3 w-3" />
                            View on GitHub
                          </a>
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <p className="text-muted-foreground">No bot comments found</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
