import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Search, Filter, Calendar, Terminal, Bot, ChevronDown, ChevronRight, ExternalLink, CheckCircle, XCircle, GitBranch, Play, Clock, AlertCircle, Database, Workflow } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { S3Hierarchy, GitHubWorkflowHierarchy, UnifiedSelection } from "@shared/schema";

interface NavigationSidebarProps {
  onSelectTaskRun: (selection: UnifiedSelection) => void;
  selectedTaskRun: UnifiedSelection | null;
}

export default function NavigationSidebar({ onSelectTaskRun, selectedTaskRun }: NavigationSidebarProps) {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("s3");
  const [searchQuery, setSearchQuery] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("all");
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [expandedWorkflowRuns, setExpandedWorkflowRuns] = useState<Set<number>>(new Set());

  const { data: hierarchy, isLoading: s3Loading, error: s3Error } = useQuery<S3Hierarchy>({
    queryKey: ["/api/hierarchy"],
  });

  const { data: githubHierarchy, isLoading: githubLoading, error: githubError } = useQuery<GitHubWorkflowHierarchy>({
    queryKey: ["/api/github/hierarchy"],
    enabled: activeTab === "github",
  });

  // Auto-expand when selectedTaskRun changes
  useEffect(() => {
    if (selectedTaskRun) {
      if (selectedTaskRun.type === 's3') {
        const { date, taskId } = selectedTaskRun;
        setExpandedDates(prev => new Set(Array.from(prev).concat([date])));
        setExpandedTasks(prev => new Set(Array.from(prev).concat([`${date}-${taskId}`])));
      } else if (selectedTaskRun.type === 'github') {
        setExpandedWorkflowRuns(prev => new Set(Array.from(prev).concat([selectedTaskRun.runId])));
      }
    }
  }, [selectedTaskRun]);

  const toggleDateExpanded = (date: string) => {
    const newExpanded = new Set(expandedDates);
    if (newExpanded.has(date)) {
      newExpanded.delete(date);
    } else {
      newExpanded.add(date);
    }
    setExpandedDates(newExpanded);
  };

  const toggleTaskExpanded = (taskKey: string) => {
    const newExpanded = new Set(expandedTasks);
    if (newExpanded.has(taskKey)) {
      newExpanded.delete(taskKey);
    } else {
      newExpanded.add(taskKey);
    }
    setExpandedTasks(newExpanded);
  };

  const toggleWorkflowRunExpanded = (runId: number) => {
    const newExpanded = new Set(expandedWorkflowRuns);
    if (newExpanded.has(runId)) {
      newExpanded.delete(runId);
    } else {
      newExpanded.add(runId);
    }
    setExpandedWorkflowRuns(newExpanded);
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy': return 'text-success bg-success/20';
      case 'medium': return 'text-warning bg-warning/20';
      case 'hard': return 'text-destructive bg-destructive/20';
      default: return 'text-muted-foreground bg-muted/20';
    }
  };

  const getPassFailStatus = (accuracy: number) => {
    return accuracy >= 1.0;
  };

  const getWorkflowStatusColor = (status: string, conclusion?: string | null) => {
    if (status === 'completed') {
      switch (conclusion) {
        case 'success': return 'text-success bg-success/20';
        case 'failure': return 'text-destructive bg-destructive/20';
        case 'cancelled': return 'text-muted-foreground bg-muted/20';
        case 'skipped': return 'text-muted-foreground bg-muted/20';
        case 'timed_out': return 'text-warning bg-warning/20';
        default: return 'text-muted-foreground bg-muted/20';
      }
    } else if (status === 'in_progress') {
      return 'text-warning bg-warning/20';
    } else if (status === 'queued') {
      return 'text-primary bg-primary/20';
    }
    return 'text-muted-foreground bg-muted/20';
  };

  const getWorkflowStatusIcon = (status: string, conclusion?: string | null) => {
    if (status === 'completed') {
      switch (conclusion) {
        case 'success': return <CheckCircle className="h-3 w-3 text-success" />;
        case 'failure': return <XCircle className="h-3 w-3 text-destructive" />;
        case 'cancelled': return <XCircle className="h-3 w-3 text-muted-foreground" />;
        case 'skipped': return <XCircle className="h-3 w-3 text-muted-foreground" />;
        case 'timed_out': return <Clock className="h-3 w-3 text-warning" />;
        default: return <AlertCircle className="h-3 w-3 text-muted-foreground" />;
      }
    } else if (status === 'in_progress') {
      return <Play className="h-3 w-3 text-warning" />;
    } else if (status === 'queued') {
      return <Clock className="h-3 w-3 text-primary" />;
    }
    return <AlertCircle className="h-3 w-3 text-muted-foreground" />;
  };

  const isS3Selected = (date: string, taskId: string, modelName: string) => {
    return selectedTaskRun?.type === 's3' && 
           selectedTaskRun?.date === date && 
           selectedTaskRun?.taskId === taskId && 
           selectedTaskRun?.modelName === modelName;
  };

  const isGitHubSelected = (runId: number) => {
    return selectedTaskRun?.type === 'github' && selectedTaskRun?.runId === runId;
  };

  const isLoading = activeTab === 's3' ? s3Loading : githubLoading;
  const hasError = activeTab === 's3' ? s3Error : githubError;

  return (
    <div className="w-80 bg-card border-r border-border flex flex-col" data-testid="navigation-sidebar">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <h1 className="text-lg font-semibold text-foreground">Terminal-Bench Viewer</h1>
        <p className="text-sm text-muted-foreground mt-1">Multi-source benchmark data</p>
      </div>

      {/* Data Source Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1">
        <div className="p-4 pb-0">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="s3" className="flex items-center gap-2" data-testid="tab-s3">
              <Database className="h-4 w-4" />
              S3 Benchmarks
            </TabsTrigger>
            <TabsTrigger value="github" className="flex items-center gap-2" data-testid="tab-github">
              <Workflow className="h-4 w-4" />
              GitHub Workflows
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Search and Filters */}
        <div className="px-4 py-3 border-b border-border space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder={activeTab === 's3' ? "Search tasks, models..." : "Search workflow runs..."}
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-search"
            />
          </div>

          {activeTab === 's3' && (
            <div className="flex gap-2">
              <Select value={difficultyFilter} onValueChange={setDifficultyFilter}>
                <SelectTrigger className="flex-1" data-testid="select-difficulty">
                  <SelectValue placeholder="All Difficulty" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Difficulty</SelectItem>
                  <SelectItem value="easy">Easy</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="hard">Hard</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="secondary" size="sm" data-testid="button-filter">
                <Filter className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        <TabsContent value="s3" className="flex-1 flex flex-col m-0">
          <div className="flex-1 overflow-y-auto scrollbar-thin p-2">
            {s3Loading && (
              <div className="flex items-center justify-center py-8">
                <div className="text-muted-foreground">Loading S3 data...</div>
              </div>
            )}
            {s3Error && (
              <div className="flex items-center justify-center py-8 px-4">
                <div className="text-destructive text-center">
                  <div>Failed to load S3 data</div>
                  <div className="text-sm text-muted-foreground mt-1">Check AWS credentials</div>
                </div>
              </div>
            )}
            {hierarchy && !s3Loading && !s3Error && hierarchy.dates.filter(date => date.date === '2025-09-07').map((date) => (
              <div key={date.date} className="mb-2">
                <div 
                  className="flex items-center px-2 py-1 hover:bg-muted rounded cursor-pointer"
                  onClick={() => toggleDateExpanded(date.date)}
                  data-testid={`date-${date.date}`}
                >
                  {expandedDates.has(date.date) ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  )}
                  <Calendar className="ml-1 mr-2 text-primary h-4 w-4" />
                  <span className="text-sm font-medium">{date.date}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {date.tasks.length} tasks
                  </span>
                </div>

                {expandedDates.has(date.date) && (
                  <div className="ml-4 mt-1 space-y-1">
                    {date.tasks.map((task) => {
                      const taskKey = `${date.date}-${task.taskId}`;
                      return (
                        <div key={taskKey} className="mb-1">
                          <div className="flex items-center justify-between">
                            <div 
                              className="flex items-center px-2 py-1 hover:bg-muted rounded cursor-pointer flex-1"
                              onClick={() => toggleTaskExpanded(taskKey)}
                              data-testid={`task-${task.taskId}`}
                            >
                              {expandedTasks.has(taskKey) ? (
                                <ChevronDown className="w-4 h-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                              )}
                              <Terminal className="ml-1 mr-2 text-accent h-4 w-4" />
                              <span className="text-sm">{task.taskId}</span>
                            </div>
                            
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 mr-2"
                              onClick={(e) => {
                                e.stopPropagation();
                                setLocation(`/task/${date.date}/${task.taskId}`);
                              }}
                              title="View task overview"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                          </div>

                          {expandedTasks.has(taskKey) && (
                            <div className="ml-6 mt-1 space-y-0.5">
                              {task.models.map((model) => (
                                <div
                                  key={model.modelName}
                                  className={`flex items-center px-2 py-1 hover:bg-muted rounded cursor-pointer transition-colors ${
                                    isS3Selected(date.date, task.taskId, model.modelName) 
                                      ? 'bg-primary/20 border border-primary/30' 
                                      : ''
                                  }`}
                                  onClick={() => onSelectTaskRun({
                                    type: 's3',
                                    date: date.date,
                                    taskId: task.taskId,
                                    modelName: model.modelName
                                  })}
                                  data-testid={`model-${model.modelName}`}
                                >
                                  <Bot className="mr-2 text-primary h-4 w-4" />
                                  <span className="text-sm text-foreground truncate">
                                    {model.modelName}
                                  </span>
                                  <div className="ml-auto flex items-center gap-1">
                                    {model.duration && (
                                      <span className="text-xs text-muted-foreground">
                                        {Math.round(model.duration)}s
                                      </span>
                                    )}
                                    {model.accuracy !== undefined && (
                                      <div className="flex items-center gap-1">
                                        {getPassFailStatus(model.accuracy) ? (
                                          <CheckCircle className="h-3 w-3 text-success" />
                                        ) : (
                                          <XCircle className="h-3 w-3 text-destructive" />
                                        )}
                                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                                          getPassFailStatus(model.accuracy) 
                                            ? 'text-success bg-success/20' 
                                            : 'text-destructive bg-destructive/20'
                                        }`}>
                                          {getPassFailStatus(model.accuracy) ? 'PASS' : 'FAIL'}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="github" className="flex-1 flex flex-col m-0">
          <div className="flex-1 overflow-y-auto scrollbar-thin p-2">
            {githubLoading && (
              <div className="flex items-center justify-center py-8">
                <div className="text-muted-foreground">Loading GitHub workflows...</div>
              </div>
            )}
            {githubError && (
              <div className="flex items-center justify-center py-8 px-4">
                <div className="text-destructive text-center">
                  <div>Failed to load GitHub workflows</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {githubError.message.includes('GitHub not connected') 
                      ? 'Connect to GitHub in integrations'
                      : 'Check GitHub connection'}
                  </div>
                </div>
              </div>
            )}
            {githubHierarchy && !githubLoading && !githubError && (
              <div className="space-y-1">
                {githubHierarchy.workflow_runs.map((workflowRun) => (
                  <div key={workflowRun.run.id} className="mb-1">
                    <div
                      className={`flex items-center px-2 py-2 hover:bg-muted rounded cursor-pointer transition-colors ${
                        isGitHubSelected(workflowRun.run.id) 
                          ? 'bg-primary/20 border border-primary/30' 
                          : ''
                      }`}
                      onClick={() => onSelectTaskRun({
                        type: 'github',
                        runId: workflowRun.run.id,
                        runNumber: workflowRun.run.run_number,
                        workflowName: workflowRun.run.workflow_name
                      })}
                      data-testid={`workflow-run-${workflowRun.run.id}`}
                    >
                      <div className="flex items-center flex-1 min-w-0">
                        <GitBranch className="mr-2 text-primary h-4 w-4 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground truncate">
                              Run #{workflowRun.run.run_number}
                            </span>
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              getWorkflowStatusColor(workflowRun.run.status, workflowRun.run.conclusion)
                            }`}>
                              {workflowRun.run.conclusion || workflowRun.run.status}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground truncate mt-0.5">
                            {new Date(workflowRun.run.created_at).toLocaleDateString()} • {workflowRun.run.head_branch || 'main'}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 ml-2">
                          {getWorkflowStatusIcon(workflowRun.run.status, workflowRun.run.conclusion)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Sidebar Footer */}
      <div className="p-4 border-t border-border">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>S3 Connection</span>
            <div className="flex items-center gap-1">
              <div className={`w-2 h-2 rounded-full ${
                s3Error ? 'bg-destructive' : s3Loading ? 'bg-warning' : 'bg-success'
              }`}></div>
              <span>{s3Error ? 'Error' : s3Loading ? 'Loading' : 'Online'}</span>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>GitHub Connection</span>
            <div className="flex items-center gap-1">
              <div className={`w-2 h-2 rounded-full ${
                githubError ? 'bg-destructive' : githubLoading ? 'bg-warning' : 'bg-success'
              }`}></div>
              <span>{githubError ? 'Error' : githubLoading ? 'Loading' : 'Connected'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
