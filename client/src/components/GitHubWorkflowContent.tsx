import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  Calendar as CalendarIcon,
  GitBranch,
  Play,
  AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  const [activeTab, setActiveTab] = useState("pr-details");
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);

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

  // Fetch bot comments for this PR
  const { data: botCommentsData, isLoading: isCommentsLoading } = useQuery<{ comments: GitHubReviewComment[] }>({
    queryKey: selectedPR ? ["/api/github/pr-bot-comments", selectedPR.prNumber] : [],
    enabled: !!selectedPR && activeTab === "bot-comments",
  });

  // Fetch details for selected workflow run
  const { data: runDetails } = useQuery<WorkflowRunDetails>({
    queryKey: selectedRunId ? ["/api/github/workflow-run", selectedRunId] : [],
    enabled: !!selectedRunId,
  });

  const getWorkflowStatusColor = (status: string, conclusion?: string | null) => {
    if (status === 'completed') {
      switch (conclusion) {
        case 'success': return 'bg-success/20 text-success';
        case 'failure': return 'bg-destructive/20 text-destructive';
        case 'cancelled': return 'bg-muted/20 text-muted-foreground';
        case 'timed_out': return 'bg-warning/20 text-warning';
        default: return 'bg-muted/20 text-muted-foreground';
      }
    } else if (status === 'in_progress') {
      return 'bg-warning/20 text-warning';
    } else if (status === 'queued') {
      return 'bg-primary/20 text-primary';
    }
    return 'bg-muted/20 text-muted-foreground';
  };

  const getWorkflowStatusIcon = (status: string, conclusion?: string | null) => {
    if (status === 'completed') {
      switch (conclusion) {
        case 'success': return <CheckCircle className="h-4 w-4 text-success" />;
        case 'failure': return <XCircle className="h-4 w-4 text-destructive" />;
        default: return <XCircle className="h-4 w-4 text-muted-foreground" />;
      }
    } else if (status === 'in_progress') {
      return <Play className="h-4 w-4 text-warning animate-pulse" />;
    } else if (status === 'queued') {
      return <Clock className="h-4 w-4 text-primary" />;
    }
    return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (!selectedPR) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center">
          <GitPullRequest className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-foreground mb-2">Select a Pull Request</h2>
          <p className="text-muted-foreground">Choose a PR from the sidebar to view workflow runs and comments</p>
        </div>
      </div>
    );
  }

  if (isPRLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading PR data...</p>
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
          <p className="text-muted-foreground">Could not fetch pull request data</p>
        </div>
      </div>
    );
  }

  const latestRun = runsData?.runs[0];

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <nav className="flex items-center space-x-2 text-sm">
            <span className="text-muted-foreground">Pull Requests</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <span className="text-foreground font-medium">#{prData.number}</span>
          </nav>

          <div className="flex items-center gap-3">
            <Button variant="secondary" size="sm" asChild>
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

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">
          <div className="bg-card border-b border-border px-6">
            <TabsList className="grid grid-cols-2 w-full max-w-md bg-transparent h-auto p-0">
              <TabsTrigger 
                value="pr-details" 
                className="flex items-center gap-2 px-1 py-4 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                <GitPullRequest className="h-4 w-4" />
                Workflow Runs
              </TabsTrigger>
              <TabsTrigger 
                value="bot-comments" 
                className="flex items-center gap-2 px-1 py-4 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                <MessageSquare className="h-4 w-4" />
                Bot Comments
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="pr-details" className="p-6 space-y-6 m-0">
            {/* PR Info Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GitPullRequest className="h-5 w-5" />
                  {prData.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-muted-foreground">Author</label>
                    <div className="flex items-center gap-2 mt-1">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <p className="text-sm">{prData.user.login}</p>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">State</label>
                    <div className="mt-1">
                      <Badge className={prData.merged_at ? 'bg-purple-500/20 text-purple-500' : prData.state === 'open' ? 'bg-success/20 text-success' : 'bg-muted/20 text-muted-foreground'}>
                        {prData.merged_at ? 'Merged' : prData.state}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Branch</label>
                    <div className="flex items-center gap-2 mt-1">
                      <GitBranch className="h-4 w-4 text-muted-foreground" />
                      <p className="text-sm font-mono">{prData.head.ref}</p>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Base</label>
                    <div className="flex items-center gap-2 mt-1">
                      <GitBranch className="h-4 w-4 text-muted-foreground" />
                      <p className="text-sm font-mono">{prData.base.ref}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Workflow Runs */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Workflow Runs ({runsData?.total_count || 0})</span>
                  {latestRun && (
                    <Badge className={getWorkflowStatusColor(latestRun.status, latestRun.conclusion)}>
                      Latest: {latestRun.conclusion || latestRun.status}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isRunsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent"></div>
                    <span className="ml-3 text-muted-foreground">Loading workflow runs...</span>
                  </div>
                ) : runsData && runsData.runs.length > 0 ? (
                  <div className="space-y-2">
                    {runsData.runs.map((run) => (
                      <div 
                        key={run.id}
                        className={`border border-border rounded-lg p-4 hover:bg-muted/50 transition-colors cursor-pointer ${
                          selectedRunId === run.id ? 'bg-primary/10 border-primary' : ''
                        }`}
                        onClick={() => setSelectedRunId(run.id === selectedRunId ? null : run.id)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              {getWorkflowStatusIcon(run.status, run.conclusion)}
                              <span className="font-medium">Run #{run.run_number}</span>
                              <Badge className={getWorkflowStatusColor(run.status, run.conclusion)}>
                                {run.conclusion || run.status}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">{run.workflow_name}</p>
                            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                              <span>{formatDate(run.created_at)}</span>
                              <span>•</span>
                              <span>Attempt #{run.run_attempt}</span>
                            </div>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            asChild
                          >
                            <a 
                              href={run.html_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        </div>

                        {/* Expanded Run Details */}
                        {selectedRunId === run.id && runDetails && (
                          <div className="mt-4 pt-4 border-t border-border space-y-4">
                            {/* Logs */}
                            {runDetails.logs && runDetails.logs.length > 0 && (
                              <div>
                                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                                  <Terminal className="h-4 w-4" />
                                  Logs
                                </h4>
                                <div className="bg-black rounded-lg p-3 max-h-64 overflow-y-auto scrollbar-thin">
                                  <pre className="text-xs font-mono text-green-400 whitespace-pre-wrap">
                                    {runDetails.logs[0]?.content || 'No logs available'}
                                  </pre>
                                </div>
                              </div>
                            )}

                            {/* Artifacts */}
                            {runDetails.artifacts && runDetails.artifacts.length > 0 && (
                              <div>
                                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                                  <FileCode className="h-4 w-4" />
                                  Artifacts ({runDetails.artifacts.length})
                                </h4>
                                <div className="space-y-2">
                                  {runDetails.artifacts.map((artifact) => (
                                    <div 
                                      key={artifact.id}
                                      className="flex items-center justify-between p-2 bg-muted rounded"
                                    >
                                      <div className="flex items-center gap-2">
                                        <FileCode className="h-3 w-3 text-accent" />
                                        <span className="text-sm">{artifact.name}</span>
                                        <span className="text-xs text-muted-foreground">
                                          {(artifact.size_in_bytes / 1024).toFixed(1)} KB
                                        </span>
                                      </div>
                                      <Button 
                                        variant="ghost" 
                                        size="sm"
                                        disabled={artifact.expired}
                                        asChild={!artifact.expired}
                                        className="h-7"
                                      >
                                        <a 
                                          href={`/api/github/download-artifact/${run.id}/${artifact.name}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                        >
                                          <Download className="h-3 w-3" />
                                        </a>
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Terminal className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No workflow runs found for this PR</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="bot-comments" className="p-6 space-y-6 m-0">
            {isCommentsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
                <span className="ml-3 text-muted-foreground">Loading bot comments...</span>
              </div>
            ) : botCommentsData && botCommentsData.comments.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    Workflow Bot Comments ({botCommentsData.comments.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {botCommentsData.comments.map((comment) => (
                      <div 
                        key={comment.id}
                        className="border border-border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <Avatar className="h-8 w-8 bg-primary/20">
                            <AvatarFallback className="bg-primary/20 text-primary">
                              <Terminal className="h-4 w-4" />
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="font-medium text-sm">{comment.user.login}</span>
                              <Badge variant="secondary" className="text-xs">bot</Badge>
                              <span className="text-xs text-muted-foreground">•</span>
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <CalendarIcon className="h-3 w-3" />
                                {formatDate(comment.created_at)}
                              </span>
                            </div>
                            <div className="text-sm text-foreground whitespace-pre-wrap bg-background p-3 rounded border border-border">
                              {comment.body}
                            </div>
                            <div className="mt-2">
                              <Button 
                                variant="ghost" 
                                size="sm"
                                asChild
                                className="h-7 text-xs"
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
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No workflow bot comments found</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Bot comments from github-actions and other workflow bots will appear here
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}