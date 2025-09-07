import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Search, Filter, Calendar, Terminal, Bot, ChevronDown, ChevronRight, ExternalLink, CheckCircle, XCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { S3Hierarchy } from "@shared/schema";

interface NavigationSidebarProps {
  onSelectTaskRun: (taskRun: { date: string; taskId: string; modelName: string }) => void;
  selectedTaskRun: { date: string; taskId: string; modelName: string } | null;
}

export default function NavigationSidebar({ onSelectTaskRun, selectedTaskRun }: NavigationSidebarProps) {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("all");
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

  const { data: hierarchy, isLoading, error } = useQuery<S3Hierarchy>({
    queryKey: ["/api/hierarchy"],
  });

  // Auto-expand when selectedTaskRun changes
  useEffect(() => {
    if (selectedTaskRun) {
      const { date, taskId } = selectedTaskRun;
      setExpandedDates(prev => new Set(Array.from(prev).concat([date])));
      setExpandedTasks(prev => new Set(Array.from(prev).concat([`${date}-${taskId}`])));
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

  const isSelected = (date: string, taskId: string, modelName: string) => {
    return selectedTaskRun?.date === date && 
           selectedTaskRun?.taskId === taskId && 
           selectedTaskRun?.modelName === modelName;
  };

  if (isLoading) {
    return (
      <div className="w-80 bg-card border-r border-border flex items-center justify-center">
        <div className="text-muted-foreground">Loading S3 data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-80 bg-card border-r border-border flex items-center justify-center p-4">
        <div className="text-destructive text-center">
          <div>Failed to load S3 data</div>
          <div className="text-sm text-muted-foreground mt-1">Check AWS credentials</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-80 bg-card border-r border-border flex flex-col" data-testid="navigation-sidebar">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <h1 className="text-lg font-semibold text-foreground">Terminal-Bench Viewer</h1>
        <p className="text-sm text-muted-foreground mt-1">s3://t-bench-mam/tb-2.0-audit/2025-09-07</p>
      </div>

      {/* Search and Filters */}
      <div className="p-4 border-b border-border space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Search tasks, models..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-search"
          />
        </div>

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
      </div>

      {/* S3 Hierarchy Tree */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-2">
        {hierarchy?.dates.filter(date => date.date === '2025-09-07').map((date) => (
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
                                isSelected(date.date, task.taskId, model.modelName) 
                                  ? 'bg-primary/20 border border-primary/30' 
                                  : ''
                              }`}
                              onClick={() => onSelectTaskRun({
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

      {/* Sidebar Footer */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Connected to S3</span>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-success rounded-full"></div>
            <span>Online</span>
          </div>
        </div>
      </div>
    </div>
  );
}
