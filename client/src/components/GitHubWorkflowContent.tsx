import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import CustomTerminalViewer from "./CustomTerminalViewer";
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
  const [selectedLogFile, setSelectedLogFile] = useState<string | null>(null);
  const [logType, setLogType] = useState<'agent' | 'tests'>('agent');
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [castType, setCastType] = useState<'agent' | 'tests'>('agent');

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

  // Find artifact with logs - prioritize recordings (which contain both .cast and .log)
  // Then fall back to dedicated log/session/test-result artifacts
  const logArtifact = runDetails?.artifacts.find(a =>
    a.name.toLowerCase().includes('recording')
  ) || runDetails?.artifacts.find(a =>
    a.name.toLowerCase().includes('log') ||
    a.name.toLowerCase().includes('session') ||
    a.name.toLowerCase().includes('test-result')
  );

  // Fetch log files from artifact - PRELOAD for performance
  const { data: logFilesData } = useQuery<{ logFiles: Array<{ name: string; path: string }> }>({
    queryKey: logArtifact ? ["/api/github/artifact-logs", logArtifact.id] : [],
    enabled: !!logArtifact, // Preload immediately when artifact is available
    staleTime: 10 * 60 * 1000, // Cache for 10 minutes
    gcTime: 15 * 60 * 1000, // Keep in memory for 15 minutes
  });

  // Auto-select first log file
  useEffect(() => {
    if (logFilesData && logFilesData.logFiles.length > 0 && !selectedLogFile) {
      setSelectedLogFile(logFilesData.logFiles[0].path);
    }
  }, [logFilesData, selectedLogFile]);

  // Use React Query for log content fetching - REPLACE useEffect for consistency and caching
  const logContentQuery = useQuery<{ content: string }>({
    queryKey: logArtifact && selectedLogFile ? [
      "log-content",
      logArtifact.id,
      selectedLogFile
    ] : [],
    queryFn: async () => {
      if (!logArtifact || !selectedLogFile) {
        throw new Error('No log artifact or file selected');
      }
      
      const response = await fetch(
        `/api/github/artifact-log-content/${logArtifact.id}?path=${encodeURIComponent(selectedLogFile)}`
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || `Failed to fetch log: ${response.statusText}`);
      }
      
      return await response.json();
    },
    enabled: !!(logArtifact && selectedLogFile), // Preload immediately when log file selected
    staleTime: 10 * 60 * 1000, // Cache for 10 minutes
    gcTime: 15 * 60 * 1000, // Keep in memory for 15 minutes
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // Update logContent state from React Query
  const logContent = logContentQuery.data?.content || null;

  const duration = selectedRun ?
    Math.floor((new Date(selectedRun.updated_at).getTime() - new Date(selectedRun.created_at).getTime()) / 1000) : 0;
  const formatDuration = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins}m ${remainingSecs}s`;
  };

  // Fetch cast list to get all available agents and cast files - PRELOAD for performance
  const { data: castListData } = useQuery<{
    castFiles: Array<{
      artifact_id: number;
      artifact_name: string;
      expired: boolean;
      files: Array<{ name: string; path: string; size: number }>;
    }>
  }>({
    queryKey: selectedRunId ? ["/api/github/cast-list", selectedRunId] : [],
    enabled: !!selectedRunId, // Preload immediately when run is selected
    staleTime: 10 * 60 * 1000, // Cache for 10 minutes
    gcTime: 15 * 60 * 1000, // Keep in memory for 15 minutes
  });

  // Parse available agents from cast list - filter out artifacts with no .cast files
  const availableAgents = castListData?.castFiles
    .filter(cf => cf.files.length > 0) // Only include artifacts that have .cast files
    .map(cf => {
      // Parse agent name from artifact name: recordings-nop → NOP, recordings-terminus-gpt4 → Terminus (GPT-4)
      const name = cf.artifact_name.replace(/^recordings-/i, '');
      const displayName = name.split('-').map((part, idx) => {
        if (idx === 0) {
          return part.charAt(0).toUpperCase() + part.slice(1);
        }
        return part.toUpperCase();
      }).join(' ');
      
      return {
        id: cf.artifact_id,
        name: name,
        displayName: displayName,
        artifact_name: cf.artifact_name,
        files: cf.files,
        expired: cf.expired
      };
    }) || [];

  // Auto-select first agent
  useEffect(() => {
    if (availableAgents.length > 0 && !selectedAgent) {
      setSelectedAgent(availableAgents[0].artifact_name);
    }
  }, [availableAgents, selectedAgent]);

  // Memoize selected agent data to prevent constant re-renders
  const selectedAgentData = useMemo(() => {
    return availableAgents.find(a => a.artifact_name === selectedAgent);
  }, [availableAgents, selectedAgent]);
  
  const selectedCastFile = useMemo(() => {
    return selectedAgentData?.files.find(f => f.name === `${castType}.cast`);
  }, [selectedAgentData, castType]);

  // Use React Query for cast file caching with custom queryFn - PRELOAD first agent
  const castFileQuery = useQuery<{ content: string }>({
    queryKey: selectedAgentData && selectedCastFile ? [
      "cast-file",
      selectedAgentData.id,
      selectedCastFile.path
    ] : [],
    queryFn: async () => {
      if (!selectedAgentData || !selectedCastFile) {
        throw new Error('No agent or cast file selected');
      }
      
      const response = await fetch(
        `/api/github/cast-file-by-path/${selectedAgentData.id}?path=${encodeURIComponent(selectedCastFile.path)}`
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || `Failed to fetch cast: ${response.statusText}`);
      }
      
      return await response.json();
    },
    enabled: !!(selectedAgentData && selectedCastFile), // Preload immediately when agent/cast selected
    staleTime: 10 * 60 * 1000, // Cache for 10 minutes
    gcTime: 15 * 60 * 1000, // Keep in memory for 15 minutes
    retry: 1,
    refetchOnWindowFocus: false,
  });

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
                <span className="text-foreground font-medium whitespace-nowrap">#{selectedRun.run_number}</span>
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
                        <div className="space-y-3">
                          {(() => {
                            // Filter jobs that start with "Test with"
                            const testJobs = jobsData.jobs.filter(job => job.name.startsWith('Test with '));
                            
                            if (testJobs.length === 0) {
                              return <p className="text-sm text-muted-foreground">No agent test results available</p>;
                            }
                            
                            // Parse and group by agent
                            const agentGroups: Record<string, Array<{ model: string | null; conclusion: string | null; status: string }>> = {};
                            
                            testJobs.forEach(job => {
                              // Parse "Test with {Display}" where display can be:
                              // - "Oracle Solution" -> agent: "Oracle"
                              // - "NOP Agent (Should Fail)" -> agent: "NOP Agent", note: "Should Fail"
                              // - "Terminus (GPT-4.1)" -> agent: "Terminus", model: "GPT-4.1"
                              const match = job.name.match(/^Test with (.+?)(?:\s*\((.+)\))?$/);
                              if (match) {
                                let agentName = match[1].trim();
                                const parenthesesContent = match[2]?.trim();
                                
                                // Clean up agent names
                                if (agentName === 'Oracle Solution') {
                                  agentName = 'Oracle';
                                } else if (agentName === 'NOP Agent') {
                                  // Keep as "NOP Agent", ignore "Should Fail" note
                                }
                                
                                // Determine if content in parentheses is a model (not a note like "Should Fail")
                                const isModel = parenthesesContent && /(?:claude|gpt|gemini|o|llama|sonnet|pro|-|\d)/i.test(parenthesesContent) && !parenthesesContent.toLowerCase().includes('should fail');
                                const modelName = isModel ? parenthesesContent : null;
                                
                                if (!agentGroups[agentName]) {
                                  agentGroups[agentName] = [];
                                }
                                
                                agentGroups[agentName].push({
                                  model: modelName,
                                  conclusion: job.conclusion,
                                  status: job.status,
                                });
                              }
                            });
                            
                            return Object.entries(agentGroups).map(([agentName, tests]) => {
                              // If all tests have models, show as grouped
                              const hasModels = tests.some(t => t.model);
                              
                              if (hasModels) {
                                return (
                                  <div key={agentName} className="space-y-1">
                                    <div className="font-semibold text-sm text-foreground py-1.5 px-3">
                                      {agentName}
                                    </div>
                                    {tests.map((test, idx) => (
                                      <div key={idx} className="flex items-center justify-between pl-8 pr-3 py-1.5 bg-muted/30 rounded">
                                        <span className="text-sm text-muted-foreground">
                                          {test.model || 'Default'}
                                        </span>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                          {test.conclusion === 'success' ? (
                                            <>
                                              <CheckCircle className="h-4 w-4 text-success" />
                                              <span className="text-sm text-success font-medium">PASS</span>
                                            </>
                                          ) : test.conclusion === 'failure' ? (
                                            <>
                                              <XCircle className="h-4 w-4 text-destructive" />
                                              <span className="text-sm text-destructive font-medium">FAIL</span>
                                            </>
                                          ) : (
                                            <span className="text-sm text-muted-foreground">
                                              {test.status?.toUpperCase() || 'PENDING'}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                );
                              } else {
                                // Agent without models - show result inline
                                const test = tests[0];
                                return (
                                  <div key={agentName} className="flex items-center justify-between py-1.5 bg-muted/30 rounded px-3">
                                    <span className="text-sm font-semibold text-foreground">
                                      {agentName}
                                    </span>
                                    <div className="flex items-center gap-2">
                                      {test.conclusion === 'success' ? (
                                        <>
                                          <CheckCircle className="h-4 w-4 text-success" />
                                          <span className="text-sm text-success font-medium">PASS</span>
                                        </>
                                      ) : test.conclusion === 'failure' ? (
                                        <>
                                          <XCircle className="h-4 w-4 text-destructive" />
                                          <span className="text-sm text-destructive font-medium">FAIL</span>
                                        </>
                                      ) : (
                                        <span className="text-sm text-muted-foreground">
                                          {test.status?.toUpperCase() || 'PENDING'}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              }
                            });
                          })()}
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
                              <> &lt;{commitData?.email || taskData?.taskYaml?.author_email}&gt;</>
                            )}
                          </p>
                        </div>
                        <div>
                          <label className="text-sm text-muted-foreground block mb-1">Author Github Handle</label>
                          <p className="text-sm">{prData.user.login}</p>
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

          <TabsContent value="terminal" className="p-0 m-0 h-full">
            <div className="h-full flex flex-col">
              {/* Stable Control Bar */}
              {availableAgents.length > 0 && (
                <div className="bg-card border-b border-border p-4 flex-shrink-0">
                  <div className="flex items-center gap-3">
                    <Select
                      value={selectedAgent || ""}
                      onValueChange={setSelectedAgent}
                    >
                      <SelectTrigger className="w-64">
                        <SelectValue placeholder="Select Agent" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableAgents.map((agent) => (
                          <SelectItem key={agent.artifact_name} value={agent.artifact_name}>
                            {agent.displayName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex gap-2">
                      <Button
                        variant={castType === 'agent' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setCastType('agent')}
                      >
                        Agent
                      </Button>
                      <Button
                        variant={castType === 'tests' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setCastType('tests')}
                      >
                        Tests
                      </Button>
                    </div>
                    {selectedAgentData && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => window.open(`/api/github/download-artifact/${selectedRunId}/${selectedAgentData.artifact_name}`, '_blank')}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Download
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Stable Content Area */}
              <div className="flex-1 min-h-0">
                {castFileQuery.error ? (
                  <div className="h-full flex items-center justify-center p-8">
                    <div className="text-center">
                      <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
                      <p className="text-muted-foreground">Error loading cast file</p>
                      <p className="text-sm text-muted-foreground mt-2">
                        {(castFileQuery.error as Error)?.message || 'Failed to load cast file'}
                      </p>
                    </div>
                  </div>
                ) : !selectedCastFile ? (
                  <div className="h-full flex items-center justify-center p-8">
                    <div className="text-center">
                      <Terminal className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">
                        {availableAgents.length > 0 ?
                          `No ${castType} recording found for this agent` :
                          'No terminal recordings available'
                        }
                      </p>
                    </div>
                  </div>
                ) : castFileQuery.isLoading ? (
                  <div className="h-full flex items-center justify-center p-8">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent mx-auto mb-4"></div>
                      <p className="text-muted-foreground">Loading terminal session...</p>
                    </div>
                  </div>
                ) : castFileQuery.data?.content ? (
                  <div className="h-full">
                    <CustomTerminalViewer
                      castContent={castFileQuery.data.content}
                      showAgentThinking={castType === 'agent'}
                    />
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center p-8">
                    <div className="text-center">
                      <Terminal className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">No cast content available</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
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

          <TabsContent value="logs" className="p-0 m-0 h-full">
            {logFilesData && logFilesData.logFiles.length > 0 ? (
              <div className="flex flex-col h-full">
                <div className="bg-card border-b border-border p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex gap-2">
                      <Button
                        variant={logType === 'agent' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => {
                          setLogType('agent');
                          const agentLog = logFilesData.logFiles.find(f => f.name.includes('agent'));
                          if (agentLog) setSelectedLogFile(agentLog.path);
                        }}
                      >
                        Agent
                      </Button>
                      <Button
                        variant={logType === 'tests' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => {
                          setLogType('tests');
                          const testsLog = logFilesData.logFiles.find(f => f.name.includes('tests'));
                          if (testsLog) setSelectedLogFile(testsLog.path);
                        }}
                      >
                        Tests
                      </Button>
                    </div>
                    {selectedLogFile && (
                      <span className="text-sm text-muted-foreground">
                        {logFilesData.logFiles.find(f => f.path === selectedLogFile)?.name}
                      </span>
                    )}
                  </div>
                  {logContent && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => copyToClipboard(logContent)}
                      title="Copy log content"
                    >
                      <FileCode className="h-4 w-4 mr-1" />
                      Copy
                    </Button>
                  )}
                </div>
                <div className="flex-1 overflow-auto bg-black p-4">
                  {logContentQuery.error ? (
                    <div className="text-center text-red-400 p-8">
                      <p>Error loading log file</p>
                      <p className="text-sm mt-2">
                        {(logContentQuery.error as Error)?.message || 'Failed to load log file'}
                      </p>
                    </div>
                  ) : logContent ? (
                    <pre className="text-xs font-mono text-green-400 whitespace-pre-wrap">
                      {logContent}
                    </pre>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent"></div>
                      <span className="ml-3 text-gray-400">Loading log file...</span>
                    </div>
                  )}
                </div>
              </div>
            ) : isRunDetailsLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent"></div>
                <span className="ml-3 text-muted-foreground">Loading logs...</span>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full p-8">
                <div className="text-center">
                  <Terminal className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <p className="text-muted-foreground">No log files available in artifacts</p>
                </div>
              </div>
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
