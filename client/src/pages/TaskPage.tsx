import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { ChevronRight, Calendar, Terminal, Bot, BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { S3Hierarchy } from "@shared/schema";

export default function TaskPage() {
  const [location] = useLocation();
  
  // Debug logging
  console.log('TaskPage location:', location);
  
  const urlParams = new URLSearchParams(location.split('?')[1] || '');
  const date = urlParams.get('date');
  const taskId = urlParams.get('taskId');
  
  console.log('TaskPage params:', { date, taskId });

  // Simplified test version
  if (!date || !taskId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-foreground mb-2">Invalid Parameters</h2>
          <p className="text-muted-foreground">Missing date or taskId parameters</p>
          <p>Date: {date || 'null'}</p>
          <p>TaskId: {taskId || 'null'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header with Breadcrumbs */}
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <nav className="flex items-center space-x-2 text-sm" data-testid="breadcrumbs">
            <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
              {date}
            </Link>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <span className="text-foreground font-medium">{taskId}</span>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <div className="p-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <Terminal className="h-6 w-6 text-accent" />
              <h1 className="text-2xl font-bold text-foreground">{taskId}</h1>
            </div>
            <p className="text-muted-foreground">
              Available models for task on {date} ({taskEntry.models.length} models)
            </p>
          </div>

          {/* Models Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {taskEntry.models.map((model) => (
              <Link
                key={model.modelName}
                href={`/task-run?date=${encodeURIComponent(date)}&taskId=${encodeURIComponent(taskId)}&model=${encodeURIComponent(model.modelName)}`}
                className="block"
                data-testid={`model-card-${model.modelName}`}
              >
                <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Bot className="h-5 w-5 text-primary" />
                      <span className="truncate">{model.modelName}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-3">
                      {/* Accuracy */}
                      {model.accuracy !== undefined && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Accuracy</span>
                          <Badge className={getAccuracyColor(model.accuracy)}>
                            {Math.round(model.accuracy * 100)}%
                          </Badge>
                        </div>
                      )}

                      {/* Data Status */}
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Data</span>
                        <Badge variant={model.hasData ? "default" : "secondary"}>
                          {model.hasData ? "Available" : "Missing"}
                        </Badge>
                      </div>

                      {/* Performance Indicator */}
                      {model.accuracy !== undefined && (
                        <div className="flex items-center gap-2">
                          <BarChart3 className="h-4 w-4 text-muted-foreground" />
                          <div className="flex-1 bg-muted rounded-full h-2">
                            <div 
                              className={`h-2 rounded-full transition-all ${
                                model.accuracy >= 0.8 ? 'bg-success' :
                                model.accuracy >= 0.5 ? 'bg-warning' : 'bg-destructive'
                              }`}
                              style={{ width: `${model.accuracy * 100}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          {/* Empty State */}
          {taskEntry.models.length === 0 && (
            <div className="text-center py-12">
              <Bot className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No Models Found</h3>
              <p className="text-muted-foreground">No model data available for this task</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}