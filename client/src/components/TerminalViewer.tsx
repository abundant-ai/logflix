import { useState, useEffect, useMemo } from "react";
import { Play, Pause, RotateCcw, Brain, Terminal, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface CastEvent {
  timestamp: number;
  type: "i" | "o" | "m";
  content: string;
}

interface AgentThinking {
  timestamp: number;
  state_analysis?: string;
  explanation?: string;
  commands?: Array<{ command: string; timeout?: number }>;
  is_task_complete?: boolean;
}

interface TerminalViewerProps {
  castContent: string;
}

export default function TerminalViewer({ castContent }: TerminalViewerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  // Parse cast data
  const { events, agentThoughts, startTime } = useMemo(() => {
    const events: CastEvent[] = [];
    const agentThoughts: AgentThinking[] = [];
    let startTime = 0;
    
    if (!castContent) return { events, agentThoughts, startTime };

    const lines = castContent.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        
        // Skip header line
        if (parsed.version !== undefined) {
          continue;
        }
        
        // Parse event lines
        if (Array.isArray(parsed) && parsed.length >= 3) {
          const [timestamp, type, content] = parsed;
          
          if (startTime === 0) startTime = timestamp;
          
          events.push({
            timestamp: timestamp - startTime,
            type,
            content
          });
          
          // Parse agent thinking from 'm' events
          if (type === 'm') {
            try {
              const thinking = JSON.parse(content);
              agentThoughts.push({
                timestamp: timestamp - startTime,
                ...thinking
              });
            } catch (error) {
              console.log('Could not parse agent thinking:', content);
            }
          }
        }
      } catch (error) {
        // Skip malformed lines
      }
    }
    
    return { events, agentThoughts, startTime };
  }, [castContent]);

  // Get events up to current time
  const visibleEvents = useMemo(() => {
    return events.filter(event => event.timestamp <= currentTime);
  }, [events, currentTime]);

  // Get current agent thinking
  const currentThinking = useMemo(() => {
    const relevantThoughts = agentThoughts.filter(thought => thought.timestamp <= currentTime);
    return relevantThoughts[relevantThoughts.length - 1];
  }, [agentThoughts, currentTime]);

  // Terminal output content
  const terminalContent = useMemo(() => {
    const outputEvents = visibleEvents.filter(event => event.type === 'o');
    return outputEvents.map(event => event.content).join('');
  }, [visibleEvents]);

  const maxTime = Math.max(...events.map(e => e.timestamp), 0);

  // Playback control
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      setCurrentTime(prev => {
        const next = prev + (100 * playbackSpeed);
        if (next >= maxTime) {
          setIsPlaying(false);
          return maxTime;
        }
        return next;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isPlaying, playbackSpeed, maxTime]);

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-96">
      {/* Terminal Display */}
      <div className="lg:col-span-2">
        <Card className="h-full">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Terminal className="h-4 w-4" />
                Agent Terminal Session
              </CardTitle>
              
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentTime(0)}
                  data-testid="button-reset"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsPlaying(!isPlaying)}
                  data-testid="button-play-pause"
                >
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>

                <select 
                  value={playbackSpeed} 
                  onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                  className="text-xs bg-muted rounded px-2 py-1"
                >
                  <option value={0.5}>0.5x</option>
                  <option value={1}>1x</option>
                  <option value={2}>2x</option>
                  <option value={4}>4x</option>
                </select>
              </div>
            </div>
            
            {/* Progress bar */}
            <div className="space-y-1">
              <div className="w-full bg-muted rounded-full h-2">
                <div 
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${maxTime > 0 ? (currentTime / maxTime) * 100 : 0}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(maxTime)}</span>
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="p-0">
            <ScrollArea className="h-80">
              <div className="bg-black text-green-400 font-mono text-sm p-4 min-h-80">
                <pre className="whitespace-pre-wrap overflow-hidden">
                  {terminalContent || 'No terminal output yet...'}
                </pre>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Agent Thinking Panel */}
      <div className="lg:col-span-1">
        <Card className="h-full">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-4 w-4" />
              Agent Thinking
            </CardTitle>
          </CardHeader>
          
          <CardContent className="space-y-4">
            <ScrollArea className="h-80">
              {currentThinking ? (
                <div className="space-y-4">
                  {/* Task Completion Status */}
                  {currentThinking.is_task_complete !== undefined && (
                    <div>
                      <Badge 
                        variant={currentThinking.is_task_complete ? "default" : "secondary"}
                        className="mb-2"
                      >
                        {currentThinking.is_task_complete ? "Task Complete" : "In Progress"}
                      </Badge>
                    </div>
                  )}

                  {/* State Analysis */}
                  {currentThinking.state_analysis && (
                    <div>
                      <h4 className="font-medium text-sm mb-2 text-accent">State Analysis</h4>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {currentThinking.state_analysis}
                      </p>
                    </div>
                  )}

                  {/* Explanation */}
                  {currentThinking.explanation && (
                    <div>
                      <h4 className="font-medium text-sm mb-2 text-primary">Next Actions</h4>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {currentThinking.explanation}
                      </p>
                    </div>
                  )}

                  {/* Commands */}
                  {currentThinking.commands && currentThinking.commands.length > 0 && (
                    <div>
                      <h4 className="font-medium text-sm mb-2 text-warning">Planned Commands</h4>
                      <div className="space-y-2">
                        {currentThinking.commands.map((cmd, index) => (
                          <div key={index} className="bg-muted rounded p-2">
                            <code className="text-xs font-mono text-foreground">
                              {cmd.command}
                            </code>
                            {cmd.timeout && (
                              <div className="flex items-center gap-1 mt-1">
                                <Clock className="h-3 w-3 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">
                                  {cmd.timeout}s timeout
                                </span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Timestamp */}
                  <div className="pt-2 border-t border-border">
                    <span className="text-xs text-muted-foreground">
                      Thinking at {formatTime(currentThinking.timestamp)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-center text-muted-foreground">
                  <Brain className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No agent thinking data yet</p>
                  <p className="text-xs">Play the session to see the agent's reasoning</p>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}