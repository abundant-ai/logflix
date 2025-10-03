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
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const playerRef = useRef<HTMLDivElement>(null);

  // Fetch PR details
  const { data: prData, isLoading: isPRLoading } = useQuery<GitHubPullRequest>({
    queryKey: selectedPR ? ["/api/github/pull-request", selectedPR.prNumber] : [],
    enabled: !!selectedPR,
  });

  // Fetch workflow runs for this PR
  const { data: runsData, isLoading: isRunsLoading } = useQuery<{ runs: GitHubWorkflowRun[]; total_count: number }>({
    queryKey: selectedPR ? ["/api/github/pr-workflow-runs", selectedPR.prNumber] : [],
    enabled: !!selectedPR,
  });

  // Auto-select the latest run when data loads
  useEffect(() => {
    if (runsData && runsData.runs.length > 0) {
      setSelectedRunId(runsData.runs[0].id);
    }
  }, [runsData]);

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

  const selectedRun = runsData?.runs.find(r => r.id === selectedRunId);
  const duration = selectedRun ? 
    Math.floor((new Date(selectedRun.updated_at).getTime() - new Date(selectedRun.created_at).getTime()) / 1000) : 0;
  const formatDuration = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins}m ${remainingSecs}s`;
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Header with Breadcrumbs and Run Selector */}
      <header className="bg-card border-b border-border px-6 py-5">
        <div className="flex items-center justify-between gap-8">
          <nav className="flex items-center space-x-2 text-base flex-shrink min-w-0" data-testid="breadcrumbs">
            <span className="text-muted-foreground flex-shrink-0">Pull Requests</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="text-muted-foreground font-medium truncate max-w-2xl" title={`#${prData.number}: ${prData.title}`}>
              #{prData.number}: {prData.title}
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            {selectedRun && (
              <div className="flex items-center gap-2 flex-shrink-0 whitespace-nowrap">
                <span className="text-foreground font-medium">#{selectedRun.run_number}</span>
                <Badge className={`${getWorkflowStatusColor(selectedRun.status, selectedRun.conclusion)} text-xs`}>
                  {selectedRun.conclusion || selectedRun.status}
                </Badge>
              </div>
            )}
          </nav>

          <div className="flex items-center gap-4 flex-shrink-0">
            {/* Compact Run Selector - Only show if multiple runs */}
            {runsData && runsData.runs.length > 1 && (
              <Select
                value={selectedRunId?.toString() || ""}
                onValueChange={(value) => setSelectedRunId(parseInt(value, 10))}
              >
                <SelectTrigger className="w-72 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="w-80">
                  {runsData.runs.map((run, index) => {
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
                value="files" 
                className="flex items-center gap-2 px-1 py-4 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
                data-testid="tab-files"
              >
                <FileCode className="h-4 w-4" />
                Files
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
            {selectedRun && (
              <>
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Workflow Result</p>
                          <div className="flex items-center gap-2 mt-1">
                            {getStatusIcon(selectedRun.status, selectedRun.conclusion)}
                            <p className={`text-2xl font-bold ${getStatusColor(selectedRun.status, selectedRun.conclusion)}`}>
                              {selectedRun.conclusion?.toUpperCase() || selectedRun.status.toUpperCase()}
                            </p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Duration</p>
                          <p className="text-2xl font-bold">{formatDuration(duration)}</p>
                        </div>
                        <Clock className="h-5 w-5 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Artifacts</p>
                          <p className="text-2xl font-bold">{runDetails?.artifacts.length || 0}</p>
                        </div>
                        <FileCode className="h-5 w-5 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* PR Information */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Pull Request Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <label className="text-sm text-muted-foreground">Title</label>
                        <p className="text-sm mt-1">{prData.title}</p>
                      </div>
                      <div>
                        <label className="text-sm text-muted-foreground">Author</label>
                        <div className="flex items-center gap-2 mt-1">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <p className="text-sm">{prData.user.login}</p>
                        </div>
                      </div>
                      <div>
                        <label className="text-sm text-muted-foreground">Branch</label>
                        <p className="font-mono text-sm bg-muted px-2 py-1 rounded mt-1">
                          {prData.head.ref} → {prData.base.ref}
                        </p>
                      </div>
                      <div>
                        <label className="text-sm text-muted-foreground">State</label>
                        <div className="mt-1">
                          <Badge className={prData.state === 'open' ? 'bg-success/20 text-success' : 'bg-muted/20 text-muted-foreground'}>
                            {prData.merged_at ? 'Merged' : prData.state}
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Workflow Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <label className="text-sm text-muted-foreground">Run Number</label>
                        <p className="font-mono text-sm bg-muted px-2 py-1 rounded mt-1">
                          #{selectedRun.run_number}
                        </p>
                      </div>
                      <div>
                        <label className="text-sm text-muted-foreground">Workflow</label>
                        <p className="text-sm mt-1">{selectedRun.workflow_name}</p>
                      </div>
                      <div>
                        <label className="text-sm text-muted-foreground">Created</label>
                        <p className="text-sm mt-1">{formatDate(selectedRun.created_at)}</p>
                      </div>
                      <div>
                        <label className="text-sm text-muted-foreground">Commit</label>
                        <p className="font-mono text-xs bg-muted px-2 py-1 rounded mt-1">
                          {selectedRun.head_sha.substring(0, 7)}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
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

          <TabsContent value="files" className="p-6 space-y-6 m-0">
            {runDetails?.artifacts && runDetails.artifacts.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Workflow Artifacts</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {runDetails.artifacts.map((artifact) => (
                      <div 
                        key={artifact.id}
                        className="flex items-center justify-between p-3 hover:bg-muted rounded-lg transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <FileCode className="h-4 w-4 text-accent" />
                          <div>
                            <p className="text-sm font-medium">{artifact.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {(artifact.size_in_bytes / 1024).toFixed(1)} KB
                              {artifact.expired && <span className="text-destructive ml-2">(Expired)</span>}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {artifact.created_at && formatDate(artifact.created_at)}
                          </span>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            disabled={artifact.expired}
                            onClick={() => window.open(`/api/github/download-artifact/${selectedRunId}/${artifact.name}`, '_blank')}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <FileCode className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <p className="text-muted-foreground">No artifacts available</p>
                </CardContent>
              </Card>
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