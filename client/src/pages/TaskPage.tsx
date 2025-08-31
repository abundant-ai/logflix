import { useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import NavigationSidebar from "@/components/NavigationSidebar";
import TerminalViewer from "@/components/TerminalViewer";

interface TaskRun {
  date: string;
  taskId: string;
  modelName: string;
  castContent?: string;
  taskConfig?: any;
  results?: any;
}

interface TaskHierarchy {
  dates: Array<{
    date: string;
    tasks: Array<{
      taskId: string;
      models: Array<{
        modelName: string;
        hasData: boolean;
      }>;
    }>;
  }>;
}

export default function TaskPage() {
  const { date, taskId } = useParams<{ date: string; taskId: string }>();
  const [selectedModel, setSelectedModel] = useState<string>("");

  // Get hierarchy to find available models for this task
  const { data: hierarchy } = useQuery<TaskHierarchy>({
    queryKey: ['/api/hierarchy'],
  });

  // Get available models for this task
  const availableModels = hierarchy?.dates
    ?.find(d => d.date === date)
    ?.tasks?.find(t => t.taskId === taskId)
    ?.models || [];

  // Set default selected model if not set
  if (!selectedModel && availableModels.length > 0) {
    setSelectedModel(availableModels[0].modelName);
  }

  // Get data for the selected model
  const { data: taskRun, isLoading } = useQuery<TaskRun>({
    queryKey: ['/api/task-run', date, taskId, selectedModel],
    enabled: !!selectedModel,
  });

  if (!date || !taskId) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">Invalid task URL</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background text-foreground">
      <NavigationSidebar />
      
      {/* Main Content */}
      <div className="flex-1 p-6 space-y-6 overflow-y-auto">
        {/* Task Header */}
        <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                {taskId}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {date} • {availableModels.length} model{availableModels.length !== 1 ? 's' : ''} tested
              </p>
            </div>
            
            {taskRun?.results && (
              <div className="flex items-center gap-2">
                {taskRun.results.task_completed ? (
                  <Badge variant="default" className="flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" />
                    Completed
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <XCircle className="h-3 w-3" />
                    Incomplete
                  </Badge>
                )}
                
                {taskRun.results.accuracy !== undefined && (
                  <Badge variant="outline">
                    {Math.round(taskRun.results.accuracy * 100)}% accuracy
                  </Badge>
                )}
                
                {taskRun.results.duration && (
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {Math.round(taskRun.results.duration / 1000)}s
                  </Badge>
                )}
              </div>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Model Tabs */}
      <Card>
        <CardHeader>
          <CardTitle>Model Comparisons</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={selectedModel} onValueChange={setSelectedModel}>
            <TabsList className="grid w-full grid-cols-1 lg:grid-cols-3 xl:grid-cols-4 gap-2">
              {availableModels.map((model) => (
                <TabsTrigger
                  key={model.modelName}
                  value={model.modelName}
                  className="text-xs lg:text-sm"
                  data-testid={`tab-${model.modelName}`}
                >
                  {model.modelName}
                  {!model.hasData && (
                    <AlertTriangle className="h-3 w-3 ml-1 text-yellow-500" />
                  )}
                </TabsTrigger>
              ))}
            </TabsList>

            {availableModels.map((model) => (
              <TabsContent key={model.modelName} value={model.modelName} className="mt-6">
                {selectedModel === model.modelName && (
                  <>
                    {isLoading ? (
                      <div className="flex items-center justify-center h-64">
                        <div className="text-muted-foreground">Loading terminal session...</div>
                      </div>
                    ) : taskRun?.castContent ? (
                      <TerminalViewer castContent={taskRun.castContent} />
                    ) : (
                      <Card>
                        <CardContent className="pt-6">
                          <div className="text-center text-muted-foreground">
                            <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
                            <p>No terminal session data available for {model.modelName}</p>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      {/* Task Configuration */}
      {taskRun?.taskConfig && (
        <Card>
          <CardHeader>
            <CardTitle>Task Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted p-4 rounded overflow-x-auto">
              {typeof taskRun.taskConfig === 'string' 
                ? taskRun.taskConfig 
                : JSON.stringify(taskRun.taskConfig, null, 2)
              }
            </pre>
          </CardContent>
        </Card>
      )}
      </div>
    </div>
  );
}