import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Download, Play, BarChart3, Terminal, FileCode, Search, Bug, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import TerminalViewer from "@/components/TerminalViewer";
import { TaskRun } from "@shared/schema";

interface MainContentProps {
  selectedTaskRun: { date: string; taskId: string; modelName: string } | null;
}

export default function MainContent({ selectedTaskRun }: MainContentProps) {
  const [activeTab, setActiveTab] = useState("overview");

  const { data: taskRun, isLoading, error } = useQuery<TaskRun>({
    queryKey: selectedTaskRun 
      ? ["/api/task-run", selectedTaskRun.date, selectedTaskRun.taskId, selectedTaskRun.modelName]
      : [],
    enabled: !!selectedTaskRun,
  });

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy': return 'bg-success/20 text-success';
      case 'medium': return 'bg-warning/20 text-warning';
      case 'hard': return 'bg-destructive/20 text-destructive';
      default: return 'bg-muted/20 text-muted-foreground';
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'N/A';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  };

  const isTaskIncomplete = () => {
    if (!taskRun?.resultsJson) return false;
    
    // Check if task_completed is explicitly false
    if (taskRun.resultsJson.task_completed === false) return true;
    
    // Check if accuracy is very low (might indicate incomplete task)
    if (taskRun.resultsJson.accuracy !== undefined && taskRun.resultsJson.accuracy < 0.1) return true;
    
    // Check if there's no end_time (task might have been interrupted)
    if (!taskRun.resultsJson.end_time) return true;
    
    return false;
  };

  const downloadFile = async (filename: string) => {
    if (!selectedTaskRun) return;
    
    const path = `tb-2.0-audit/${selectedTaskRun.date}/${selectedTaskRun.taskId}/${selectedTaskRun.modelName}/${filename}`;
    const url = `/api/download?path=${encodeURIComponent(path)}`;
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!selectedTaskRun) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center">
          <Terminal className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-foreground mb-2">Select a Task Run</h2>
          <p className="text-muted-foreground">Choose a task and model from the sidebar to view data</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading task data...</p>
        </div>
      </div>
    );
  }

  if (error || !taskRun) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="text-destructive mb-4">
            <Bug className="h-12 w-12 mx-auto mb-2" />
            <h2 className="text-lg font-semibold">Failed to Load Data</h2>
          </div>
          <p className="text-muted-foreground">Could not fetch task run data from S3</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Header with Breadcrumbs */}
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <nav className="flex items-center space-x-2 text-sm" data-testid="breadcrumbs">
            <span className="text-muted-foreground">{selectedTaskRun.date}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">{selectedTaskRun.taskId}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <span className="text-foreground font-medium">{selectedTaskRun.modelName}</span>
          </nav>

          <div className="flex items-center gap-3">
            <Button variant="secondary" size="sm" data-testid="button-export">
              <Download className="h-4 w-4 mr-2" />
              Export Data
            </Button>
            <Button size="sm" data-testid="button-analyze">
              <Play className="h-4 w-4 mr-2" />
              Run Analysis
            </Button>
          </div>
        </div>
      </header>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">
          <div className="bg-card border-b border-border px-6">
            <TabsList className="grid grid-cols-5 w-full max-w-lg bg-transparent h-auto p-0">
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
                value="analysis" 
                className="flex items-center gap-2 px-1 py-4 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
                data-testid="tab-analysis"
              >
                <Search className="h-4 w-4" />
                Analysis
              </TabsTrigger>
              <TabsTrigger 
                value="debug" 
                className="flex items-center gap-2 px-1 py-4 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
                data-testid="tab-debug"
              >
                <Bug className="h-4 w-4" />
                Debug
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="p-6 space-y-6 m-0">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Accuracy</p>
                      <p className="text-2xl font-bold text-success">
                        {taskRun.resultsJson?.accuracy ? `${Math.round(taskRun.resultsJson.accuracy * 100)}%` : 'N/A'}
                      </p>
                    </div>
                    <div className="p-2 bg-success/20 rounded-lg">
                      <BarChart3 className="h-5 w-5 text-success" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-muted-foreground">Duration</p>
                        {isTaskIncomplete() && (
                          <div className="flex items-center gap-1 text-warning">
                            <AlertTriangle className="h-3 w-3" />
                            <span className="text-xs">Incomplete</span>
                          </div>
                        )}
                      </div>
                      <p className={`text-2xl font-bold ${isTaskIncomplete() ? 'text-warning' : 'text-foreground'}`}>
                        {formatDuration(taskRun.resultsJson?.duration_seconds)}
                      </p>
                    </div>
                    <div className={`p-2 rounded-lg ${isTaskIncomplete() ? 'bg-warning/20' : 'bg-primary/20'}`}>
                      <Terminal className={`h-5 w-5 ${isTaskIncomplete() ? 'text-warning' : 'text-primary'}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Difficulty</p>
                      <p className="text-2xl font-bold">
                        {taskRun.taskYaml?.difficulty || 'N/A'}
                      </p>
                    </div>
                    <div className="p-2 bg-accent/20 rounded-lg">
                      <Search className="h-5 w-5 text-accent" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Commands</p>
                      <p className="text-2xl font-bold text-foreground">
                        {taskRun.resultsJson?.command_count || 'N/A'}
                      </p>
                    </div>
                    <div className="p-2 bg-warning/20 rounded-lg">
                      <Terminal className="h-5 w-5 text-warning" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Task Information */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Task Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <label className="text-sm text-muted-foreground">Task ID</label>
                    <p className="font-mono text-sm bg-muted px-2 py-1 rounded mt-1">
                      {selectedTaskRun.taskId}
                    </p>
                  </div>
                  {taskRun.taskYaml?.category && (
                    <div>
                      <label className="text-sm text-muted-foreground">Category</label>
                      <p className="text-sm mt-1">{taskRun.taskYaml.category}</p>
                    </div>
                  )}
                  {taskRun.taskYaml?.tags && (
                    <div>
                      <label className="text-sm text-muted-foreground">Tags</label>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {taskRun.taskYaml.tags.map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {taskRun.taskYaml?.author_name && (
                    <div>
                      <label className="text-sm text-muted-foreground">Author</label>
                      <p className="text-sm mt-1">
                        {taskRun.taskYaml.author_name}
                        {taskRun.taskYaml.author_email && ` <${taskRun.taskYaml.author_email}>`}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Run Metadata</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {taskRun.resultsJson?.run_id && (
                    <div>
                      <label className="text-sm text-muted-foreground">Run ID</label>
                      <p className="font-mono text-sm bg-muted px-2 py-1 rounded mt-1">
                        {taskRun.resultsJson.run_id}
                      </p>
                    </div>
                  )}
                  <div>
                    <label className="text-sm text-muted-foreground">Model</label>
                    <p className="text-sm mt-1">{selectedTaskRun.modelName}</p>
                  </div>
                  {taskRun.resultsJson?.start_time && (
                    <div>
                      <label className="text-sm text-muted-foreground">Start Time</label>
                      <p className="text-sm mt-1">
                        {new Date(taskRun.resultsJson.start_time).toLocaleString()}
                      </p>
                    </div>
                  )}
                  {taskRun.resultsJson?.end_time && (
                    <div>
                      <label className="text-sm text-muted-foreground">End Time</label>
                      <p className="text-sm mt-1">
                        {new Date(taskRun.resultsJson.end_time).toLocaleString()}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Task Instruction */}
            {taskRun.taskYaml?.instruction && (
              <Card>
                <CardHeader>
                  <CardTitle>Task Instruction</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-muted rounded-lg p-4">
                    <pre className="text-sm whitespace-pre-wrap text-foreground">
                      {taskRun.taskYaml.instruction}
                    </pre>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="terminal" className="p-6 space-y-6 m-0">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Agent Terminal Session</CardTitle>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="secondary" 
                      size="sm"
                      onClick={() => downloadFile('agent.cast')}
                      data-testid="button-download-cast"
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Download .cast
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {taskRun.agentCast ? (
                  <TerminalViewer castContent={taskRun.agentCast} />
                ) : (
                  <div className="bg-black rounded-lg p-4 text-center">
                    <p className="text-gray-400">No terminal session data available</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="files" className="p-6 space-y-6 m-0">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* task.yaml */}
              {taskRun.taskYaml && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>task.yaml</CardTitle>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => downloadFile('task.yaml')}
                        data-testid="button-download-yaml"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-muted rounded-lg p-4 max-h-96 overflow-y-auto scrollbar-thin">
                      <pre className="text-sm font-mono text-foreground">
                        {JSON.stringify(taskRun.taskYaml, null, 2)}
                      </pre>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* results.json */}
              {taskRun.resultsJson && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>results.json</CardTitle>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => downloadFile('results.json')}
                        data-testid="button-download-results"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-muted rounded-lg p-4 max-h-96 overflow-y-auto scrollbar-thin">
                      <pre className="text-sm font-mono text-foreground">
                        {JSON.stringify(taskRun.resultsJson, null, 2)}
                      </pre>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* File Browser */}
            {taskRun.files && taskRun.files.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>S3 Files</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {taskRun.files.map((file) => (
                      <div 
                        key={file.name}
                        className="flex items-center justify-between p-3 hover:bg-muted rounded-lg transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <FileCode className="h-4 w-4 text-accent" />
                          <span className="text-sm font-medium">{file.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {(file.size / 1024).toFixed(1)} KB
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {new Date(file.lastModified).toLocaleString()}
                          </span>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => downloadFile(file.name)}
                            data-testid={`button-download-${file.name}`}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="analysis" className="p-6 space-y-6 m-0">
            {taskRun.taskCheck && (
              <Card>
                <CardHeader>
                  <CardTitle>Task Quality Assessment (task.check)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-muted rounded-lg p-4">
                    <pre className="text-sm whitespace-pre-wrap text-foreground">
                      {taskRun.taskCheck}
                    </pre>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="debug" className="p-6 space-y-6 m-0">
            {taskRun.taskDebug && (
              <Card>
                <CardHeader>
                  <CardTitle>Debug Analysis (task.debug)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-muted rounded-lg p-4">
                    <pre className="text-sm whitespace-pre-wrap text-foreground">
                      {taskRun.taskDebug}
                    </pre>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
