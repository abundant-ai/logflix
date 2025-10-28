import { useState, useEffect, useMemo, useRef } from "react";
import { Play, Pause, RotateCcw, Brain, Terminal, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cleanAnsiCodes } from "@/lib/ansi";
import AnsiToHtml from "ansi-to-html";

interface CastEvent {
  timestamp: number;
  type: "i" | "o" | "m";
  content: string;
}

interface AgentThinking {
  timestamp: number;
  state_analysis?: string;
  explanation?: string;
  commands?: Array<string | { [key: string]: any }>;
  is_task_complete?: boolean;
  raw_content?: string;
  [key: string]: any;
}

interface CustomTerminalViewerProps {
  castContent: string;
  showAgentThinking?: boolean;
}

export default function CustomTerminalViewer({ castContent, showAgentThinking = true }: CustomTerminalViewerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [wasPlayingBeforeScrub, setWasPlayingBeforeScrub] = useState(false);
  
  const terminalRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

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
            // New format: "Episode N: X commands" (string)
            // Old format: JSON object with thinking data
            if (typeof content === 'string') {
              // Check if it's an episode marker
              const episodeMatch = content.match(/^Episode (\d+): (\d+) commands?$/);
              if (episodeMatch) {
                const [, episodeNum, commandCount] = episodeMatch;
                agentThoughts.push({
                  timestamp: timestamp - startTime,
                  type: 'episode',
                  episodeNumber: parseInt(episodeNum),
                  commandCount: parseInt(commandCount),
                  raw_content: content
                });
              } else {
                // Try to parse as JSON
                try {
                  const thinking = JSON.parse(content);
                  agentThoughts.push({
                    timestamp: timestamp - startTime,
                    ...thinking
                  });
                } catch {
                  // Plain text metadata
                  agentThoughts.push({
                    timestamp: timestamp - startTime,
                    raw_content: content
                  });
                }
              }
            } else {
              // Object format
              agentThoughts.push({
                timestamp: timestamp - startTime,
                ...content
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

  // Calculate max time first
  const maxTime = Math.max(...events.map(e => e.timestamp), 0);

  // Extract thinking events for timeline markers, with fallback interval markers
  const thinkingEvents = useMemo(() => {
    const agentThinkingEvents = events.filter(event => event.type === 'm');
    
    // If we have agent thinking events, use those
    if (agentThinkingEvents.length > 0) {
      return agentThinkingEvents;
    }
    
    // Otherwise, create fallback markers at regular intervals for navigation
    if (maxTime > 0 && events.length > 0) {
      const intervalMarkers: CastEvent[] = [];
      const markerCount = Math.min(8, Math.max(3, Math.floor(maxTime / 30))); // One marker every ~30 seconds, max 8 markers
      
      for (let i = 1; i < markerCount; i++) {
        const timestamp = (i * maxTime) / markerCount;
        intervalMarkers.push({
          timestamp,
          type: 'o', // Use output type as fallback
          content: `Navigation marker ${i}`
        });
      }
      return intervalMarkers;
    }
    
    return [];
  }, [events, maxTime]);

  // Terminal content with progressive display - preserve ANSI codes and newlines
  const terminalContent = useMemo(() => {
    const outputEvents = visibleEvents.filter(event => event.type === 'o');

    let content = '';
    for (const event of outputEvents) {
      // Keep ANSI codes for color, convert \r\n to \n for proper display
      content += event.content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    }

    // Remove cursor control sequences and bracketed paste mode that ansi-to-html doesn't handle
    content = content
      .replace(/\x1b\[\?2004[hl]/g, '')  // Remove bracketed paste mode
      .replace(/\x1b\[([0-9;]*)[HfABCDKJsuhl]/g, '')  // Remove cursor movement and clear sequences
      .replace(/\x1b\[\?[0-9;]*[hl]/g, '')  // Remove mode changes
      .replace(/\x1b\][0-9];[^\x07]*\x07/g, '')  // Remove OSC sequences
      .replace(/\x1b\[[0-9;]*[mGK]/g, (match) => {
        // Keep only SGR (color) sequences, remove others
        if (match.endsWith('m')) return match;
        return '';
      });

    // Convert ANSI color codes to HTML using ansi-to-html library
    const converter = new AnsiToHtml({
      fg: '#d0d0d0',
      bg: '#282c34',
      newline: true,
      escapeXML: true,
      stream: false,
      colors: {
        0: '#2e3436',   // Black
        1: '#ff6b6b',   // Red
        2: '#5af78e',   // Green
        3: '#f3f99d',   // Yellow
        4: '#57c7ff',   // Blue
        5: '#ff79c6',   // Magenta
        6: '#9aedfe',   // Cyan
        7: '#d0d0d0',   // White
        8: '#808080',   // Bright Black (Gray)
        9: '#ff8787',   // Bright Red
        10: '#90ee90',  // Bright Green
        11: '#ffff87',  // Bright Yellow
        12: '#87ceeb',  // Bright Blue
        13: '#ffb3ff',  // Bright Magenta
        14: '#b0e0e6',  // Bright Cyan
        15: '#ffffff'   // Bright White
      }
    });

    return converter.toHtml(content);
  }, [visibleEvents]);


  // Auto-scroll terminal during playback
  useEffect(() => {
    if (isPlaying && !isScrubbing && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalContent, isPlaying, isScrubbing]);

  // Playback control with real timestamps
  useEffect(() => {
    if (!isPlaying || events.length === 0 || isScrubbing) return;

    const nextEvent = events.find(event => event.timestamp > currentTime);
    
    if (!nextEvent) {
      setIsPlaying(false);
      setCurrentTime(maxTime);
      return;
    }

    const delayMs = Math.max(10, ((nextEvent.timestamp - currentTime) * 1000) / playbackSpeed);
    
    const timeout = setTimeout(() => {
      setCurrentTime(nextEvent.timestamp);
    }, delayMs);

    return () => clearTimeout(timeout);
  }, [isPlaying, currentTime, events, playbackSpeed, maxTime, isScrubbing]);

  // Handle scrubbing start/end
  const handleScrubStart = () => {
    setWasPlayingBeforeScrub(isPlaying);
    setIsScrubbing(true);
    setIsPlaying(false);
  };

  const handleScrubEnd = () => {
    setIsScrubbing(false);
    if (wasPlayingBeforeScrub) {
      setIsPlaying(true);
    }
  };

  const formatTime = (seconds: number) => {
    const totalSeconds = Math.floor(seconds);
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`grid ${showAgentThinking ? 'grid-cols-1 lg:grid-cols-3' : 'grid-cols-1'} gap-4 h-[800px]`}>
      {/* Terminal Display */}
      <div className={showAgentThinking ? "lg:col-span-2" : "col-span-1"}>
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
            
            {/* Streamlined Progress Bar - Fully Opaque */}
            <div className="space-y-2">
              <div
                className="relative w-full bg-gray-300 dark:bg-gray-600 rounded-full h-2 cursor-pointer group hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
                onClick={(e) => {
                  // Handle direct clicks on the progress bar
                  const rect = e.currentTarget.getBoundingClientRect();
                  const percent = (e.clientX - rect.left) / rect.width;
                  const targetTime = Math.max(0, Math.min(maxTime, percent * maxTime));
                  setCurrentTime(targetTime);
                }}
              >
                {/* Progress fill - sleeker with gradient */}
                <div
                  className="bg-gradient-to-r from-blue-500 to-blue-400 h-2 rounded-full transition-all duration-200 ease-out"
                  style={{ width: `${maxTime > 0 ? (currentTime / maxTime) * 100 : 0}%` }}
                />
                
                {/* Timeline Markers - Agent thinking or navigation intervals */}
                {thinkingEvents.map((event, index) => {
                  const position = maxTime > 0 ? Math.max(0, Math.min(100, (event.timestamp / maxTime) * 100)) : 0;
                  const isAgentThinking = event.type === 'm';
                  return (
                    <button
                      key={index}
                      onClick={(e) => {
                        e.stopPropagation();
                        setCurrentTime(event.timestamp);
                      }}
                      className={`absolute top-1/2 w-3 h-3 -translate-y-1/2 rounded-full border-2 border-white hover:scale-125 transition-all duration-150 shadow-md z-30 cursor-pointer ${
                        isAgentThinking
                          ? 'bg-amber-400 hover:bg-amber-300'
                          : 'bg-blue-400 hover:bg-blue-300'
                      }`}
                      style={{ left: `${position}%`, transform: 'translateX(-50%) translateY(-50%)', marginLeft: '0' }}
                      title={isAgentThinking
                        ? `Agent Thinking ${index + 1} • ${formatTime(event.timestamp)}`
                        : `Navigate to ${formatTime(event.timestamp)}`
                      }
                    />
                  );
                })}
                
                {/* Progress handle - Fully visible */}
                <div
                  className="absolute top-1/2 w-3 h-3 -translate-y-1/2 bg-white rounded-full border-2 border-blue-500 shadow-md z-20"
                  style={{ left: `${maxTime > 0 ? (currentTime / maxTime) * 100 : 0}%`, transform: 'translateX(-50%) translateY(-50%)' }}
                />
              </div>
              
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(maxTime)}</span>
              </div>
              
              {/* Timeline Navigation Counter */}
              {thinkingEvents.length > 0 && (
                <div className="text-xs text-muted-foreground text-center">
                  {thinkingEvents.some(e => e.type === 'm') ? 'Action' : 'Position'} {Math.max(1, thinkingEvents.findIndex(e => e.timestamp <= currentTime) + 1)} of {thinkingEvents.length}
                </div>
              )}
            </div>
          </CardHeader>
          
          <CardContent className="p-0">
            <div className="h-[700px] bg-[#282c34] text-gray-100 font-mono text-sm overflow-hidden">
              <div 
                ref={terminalRef}
                className="h-full p-4 overflow-y-auto scrollbar-thin scrollbar-track-gray-800 scrollbar-thumb-gray-600"
              >
                {terminalContent ? (
                  <pre
                    className="whitespace-pre font-mono leading-relaxed"
                    style={{
                      fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
                      fontSize: '13px',
                      lineHeight: '1.4'
                    }}
                    dangerouslySetInnerHTML={{
                      __html: terminalContent
                    }}
                  />
                ) : (
                  <div className="text-gray-500">No terminal session yet... Press play to start</div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Agent Thinking Panel - Only show for agent recordings */}
      {showAgentThinking && (
        <div className="lg:col-span-1">
          <Card className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-4 w-4" />
                Agent Thinking
              </CardTitle>
            </CardHeader>
            
            <CardContent className="space-y-4">
              <ScrollArea className="h-[700px]">
                {currentThinking ? (
                  <div className="space-y-4">
                    {/* Episode Information (New Format) */}
                    {currentThinking.type === 'episode' && (
                      <div>
                        <Badge variant="outline" className="mb-2">
                          Episode {currentThinking.episodeNumber}
                        </Badge>
                        <p className="text-xs text-muted-foreground">
                          {currentThinking.commandCount} command{currentThinking.commandCount !== 1 ? 's' : ''} executed
                        </p>
                      </div>
                    )}

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
                            let commandText = '';
                            let timeout = null;
                            
                            if (typeof cmd === 'string') {
                              commandText = cmd;
                            } else if (typeof cmd === 'object' && cmd !== null) {
                              commandText = cmd.command || cmd.cmd || cmd.text || cmd.action || '';
                              timeout = cmd.timeout || cmd.timeout_sec || cmd.max_timeout_sec;
                              
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
      )}
    </div>
  );
}