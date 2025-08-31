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
  raw_content?: string; // For unparseable content
  [key: string]: any; // Allow any other fields
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
              // The content might be escaped JSON, try to parse it
              let thinking;
              if (typeof content === 'string') {
                thinking = JSON.parse(content);
              } else {
                thinking = content;
              }
              
              agentThoughts.push({
                timestamp: timestamp - startTime,
                ...thinking
              });
            } catch (error) {
              console.log('Could not parse agent thinking:', content, error);
              // Store raw content if parsing fails
              agentThoughts.push({
                timestamp: timestamp - startTime,
                raw_content: content
              });
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

  // Extract thinking events for timeline markers
  const thinkingEvents = useMemo(() => {
    return events.filter(event => event.type === 'm');
  }, [events]);

  // Terminal content with ANSI escape sequence handling
  const terminalContent = useMemo(() => {
    const outputEvents = visibleEvents.filter(event => event.type === 'o');
    let content = outputEvents.map(event => event.content).join('');
    
    // Comprehensive cleanup of ANSI escape sequences for better display
    content = content
      // Remove all CSI (Control Sequence Introducer) sequences
      .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '') // Most common ANSI sequences
      .replace(/\x1b\[\?[0-9;]*[a-zA-Z]/g, '') // Mode setting sequences like [?2004l
      .replace(/\x1b\][0-9;]*.*?\x07/g, '') // OSC sequences (Operating System Command)
      .replace(/\x1b\][0-9;]*.*?\x1b\\/g, '') // OSC sequences with ST terminator
      .replace(/\x1b[PX^_][^\x1b]*\x1b\\/g, '') // DCS, SOS, PM, APC sequences
      .replace(/\x1b[NO]/g, '') // SS2, SS3 sequences
      .replace(/\x1b[cDE]/g, '') // Various single-character escapes
      .replace(/\x1b>/g, '') // Reset mode
      .replace(/\x1b=/g, '') // Application keypad mode
      .replace(/\x1b\([AB0]/g, '') // Character set selection
      .replace(/\x1b\)[AB0]/g, '') // Character set selection
      // Handle control characters
      .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '') // Remove other control chars except \t, \n
      .replace(/\r\n/g, '\n') // Normalize line endings
      .replace(/\r/g, '\n') // Convert remaining carriage returns
      // Clean up excessive newlines and whitespace
      .replace(/\n{3,}/g, '\n\n') // Limit consecutive newlines
      .replace(/[ \t]+\n/g, '\n') // Remove trailing spaces on lines
      .replace(/\n[ \t]+/g, '\n') // Remove leading spaces after newlines
      .replace(/[ \t]{2,}/g, ' ') // Replace multiple spaces with single space
      .trim(); // Remove leading/trailing whitespace
    
    return content;
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
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[600px]">
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
            
            {/* Progress bar with Action Markers */}
            <div className="space-y-1">
              <div className="relative w-full bg-muted rounded-full h-2">
                <div 
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${maxTime > 0 ? (currentTime / maxTime) * 100 : 0}%` }}
                />
                
                {/* Action Markers */}
                {thinkingEvents.map((event, index) => {
                  const position = maxTime > 0 ? (event.timestamp / maxTime) * 100 : 0;
                  return (
                    <button
                      key={index}
                      onClick={() => setCurrentTime(event.timestamp)}
                      className="absolute top-0 w-3 h-3 -mt-0.5 bg-yellow-500 rounded-full border-2 border-background hover:bg-yellow-400 transition-colors shadow-sm z-10"
                      style={{ left: `${position}%`, transform: 'translateX(-50%)' }}
                      title={`Jump to action ${index + 1}`}
                    >
                      <span className="sr-only">Jump to action {index + 1}</span>
                    </button>
                  );
                })}
                
                {/* Clickable overlay for scrubbing */}
                <input
                  type="range"
                  min="0"
                  max={maxTime}
                  value={currentTime}
                  onChange={(e) => setCurrentTime(parseFloat(e.target.value))}
                  className="absolute inset-0 w-full h-2 opacity-0 cursor-pointer"
                />
              </div>
              
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(maxTime)}</span>
              </div>
              
              {/* Action Counter */}
              {thinkingEvents.length > 0 && (
                <div className="text-xs text-muted-foreground text-center">
                  Action {Math.max(1, thinkingEvents.findIndex(e => e.timestamp <= currentTime) + 1)} of {thinkingEvents.length}
                </div>
              )}
            </div>
          </CardHeader>
          
          <CardContent className="p-0">
            <ScrollArea className="h-[500px]">
              <div className="bg-black text-green-400 font-mono text-sm p-4 min-h-[500px] overflow-auto">
                {terminalContent ? (
                  <pre className="whitespace-pre-wrap break-words font-mono leading-relaxed">
                    {terminalContent}
                  </pre>
                ) : (
                  <div className="text-gray-500">No terminal session yet... Press play to start</div>
                )}
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
            <ScrollArea className="h-[500px]">
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
                        {currentThinking.commands.map((cmd, index) => {
                          // Extract command text from various possible formats
                          let commandText = '';
                          let timeout = null;
                          
                          if (typeof cmd === 'string') {
                            commandText = cmd;
                          } else if (typeof cmd === 'object' && cmd !== null) {
                            // Try different possible properties for the command
                            const cmdObj = cmd as any;
                            commandText = cmdObj.command || cmdObj.cmd || cmdObj.text || cmdObj.action || '';
                            timeout = cmdObj.timeout || cmdObj.timeout_sec || cmdObj.max_timeout_sec;
                            
                            // If no recognizable command property, show the first string value or object keys
                            if (!commandText) {
                              const stringValues = Object.values(cmd).filter(v => typeof v === 'string');
                              if (stringValues.length > 0) {
                                commandText = stringValues[0];
                              } else {
                                commandText = `Unknown command format: ${Object.keys(cmd).join(', ')}`;
                              }
                            }
                          }
                          
                          return (
                            <div key={index} className="bg-muted rounded p-2">
                              <code className="text-xs font-mono text-foreground">
                                {commandText || 'Empty command'}
                              </code>
                              {timeout && (
                                <div className="flex items-center gap-1 mt-1">
                                  <Clock className="h-3 w-3 text-muted-foreground" />
                                  <span className="text-xs text-muted-foreground">
                                    {timeout}s timeout
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Show any other fields */}
                  {Object.entries(currentThinking).map(([key, value]) => {
                    if (['timestamp', 'state_analysis', 'explanation', 'commands', 'is_task_complete', 'raw_content'].includes(key)) {
                      return null;
                    }
                    return (
                      <div key={key}>
                        <h4 className="font-medium text-sm mb-2 capitalize">{key.replace(/_/g, ' ')}</h4>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
                        </p>
                      </div>
                    );
                  })}

                  {/* Raw content fallback */}
                  {currentThinking.raw_content && (
                    <div>
                      <h4 className="font-medium text-sm mb-2 text-muted-foreground">Raw Marker Data</h4>
                      <pre className="text-xs bg-muted rounded p-2 overflow-x-auto">
                        {currentThinking.raw_content}
                      </pre>
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