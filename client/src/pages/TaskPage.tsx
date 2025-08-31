import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Bot, Calendar, Target, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { S3Hierarchy, TaskYaml } from "@shared/schema";


export default function TaskPage() {
  const params = useParams<{ date: string; taskId: string }>();
  const [, setLocation] = useLocation();
  
  const date = params.date || '';
  const taskId = params.taskId || '';

  // Get hierarchy data to find the task and its models
  const { data: hierarchy } = useQuery<S3Hierarchy>({
    queryKey: ["/api/hierarchy"],
  });

  // Get task YAML for metadata
  const { data: taskData } = useQuery<TaskYaml>({
    queryKey: ["/api/task-yaml", date, taskId],
    enabled: !!date && !!taskId,
  });

  const taskInfo = hierarchy?.dates
    .find(d => d.date === date)
    ?.tasks.find(t => t.taskId === taskId);

  const models = taskInfo?.models || [];

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy': return 'text-emerald-600 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-900/30';
      case 'medium': return 'text-amber-600 bg-amber-100 dark:text-amber-400 dark:bg-amber-900/30';
      case 'hard': return 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30';
      default: return 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-800';
    }
  };

  const getAccuracyColor = (accuracy: number) => {
    if (accuracy >= 0.8) return 'text-emerald-600 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-900/30';
    if (accuracy >= 0.5) return 'text-amber-600 bg-amber-100 dark:text-amber-400 dark:bg-amber-900/30';
    return 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30';
  };

  const handleModelSelect = (modelName: string) => {
    const params = new URLSearchParams();
    params.set('date', date);
    params.set('task', taskId);
    params.set('model', modelName);
    setLocation(`/?${params.toString()}`);
  };

  if (!taskInfo) {
    return (
      <div className="min-h-screen bg-background text-foreground p-8">
        <div className="max-w-4xl mx-auto">
          <Button 
            variant="ghost" 
            onClick={() => setLocation('/')}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Overview
          </Button>
          <div className="text-center text-muted-foreground">
            Task not found: {taskId} on {date}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            onClick={() => setLocation('/')}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Overview
          </Button>
          
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            <span className="text-lg font-medium">{date}</span>
            <span className="text-muted-foreground">/</span>
            <Target className="h-5 w-5 text-muted-foreground" />
            <span className="text-lg font-medium">{taskId}</span>
          </div>
        </div>

        {/* Task Details */}
        {taskData && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Task Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <h4 className="font-medium text-sm mb-1">Difficulty</h4>
                  <Badge className={getDifficultyColor(taskData.difficulty)}>
                    {taskData.difficulty}
                  </Badge>
                </div>
                
                <div>
                  <h4 className="font-medium text-sm mb-1">Category</h4>
                  <span className="text-sm text-muted-foreground">{taskData.category}</span>
                </div>
                
                <div>
                  <h4 className="font-medium text-sm mb-1">Author</h4>
                  <span className="text-sm text-muted-foreground">{taskData.author_name}</span>
                </div>
                
                <div>
                  <h4 className="font-medium text-sm mb-1">Timeout</h4>
                  <span className="text-sm text-muted-foreground">{taskData.max_agent_timeout_sec}s</span>
                </div>
                
                <div>
                  <h4 className="font-medium text-sm mb-1">Parser</h4>
                  <span className="text-sm text-muted-foreground">{taskData.parser_name}</span>
                </div>
                
                {taskData.tags && taskData.tags.length > 0 && (
                  <div>
                    <h4 className="font-medium text-sm mb-1">Tags</h4>
                    <div className="flex flex-wrap gap-1">
                      {taskData.tags.map((tag, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              
              {taskData.instruction && (
                <div>
                  <h4 className="font-medium text-sm mb-2">Instruction</h4>
                  <div className="bg-muted rounded-md p-4">
                    <pre className="text-sm whitespace-pre-wrap text-foreground">
                      {taskData.instruction}
                    </pre>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Models Comparison */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              Model Performance Comparison
              <Badge variant="outline" className="ml-auto">
                {models.length} models
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {models.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                No models found for this task
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {models.map((model) => (
                  <Card 
                    key={model.modelName}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => handleModelSelect(model.modelName)}
                  >
                    <CardContent className="p-4">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="font-medium text-sm">{model.modelName}</h3>
                          {!model.hasData && (
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                          )}
                        </div>
                        
                        {model.accuracy !== undefined ? (
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-muted-foreground">Accuracy</span>
                              <Badge className={getAccuracyColor(model.accuracy)}>
                                {Math.round(model.accuracy * 100)}%
                              </Badge>
                            </div>
                            <div className="w-full bg-muted rounded-full h-2">
                              <div 
                                className="bg-primary h-2 rounded-full transition-all"
                                style={{ width: `${model.accuracy * 100}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground">
                            No accuracy data
                          </div>
                        )}
                        
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            {model.hasData ? 'Data Available' : 'Incomplete'}
                          </span>
                          <Button size="sm" variant="outline">
                            View Details
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}