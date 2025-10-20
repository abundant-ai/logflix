import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import CustomTerminalViewer from "./CustomTerminalViewer";
import AgentResultsTable from "./AgentResultsTable";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ChevronRight,
  Download,
  ExternalLink,
  Terminal,
  FileCode,
  GitPullRequest,
  MessageSquare,
  User,
  BarChart3,
  Bug,
  Brain,
  Calendar,
  TrendingUp,
  Tag,
  HelpCircle,
  XCircle,
  Clock,
  CheckCircle,
  GitCommit
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  GitHubWorkflowRun,
  GitHubPullRequest,
  GitHubReviewComment,
  GitHubPRSelection,
  GitHubWorkflowLog,
  GitHubWorkflowArtifact
} from "@logflix/shared/schema";
import { createAPIParams, fetchAPI } from "@/lib/api";
import { CACHE_TIME } from "@/lib/constants";
import { formatDate, formatDateCompact, formatTime, formatDuration } from "@/lib/date";
import { cleanAnsiCodes } from "@/lib/ansi";
import { getWorkflowStatusColor, getWorkflowStatusIcon, getWorkflowStatusLabel } from "@/lib/statusHelpers";

interface GitHubWorkflowContentProps {
  selectedPR: GitHubPRSelection | null;
  organization: string;
  repoName: string;
  workflow: string;
}

interface WorkflowRunDetails {
  run: GitHubWorkflowRun;
  logs: GitHubWorkflowLog[];
  artifacts: GitHubWorkflowArtifact[];
  hasData: boolean;
}

interface AgentFile {
  name: string;
  path: string;
  size: number;
}

interface AgentData {
  id: number;
  name: string;
  baseName: string;
  model: string;
  displayName: string;
  artifact_name: string;
  files: AgentFile[];
  expired: boolean;
  sortOrder: number;
}

export default function GitHubWorkflowContent({ selectedPR, organization, repoName, workflow }: GitHubWorkflowContentProps) {
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedCommitSha, setSelectedCommitSha] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [selectedFile, setSelectedFile] = useState<any | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [selectedLogFile, setSelectedLogFile] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [selectedAgentForLogs, setSelectedAgentForLogs] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Reset all selections when PR changes
  useEffect(() => {
    setSelectedCommitSha(null);
    setSelectedRunId(null);
    setSelectedAgent(null);
    setSelectedAgentForLogs(null);
    setSelectedLogFile(null);
    setSelectedTaskId(null);
    setSelectedFile(null);
    setFileContent(null);
  }, [selectedPR?.prNumber]);

  // Fetch PR details - only when PR is selected (lazy loading)
  const { data: prData, isLoading: isPRLoading } = useQuery<GitHubPullRequest>({
    queryKey: selectedPR ? ["/api/github/pull-request", selectedPR.prNumber] : [],
    queryFn: async () => {
      if (!selectedPR) throw new Error('No PR selected');

      const params = createAPIParams({ owner: organization, repo: repoName, workflow });
      return fetchAPI(`/api/github/pull-request/${selectedPR.prNumber}?${params}`);
    },
    enabled: !!selectedPR,
    staleTime: CACHE_TIME.NONE,
    gcTime: CACHE_TIME.GC_LONG,
  });

  // Fetch commits for this PR - only when PR is selected (lazy loading)
  const { data: commitsData } = useQuery<{ commits: Array<{ sha: string; message: string; author: string; date: string }> }>({
    queryKey: selectedPR ? ["/api/github/pr-commits", selectedPR.prNumber] : [],
    queryFn: async () => {
      if (!selectedPR) throw new Error('No PR selected');

      const params = createAPIParams({ owner: organization, repo: repoName, workflow });
      return fetchAPI(`/api/github/pr-commits/${selectedPR.prNumber}?${params}`);
    },
    enabled: !!selectedPR,
    staleTime: CACHE_TIME.NONE,
    gcTime: CACHE_TIME.GC_LONG,
  });

  // Sort commits by date (latest first) and auto-select the latest commit
  const sortedCommits = useMemo(() => {
    if (!commitsData?.commits) return [];
    return [...commitsData.commits].sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [commitsData]);

  // Auto-select the latest commit (first in sorted array) - reset when PR changes
  useEffect(() => {
    if (sortedCommits.length > 0 && !selectedCommitSha) {
      setSelectedCommitSha(sortedCommits[0].sha);
    }
  }, [sortedCommits, selectedPR?.prNumber, selectedCommitSha]); // Reset when PR changes

  // Fetch workflow runs for this PR
  const { data: runsData, isLoading: isRunsLoading } = useQuery<{ runs: GitHubWorkflowRun[]; total_count: number }>({
    queryKey: selectedPR ? ["/api/github/pr-workflow-runs", selectedPR.prNumber] : [],
    queryFn: async () => {
      if (!selectedPR) throw new Error('No PR selected');
      
      const params = createAPIParams({ owner: organization, repo: repoName, workflow });
      return fetchAPI(`/api/github/pr-workflow-runs/${selectedPR.prNumber}?${params}`);
    },
    enabled: !!selectedPR,
    staleTime: CACHE_TIME.NONE,
  });

  // Filter runs by selected commit and analyze run groupings
  const filteredRuns: GitHubWorkflowRun[] = useMemo(() => {
    if (!runsData?.runs || !selectedCommitSha) return [];
    return runsData.runs.filter(run => run.head_sha === selectedCommitSha);
  }, [runsData, selectedCommitSha]);
  
  // Group all runs by run number to show multiple attempts regardless of commit SHA
  const runsByNumber: Record<number, GitHubWorkflowRun[]> = useMemo(() => {
    if (!runsData?.runs) return {};
    
    const groups: Record<number, GitHubWorkflowRun[]> = {};
    runsData.runs.forEach(run => {
      if (!groups[run.run_number]) {
        groups[run.run_number] = [];
      }
      groups[run.run_number].push(run);
    });
    
    return groups;
  }, [runsData]);
  
  // Check if there are multiple attempts for ANY run number (regardless of commit SHA)
  const hasMultipleAttempts: boolean = useMemo(() => {
    if (!runsData?.runs?.length) return false;
    
    // Check if any run number has multiple attempts across all runs
    return Object.values(runsByNumber).some(attempts => attempts.length > 1);
  }, [runsByNumber]);
  
  // Get all attempts for the currently selected run's run number
  const currentRunAttempts: GitHubWorkflowRun[] = useMemo(() => {
    if (!selectedRunId || !runsData?.runs) return [];
    
    const selectedRun = runsData.runs.find(r => r.id === selectedRunId);
    if (!selectedRun) return [];
    
    const allAttempts = runsByNumber[selectedRun.run_number] || [];
    // Sort by attempt number (latest first for re-runs)
    return allAttempts.sort((a, b) => b.run_attempt - a.run_attempt);
  }, [selectedRunId, runsByNumber, runsData]);

  // Auto-select the latest run for the selected commit, prioritizing highest attempt number
  useEffect(() => {
    if (filteredRuns.length > 0 && !selectedRunId) {
      // Find the run with the highest attempt number (latest)
      const latestRun = filteredRuns.reduce((latest, current) => {
        if (current.run_number === latest.run_number) {
          return current.run_attempt > latest.run_attempt ? current : latest;
        }
        // If different run numbers, prefer the one with higher run number
        return current.run_number > latest.run_number ? current : latest;
      });
      setSelectedRunId(latestRun.id);
    } else if (filteredRuns.length > 0 && selectedRunId && !filteredRuns.find(r => r.id === selectedRunId)) {
      // If selected run is not in filtered runs, select the latest available
      const latestRun = filteredRuns.reduce((latest, current) => {
        if (current.run_number === latest.run_number) {
          return current.run_attempt > latest.run_attempt ? current : latest;
        }
        return current.run_number > latest.run_number ? current : latest;
      });
      setSelectedRunId(latestRun.id);
    }
  }, [selectedCommitSha, filteredRuns, selectedRunId]);

  // Fetch details for selected workflow run
  const { data: runDetails, isLoading: isRunDetailsLoading } = useQuery<WorkflowRunDetails>({
    queryKey: selectedRunId ? ["/api/github/workflow-run", selectedRunId] : [],
    queryFn: async () => {
      if (!selectedRunId) throw new Error('No run selected');
      
      const params = createAPIParams({ owner: organization, repo: repoName, workflow });
      const response = await fetch(`/api/github/workflow-run/${selectedRunId}?${params}`);
      if (!response.ok) throw new Error(`Failed to fetch run details: ${response.statusText}`);
      return response.json();
    },
    enabled: !!selectedRunId,
  });

  // Fetch bot comments for this PR
  const { data: botCommentsData } = useQuery<{ comments: GitHubReviewComment[] }>({
    queryKey: selectedPR ? ["/api/github/pr-bot-comments", selectedPR.prNumber] : [],
    queryFn: async () => {
      if (!selectedPR) throw new Error('No PR selected');
      
      const params = createAPIParams({ owner: organization, repo: repoName, workflow });
      const response = await fetch(`/api/github/pr-bot-comments/${selectedPR.prNumber}?${params}`);
      if (!response.ok) throw new Error(`Failed to fetch bot comments: ${response.statusText}`);
      return response.json();
    },
    enabled: !!selectedPR,
  });

  // Fetch all tasks for this PR
  const { data: tasksData } = useQuery<{ tasks: Array<{ taskId: string; pathPrefix: string; taskYaml: any }>; total_count: number }>({
    queryKey: selectedPR ? ["/api/github/pr-tasks", selectedPR.prNumber] : [],
    queryFn: async () => {
      if (!selectedPR) throw new Error('No PR selected');
      
      const params = createAPIParams({ owner: organization, repo: repoName, workflow });
      const response = await fetch(`/api/github/pr-tasks/${selectedPR.prNumber}?${params}`);
      if (!response.ok) throw new Error(`Failed to fetch tasks: ${response.statusText}`);
      return response.json();
    },
    enabled: !!selectedPR,
    staleTime: CACHE_TIME.NONE,
    gcTime: CACHE_TIME.GC_LONG,
  });

  // Auto-select first task when tasks load
  useEffect(() => {
    if (tasksData?.tasks && tasksData.tasks.length > 0 && !selectedTaskId) {
      setSelectedTaskId(tasksData.tasks[0].taskId);
    }
  }, [tasksData, selectedTaskId]);

  // Get current task data for display
  const currentTask = tasksData?.tasks.find(t => t.taskId === selectedTaskId);
  const taskData = currentTask ? { taskYaml: currentTask.taskYaml, taskId: currentTask.taskId } : null;

  // Fetch PR files
  const { data: prFilesData } = useQuery<{ files: any[] }>({
    queryKey: selectedPR ? ["/api/github/pr-files", selectedPR.prNumber] : [],
    queryFn: async () => {
      if (!selectedPR) throw new Error('No PR selected');

      const params = createAPIParams({ owner: organization, repo: repoName, workflow });
      return fetchAPI(`/api/github/pr-files/${selectedPR.prNumber}?${params}`);
    },
    enabled: !!selectedPR,
  });

  // Get selected run from filtered runs
  const selectedRun = filteredRuns.find(r => r.id === selectedRunId);
  const selectedCommit = sortedCommits.find(c => c.sha === selectedCommitSha);

  // Fetch commit details for display
  const { data: commitData } = useQuery<{ message: string; author: string; email: string }>({
    queryKey: selectedCommitSha ? ["/api/github/commit", selectedCommitSha] : [],
    queryFn: async () => {
      if (!selectedCommitSha) throw new Error('No commit selected');

      const params = createAPIParams({ owner: organization, repo: repoName, workflow });
      return fetchAPI(`/api/github/commit/${selectedCommitSha}?${params}`);
    },
    enabled: !!selectedCommitSha,
  });

  // Fetch jobs for selected run to show agent results
  const { data: jobsData } = useQuery<{ jobs: Array<{ name: string; conclusion: string | null; status: string }> }>({
    queryKey: selectedRunId ? ["/api/github/workflow-jobs", selectedRunId] : [],
    queryFn: async () => {
      if (!selectedRunId) throw new Error('No run selected');

      const params = createAPIParams({ owner: organization, repo: repoName, workflow });
      return fetchAPI(`/api/github/workflow-jobs/${selectedRunId}?${params}`);
    },
    enabled: !!selectedRunId,
  });

  // Fetch agent test results from new API endpoint
  const { data: agentTestResultsData, isLoading: isAgentResultsLoading } = useQuery<{
    agentResults: {
      [agentName: string]: Array<{
        model: string | null;
        status: 'PASS' | 'FAIL' | 'UNKNOWN';
        source: 'artifact' | 'fallback' | 'unknown';
        conclusion: string | null;
        jobStatus: string;
      }>;
    };
  }>({
    queryKey: selectedRunId ? ["/api/github/agent-test-results", selectedRunId] : [],
    queryFn: async () => {
      if (!selectedRunId) throw new Error('No run selected');

      const params = createAPIParams({ owner: organization, repo: repoName, workflow });
      return fetchAPI(`/api/github/agent-test-results/${selectedRunId}?${params}`);
    },
    enabled: !!selectedRunId,
    staleTime: CACHE_TIME.STALE_SHORT, // Cache for 1 minute
  });


  const duration = selectedRun ? (() => {
    const startTime = new Date(selectedRun.created_at).getTime();
    
    if (selectedRun.status === 'in_progress') {
      // For in-progress runs, use current time
      const durationMs = Date.now() - startTime;
      return Math.floor(durationMs / 1000);
    } else if (selectedRun.status === 'completed') {
      // For completed runs, estimate reasonable duration
      const endTime = new Date(selectedRun.updated_at).getTime();
      const durationMs = endTime - startTime;
      const durationSecs = Math.floor(durationMs / 1000);
      
      // If duration seems unreasonable or negative, use typical workflow duration
      if (durationSecs < 0 || durationSecs > 4 * 60 * 60) {
        // Most workflows take 20-40 minutes, estimate 30 minutes
        return 30 * 60;
      }
      
      return durationSecs;
    }
    
    return 0;
  })() : 0;

  // Fetch cast list to get all available agents and cast files - PRELOAD for performance
  const { data: castListData } = useQuery<{
    castFiles: Array<{
      artifact_id: number;
      artifact_name: string;
      expired: boolean;
      files: Array<{ name: string; path: string; size: number }>;
    }>
  }>({
    queryKey: selectedRunId ? ["/api/github/cast-list", selectedRunId, selectedCommitSha, selectedPR?.prNumber] : [],
    queryFn: async () => {
      if (!selectedRunId) throw new Error('No run selected');

      const params = createAPIParams({ owner: organization, repo: repoName, workflow });
      return fetchAPI(`/api/github/cast-list/${selectedRunId}?${params}`);
    },
    enabled: !!selectedRunId,
    staleTime: CACHE_TIME.STALE_SHORT, // Cache for 1 minute
    gcTime: CACHE_TIME.STALE_LONG, // Keep in memory for 10 minutes
  });

  // Filter cast files by selected task (if task is selected) - MUST BE AFTER castListData
  const taskFilteredCastFiles = useMemo(() => {
    if (!castListData?.castFiles || !selectedTaskId) return castListData?.castFiles || [];
    
    // Filter files that belong to the selected task's directory
    return castListData.castFiles.map((cf: any) => ({
      ...cf,
      files: cf.files.filter((f: any) => f.path.startsWith(`tasks/${selectedTaskId}/`) || f.path.includes(`/${selectedTaskId}/`))
    })).filter((cf: any) => cf.files.length > 0);
  }, [castListData, selectedTaskId]);


  // Parse available agents from cast list - filter out artifacts with no .cast files and apply task filter
  const availableAgents: AgentData[] = useMemo(() => {
    if (!taskFilteredCastFiles) return [];

    const agents: AgentData[] = taskFilteredCastFiles
      .filter((cf) => cf.files.length > 0) // Only include artifacts that have .cast files
      .map((cf): AgentData => {
        // Parse agent name: recordings-nop → NOP, recordings-terminus-gpt4 → Terminus (GPT-4)
        const name = cf.artifact_name.replace(/^recordings-/i, '');
        
        // Parse agent and model from artifact name
        let baseName = '';
        let model = '';
        
        if (name === 'nop') {
          baseName = 'NOP';
        } else if (name === 'oracle') {
          baseName = 'Oracle';
        } else if (name.startsWith('terminus')) {
          baseName = 'Terminus';
          // Extract model from name: terminus-gpt4 → GPT-4.1
          const modelPart = name.replace('terminus-', '').replace('terminus', '');
          if (modelPart) {
            if (modelPart.includes('gpt')) {
              model = 'GPT-4.1';
            } else if (modelPart.includes('claude')) {
              model = 'Claude 4 Sonnet';
            } else if (modelPart.includes('gemini')) {
              model = 'Gemini 2.5 Pro';
            } else {
              model = modelPart.toUpperCase();
            }
          }
        } else {
          baseName = name.charAt(0).toUpperCase() + name.slice(1);
        }
        
        const displayName = model ? `${baseName} (${model})` : baseName;
        
        return {
          id: cf.artifact_id,
          name: name,
          baseName: baseName,
          model: model,
          displayName: displayName,
          artifact_name: cf.artifact_name,
          files: cf.files,
          expired: cf.expired,
          sortOrder: baseName === 'NOP' ? 0 : baseName === 'Oracle' ? 1 : baseName === 'Terminus' ? 2 : 999
        };
      })
      .sort((a: AgentData, b: AgentData) => {
        // Sort by defined order: NOP first, Oracle second, then Terminus, then others
        if (a.sortOrder !== b.sortOrder) {
          return a.sortOrder - b.sortOrder;
        }
        // Within same agent type (like multiple Terminus), sort alphabetically by model
        return a.displayName.localeCompare(b.displayName);
      });

    return agents;
  }, [taskFilteredCastFiles]);


  // Auto-select first agent
  useEffect(() => {
    if (availableAgents.length > 0 && !selectedAgent) {
      setSelectedAgent(availableAgents[0].artifact_name);
    }
  }, [availableAgents, selectedAgent]);

  // Memoize selected agent data to prevent constant re-renders
  const selectedAgentData = useMemo<AgentData | undefined>(() => {
    return availableAgents.find((a) => a.artifact_name === selectedAgent);
  }, [availableAgents, selectedAgent]);

  const selectedCastFile = useMemo(() => {
    // Only look for agent.cast file (no more tests)
    return selectedAgentData?.files.find((f) => f.name === 'agent.cast');
  }, [selectedAgentData]);

  // Use React Query for cast file caching with custom queryFn - PRELOAD first agent
  const castFileQuery = useQuery<{ content: string }>({
    queryKey: selectedAgentData && selectedCastFile ? [
      "cast-file",
      selectedRunId,
      selectedAgentData.id,
      selectedCastFile.path,
      selectedCommitSha,
      selectedPR?.prNumber
    ] : [],
    queryFn: async () => {
      if (!selectedAgentData || !selectedCastFile) {
        throw new Error('No agent or cast file selected');
      }

      const params = createAPIParams({ owner: organization, repo: repoName, workflow }, { path: selectedCastFile.path });

      const response = await fetch(`/api/github/cast-file-by-path/${selectedAgentData.id}?${params}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || `Failed to fetch cast: ${response.statusText}`);
      }

      const data = await response.json();

      return data;
    },
    enabled: !!(selectedAgentData && selectedCastFile),
    staleTime: CACHE_TIME.NONE,
    gcTime: CACHE_TIME.STALE_MEDIUM,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // === LOGS TAB LOGIC - Must be AFTER availableAgents is defined ===

  // Auto-select first agent for logs
  useEffect(() => {
    if (availableAgents.length > 0 && !selectedAgentForLogs) {
      setSelectedAgentForLogs(availableAgents[0].artifact_name);
    }
  }, [availableAgents, selectedAgentForLogs]);

  // Get selected agent data for logs
  const selectedAgentDataForLogs = useMemo<AgentData | undefined>(() => {
    return availableAgents.find((a) => a.artifact_name === selectedAgentForLogs);
  }, [availableAgents, selectedAgentForLogs]);

  // Get log files for the selected agent (look for agent.log in the recordings artifact)
  const { data: logFilesDataForAgent } = useQuery<{ logFiles: Array<{ name: string; path: string }> }>({
    queryKey: selectedAgentDataForLogs ? ["/api/github/artifact-logs", selectedAgentDataForLogs.id] : [],
    queryFn: async () => {
      if (!selectedAgentDataForLogs) throw new Error('No agent selected for logs');

      const params = createAPIParams({ owner: organization, repo: repoName, workflow });
      return fetchAPI(`/api/github/artifact-logs/${selectedAgentDataForLogs.id}?${params}`);
    },
    enabled: !!selectedAgentDataForLogs,
    staleTime: CACHE_TIME.STALE_LONG,
    gcTime: CACHE_TIME.GC_MEDIUM,
  });

  // Auto-select agent.log file when log files are loaded
  useEffect(() => {
    if (logFilesDataForAgent?.logFiles && logFilesDataForAgent.logFiles.length > 0 && !selectedLogFile) {
      // Look for agent.log file first
      const agentLog = logFilesDataForAgent.logFiles.find(f => f.name === 'agent.log');
      if (agentLog) {
        setSelectedLogFile(agentLog.path);
      } else {
        // Fallback to first log file
        setSelectedLogFile(logFilesDataForAgent.logFiles[0].path);
      }
    }
  }, [logFilesDataForAgent, selectedLogFile]);

  // Use React Query for log content fetching
  const logContentQuery = useQuery<{ content: string }>({
    queryKey: selectedAgentDataForLogs && selectedLogFile ? [
      "log-content",
      selectedAgentDataForLogs.id,
      selectedLogFile
    ] : [],
    queryFn: async () => {
      if (!selectedAgentDataForLogs || !selectedLogFile) {
        throw new Error('No agent or log file selected');
      }

      const params = createAPIParams({ owner: organization, repo: repoName, workflow }, { path: selectedLogFile });

      const response = await fetch(`/api/github/artifact-log-content/${selectedAgentDataForLogs.id}?${params}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || `Failed to fetch log: ${response.statusText}`);
      }

      return await response.json();
    },
    enabled: !!(selectedAgentDataForLogs && selectedLogFile),
    staleTime: CACHE_TIME.STALE_LONG,
    gcTime: CACHE_TIME.GC_MEDIUM,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // Update logContent state from React Query and clean ANSI codes
  const logContent = logContentQuery.data?.content || null;
  const processedLogContent = useMemo(() => cleanAnsiCodes(logContent || ''), [logContent]);

  if (!selectedPR) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center">
          <GitPullRequest className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-foreground mb-2">Select a Pull Request</h2>
          <p className="text-muted-foreground">Choose a PR from the sidebar to view details</p>
        </div>
      </div>
    );
  }

  if (isPRLoading || isRunsLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
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
        </div>
      </div>
    );
  }


  // Build file tree from flat list
  const buildFileTree = (files: any[]) => {
    const tree: any = {};
    files.forEach((file: any) => {
      const parts = file.path.split('/');
      let current = tree;
      parts.forEach((part: string, index: number) => {
        if (index === parts.length - 1) {
          // Leaf node (file)
          if (!current._files) current._files = [];
          current._files.push({ ...file, name: part });
        } else {
          // Directory node
          if (!current[part]) {
            current[part] = {};
          }
          current = current[part];
        }
      });
    });
    return tree;
  };

  // Render tree recursively
  const renderTree = (node: any, path: string = ''): JSX.Element[] => {
    const elements: JSX.Element[] = [];
    
    // Render directories
    Object.keys(node).forEach(key => {
      if (key === '_files') return;
      
      const fullPath = path ? `${path}/${key}` : key;
      elements.push(
        <div key={fullPath} className="ml-2">
          <div className="flex items-center gap-1 p-1 text-sm text-muted-foreground">
            <ChevronRight className="h-4 w-4" />
            <span>{key}/</span>
          </div>
          {renderTree(node[key], fullPath)}
        </div>
      );
    });
    
    // Render files
    if (node._files) {
      node._files.forEach((file: any) => {
        elements.push(
          <div
            key={file.sha}
            className={`flex items-center gap-2 p-2 ml-2 hover:bg-muted rounded cursor-pointer transition-colors ${
              selectedFile?.path === file.path ? 'bg-primary/20 border border-primary/30' : ''
            }`}
            onClick={async () => {
              setSelectedFile(file);
              // Fetch file content
              try {
                const params = createAPIParams({ owner: organization, repo: repoName, workflow }, { path: file.path });

                const response = await fetch(`/api/github/pr-file-content/${selectedPR.prNumber}?${params}`);
                const data = await response.json();
                if (data.content) {
                  setFileContent(data.content);
                }
              } catch (error) {
                setFileContent('Error loading file content');
              }
            }}
          >
            <FileCode className="h-3 w-3 text-accent flex-shrink-0" />
            <span className="text-sm truncate">{file.name}</span>
          </div>
        );
      });
    }
    
    return elements;
  };

  const fileTree = prFilesData ? buildFileTree(prFilesData.files) : {};

  return (
    <div className="flex-1 flex flex-col">
      {/* Header - Part of content flow, not sticky */}
      <header className="bg-card border-b border-border px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          {/* PR Title with Commit and Run Info */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-medium text-foreground truncate" title={`#${prData.number}: ${prData.title}`}>
                #{prData.number}: {prData.title}
              </h2>
              {selectedCommit && (
                <>
                  <span className="text-sm text-muted-foreground">•</span>
                  <code className="text-sm text-muted-foreground font-mono" title={selectedCommit.message}>
                    {selectedCommit.sha.substring(0, 7)}
                  </code>
                </>
              )}
              {selectedRun && selectedCommit && <span className="text-sm text-muted-foreground">•</span>}
              {selectedRun && (
                <span className="text-sm text-muted-foreground">Run #{selectedRun.run_number}</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Run Selector - Show when multiple attempts exist for any run number */}
            {hasMultipleAttempts && (
              <Select
                value={selectedRunId?.toString() || ""}
                onValueChange={(value) => {
                  const numValue = Number(value);
                  if (!isNaN(numValue)) {
                    setSelectedRunId(numValue);
                  }
                }}
              >
                <SelectTrigger className="w-60 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="w-96">
                  {(() => {
                    // Show all runs with multiple attempts for the current commit
                    if (!filteredRuns.length) return [];
                    
                    // Find run numbers that have multiple attempts
                    const multiAttemptRuns: GitHubWorkflowRun[] = [];
                    const processedRunNumbers = new Set<number>();
                    
                    filteredRuns.forEach(run => {
                      if (!processedRunNumbers.has(run.run_number)) {
                        const allAttempts = runsByNumber[run.run_number] || [];
                        if (allAttempts.length > 1) {
                          // Include all attempts for this run number
                          multiAttemptRuns.push(...allAttempts);
                        } else {
                          // Include the single run
                          multiAttemptRuns.push(run);
                        }
                        processedRunNumbers.add(run.run_number);
                      }
                    });
                    
                    // Sort by run number desc, then by attempt desc
                    return multiAttemptRuns.sort((a, b) => {
                      if (a.run_number !== b.run_number) {
                        return b.run_number - a.run_number;
                      }
                      return b.run_attempt - a.run_attempt;
                    });
                  })().map((run, index) => {
                    const dateStr = formatDateCompact(run.created_at);
                    const timeStr = formatTime(run.created_at);
                    const statusText = getWorkflowStatusLabel(run.status, run.conclusion);

                    return (
                      <SelectItem key={run.id} value={run.id.toString()}>
                        <div className="flex items-center gap-2" title={`Run #${run.run_number} Attempt ${run.run_attempt} - ${statusText}`}>
                          <code className="text-xs font-mono flex-shrink-0">#{run.run_number}.{run.run_attempt}</code>
                          {index === 0 && <Badge variant="default" className="text-xs px-1.5 flex-shrink-0 bg-info text-info-foreground border-info">Latest</Badge>}
                          <span className="text-xs text-muted-foreground truncate">
                            {run.head_sha.substring(0, 7)} • {dateStr} {timeStr}
                          </span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}

            {/* Commit Selector - Sorted by date (latest first) */}
            {sortedCommits.length > 1 && (
              <Select
                value={selectedCommitSha || ""}
                onValueChange={(value) => setSelectedCommitSha(value)}
              >
                <SelectTrigger className="w-60 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="w-96">
                  {sortedCommits.map((commit, index) => (
                    <SelectItem key={commit.sha} value={commit.sha}>
                      <div className="flex items-center gap-2" title={commit.message}>
                        <code className="text-xs font-mono flex-shrink-0">{commit.sha.substring(0, 7)}</code>
                        {index === 0 && <Badge variant="default" className="text-xs px-1.5 flex-shrink-0 bg-info text-info-foreground border-info">Latest</Badge>}
                        <span className="text-xs text-muted-foreground truncate">
                          {commit.message.split('\n')[0]}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            
            <Button variant="secondary" size="sm" asChild className="flex-shrink-0">
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

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">
          <div className="bg-card border-b border-border px-6">
            <TabsList className="grid grid-cols-5 w-full max-w-2xl bg-transparent h-auto p-0">
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
                value="logs"
                className="flex items-center gap-2 px-1 py-4 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
                data-testid="tab-logs"
              >
                <Bug className="h-4 w-4" />
                Logs
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
                value="comments"
                className="flex items-center gap-2 px-1 py-4 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
                data-testid="tab-comments"
              >
                <MessageSquare className="h-4 w-4" />
                Comments
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="p-6 space-y-6 m-0 flex-1 overflow-y-auto">
            {!selectedRun && selectedCommitSha && filteredRuns.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-semibold mb-2">No Workflow Runs</h3>
                  <p className="text-muted-foreground">No workflow runs found for this commit.</p>
                </CardContent>
              </Card>
            ) : selectedRun ? (
              <>
                {/* Task Information - Three Column Layout */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle>Task Details</CardTitle>
                        {tasksData && tasksData.tasks.length > 1 && (
                          <Select
                            value={selectedTaskId || ""}
                            onValueChange={(value) => setSelectedTaskId(value)}
                          >
                            <SelectTrigger className="w-64 h-8">
                              <SelectValue placeholder="Select Task" />
                            </SelectTrigger>
                            <SelectContent>
                              {tasksData.tasks.map((task) => (
                                <SelectItem key={task.taskId} value={task.taskId}>
                                  <code className="text-sm font-mono">{task.taskId}</code>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div>
                          <label className="text-sm text-muted-foreground block mb-1">Task ID</label>
                          <p className="text-base font-medium flex items-center gap-2">
                            <Tag className="h-5 w-5 text-info" />
                            {taskData?.taskId || 'N/A'}
                          </p>
                          {tasksData && tasksData.tasks.length > 1 && (
                            <p className="text-xs text-warning mt-1">
                              {tasksData.tasks.length} tasks available
                            </p>
                          )}
                        </div>
                        <div>
                          <label className="text-sm text-muted-foreground block mb-1">Duration</label>
                          <p className="text-base flex items-center gap-2">
                            <Clock className="h-5 w-5 text-success" />
                            {formatDuration(duration)}
                          </p>
                        </div>
                        <div>
                          <label className="text-sm text-muted-foreground block mb-1">Difficulty</label>
                          <p className="text-base capitalize flex items-center gap-2">
                            <BarChart3 className="h-5 w-5 text-warning" />
                            {taskData?.taskYaml?.difficulty || 'N/A'}
                          </p>
                        </div>
                        {taskData?.taskYaml?.category && (
                          <div>
                            <label className="text-sm text-muted-foreground block mb-1">Category</label>
                            <p className="text-base flex items-center gap-2">
                              <Tag className="h-5 w-5 text-merged" />
                              {taskData.taskYaml.category}
                            </p>
                          </div>
                        )}
                        {taskData?.taskYaml?.max_agent_timeout_sec && (
                          <div>
                            <label className="text-sm text-muted-foreground block mb-1">Max Agent Timeout</label>
                            <p className="text-base flex items-center gap-2">
                              <Clock className="h-5 w-5 text-destructive" />
                              {taskData.taskYaml.max_agent_timeout_sec}s
                            </p>
                          </div>
                        )}
                        {taskData?.taskYaml?.max_test_timeout_sec && (
                          <div>
                            <label className="text-sm text-muted-foreground block mb-1">Max Test Timeout</label>
                            <p className="text-base flex items-center gap-2">
                              <Clock className="h-5 w-5 text-warning" />
                              {taskData.taskYaml.max_test_timeout_sec}s
                            </p>
                          </div>
                        )}
                        {taskData?.taskYaml?.tags && taskData.taskYaml.tags.length > 0 && (
                          <div>
                            <label className="text-sm text-muted-foreground block mb-1">Tags</label>
                            <div className="flex flex-wrap gap-1">
                              {taskData.taskYaml.tags.map((tag: string) => (
                                <Badge key={tag} variant="secondary" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle>Agent Results</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <AgentResultsTable
                        agentTestResultsData={agentTestResultsData}
                        isLoading={isAgentResultsLoading}
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Pull Request Details</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div>
                          <label className="text-sm text-muted-foreground block mb-1">Author</label>
                          <p className="text-base flex items-center gap-2">
                            <User className="h-5 w-5 text-info" />
                            {taskData?.taskYaml?.author_name || commitData?.author || prData.user.login}
                            {(commitData?.email || taskData?.taskYaml?.author_email) && (
                              <span className="text-sm text-muted-foreground"> &lt;{commitData?.email || taskData?.taskYaml?.author_email}&gt;</span>
                            )}
                          </p>
                        </div>
                        <div>
                          <label className="text-sm text-muted-foreground block mb-1">Github Username</label>
                          <p className="text-base flex items-center gap-2">
                            <User className="h-5 w-5 text-merged" />
                            {prData.user.login}
                          </p>
                        </div>
                        <div>
                          <label className="text-sm text-muted-foreground block mb-1">Created At</label>
                          <p className="text-base flex items-center gap-2">
                            <Calendar className="h-5 w-5 text-info" />
                            {formatDate(prData.created_at)}
                          </p>
                        </div>
                        <div>
                          <label className="text-sm text-muted-foreground block mb-1">Updated At</label>
                          <p className="text-base flex items-center gap-2">
                            <TrendingUp className="h-5 w-5 text-warning" />
                            {formatDate(prData.updated_at)}
                          </p>
                        </div>
                        {selectedRun && (
                          <div>
                            <label className="text-sm text-muted-foreground block mb-1">Workflow Status</label>
                            <p className="text-base flex items-center gap-2">
                              {getWorkflowStatusIcon(selectedRun.status, selectedRun.conclusion)}
                              <span className={`font-medium ${getWorkflowStatusColor(selectedRun.status, selectedRun.conclusion)}`}>
                                {getWorkflowStatusLabel(selectedRun.status, selectedRun.conclusion)}
                              </span>
                            </p>
                          </div>
                        )}
                        {prData.merged_at && (
                          <div>
                            <label className="text-sm text-muted-foreground block mb-1">Merged At</label>
                            <p className="text-base flex items-center gap-2">
                              <GitCommit className="h-5 w-5 text-merged" />
                              {formatDate(prData.merged_at)}
                            </p>
                          </div>
                        )}
                        <div>
                          <label className="text-sm text-muted-foreground block mb-1">Commit</label>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <code className="text-sm font-mono bg-muted px-1.5 py-0.5 rounded">
                                {(selectedCommitSha || selectedRun?.head_sha || '').substring(0, 7)}
                              </code>
                              <Button
                                variant="ghost"
                                size="sm"
                                asChild
                                className="h-6 px-2"
                              >
                                <a
                                  href={`https://github.com/${organization}/${repoName}/commit/${selectedCommitSha || selectedRun?.head_sha}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  <span className="text-xs">View</span>
                                </a>
                              </Button>
                            </div>
                            <p className="text-sm text-foreground break-words whitespace-normal leading-relaxed">
                              {commitData?.message?.split('\n')[0] || selectedCommit?.message?.split('\n')[0] || 'No commit message'}
                            </p>
                            {selectedCommit && (
                              <p className="text-xs text-muted-foreground">
                                {formatDate(selectedCommit.date)}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Task Instruction */}
                {taskData?.taskYaml?.instruction && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Task Instruction</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="bg-muted rounded-lg p-4">
                        <pre className="text-sm whitespace-pre-wrap text-foreground">
                          {taskData.taskYaml.instruction}
                        </pre>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : null}
          </TabsContent>

          <TabsContent value="terminal" className="p-0 m-0 h-full">
            <div className="h-full flex flex-col">
              {/* Stable Control Bar */}
              {availableAgents.length > 0 && (
                <div className="bg-card border-b border-border p-4 flex-shrink-0">
                  <div className="flex items-center gap-3">
                    <Select
                      value={selectedAgent || ""}
                      onValueChange={setSelectedAgent}
                    >
                      <SelectTrigger className="w-64">
                        <SelectValue placeholder="Select Agent" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableAgents.map((agent: any) => (
                          <SelectItem key={agent.artifact_name} value={agent.artifact_name}>
                            {agent.displayName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedAgentData && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => window.open(`/api/github/download-artifact/${selectedRunId}/${selectedAgentData.artifact_name}`, '_blank')}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Download
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Stable Content Area - Increased height for better visibility */}
              <div className="flex-1 min-h-[600px] h-full">
                {castFileQuery.error ? (
                  <div className="h-full flex items-center justify-center p-8">
                    <div className="text-center">
                      <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
                      <p className="text-muted-foreground">Error loading cast file</p>
                      <p className="text-sm text-muted-foreground mt-2">
                        {(castFileQuery.error as Error)?.message || 'Failed to load cast file'}
                      </p>
                      {selectedAgentData?.expired && (
                        <div className="mt-4 p-3 bg-warning/10 border border-warning/30 rounded-lg">
                          <p className="text-sm text-warning">
                            📦 This artifact has expired and is no longer available for download
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : !selectedCastFile ? (
                  <div className="h-full flex items-center justify-center p-8">
                    <div className="text-center">
                      <Terminal className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">
                        {availableAgents.length > 0 ?
                          'No agent recording found for this agent' :
                          'No terminal recordings available'
                        }
                      </p>
                      {selectedAgentData?.expired && (
                        <div className="mt-4 p-3 bg-warning/10 border border-warning/30 rounded-lg">
                          <p className="text-sm text-warning">
                            📦 This artifact has expired and is no longer available for download
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : castFileQuery.isLoading ? (
                  <div className="h-full flex items-center justify-center p-8">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent mx-auto mb-4"></div>
                      <p className="text-muted-foreground">Loading terminal session...</p>
                    </div>
                  </div>
                ) : castFileQuery.data?.content ? (
                  <div className="h-full">
                    <CustomTerminalViewer
                      castContent={castFileQuery.data.content}
                      showAgentThinking={true}
                    />
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center p-8">
                    <div className="text-center">
                      <Terminal className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">No cast content available</p>
                      {selectedAgentData?.expired && (
                        <div className="mt-4 p-3 bg-warning/10 border border-warning/30 rounded-lg">
                          <p className="text-sm text-warning">
                            📦 This artifact has expired and is no longer available for download
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="files" className="p-0 m-0 h-full">
            {prFilesData && prFilesData.files.length > 0 ? (
              <div className="flex h-full">
                {/* File Tree Sidebar */}
                <div className="w-80 border-r border-border bg-card overflow-y-auto scrollbar-thin">
                  <div className="p-4 border-b border-border">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-muted-foreground">Modified</span>
                      <Badge variant="secondary" className="text-xs">{prFilesData.files.length}</Badge>
                    </div>
                  </div>
                  <div className="p-2">
                    {renderTree(fileTree)}
                  </div>
                </div>

                {/* File Content Viewer */}
                <div className="flex-1 flex flex-col">
                  {selectedFile && fileContent ? (
                    <div className="flex-1 overflow-auto bg-black p-4">
                      <pre className="text-sm font-mono text-success whitespace-pre-wrap break-words">
                        {fileContent}
                      </pre>
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center">
                      <div className="text-center">
                        <FileCode className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                        <p className="text-muted-foreground">Select a file to view its content</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full p-8">
                <div className="text-center">
                  <FileCode className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <p className="text-muted-foreground">No files found in this PR</p>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="logs" className="p-0 m-0 h-full">
            {availableAgents.length > 0 ? (
              <div className="flex flex-col h-full">
                <div className="bg-card border-b border-border p-4 flex-shrink-0">
                  <div className="flex items-center gap-3">
                    <Select
                      value={selectedAgentForLogs || ""}
                      onValueChange={(value) => {
                        setSelectedAgentForLogs(value);
                        // Reset log file selection when agent changes
                        setSelectedLogFile(null);
                      }}
                    >
                      <SelectTrigger className="w-64">
                        <SelectValue placeholder="Select Agent" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableAgents.map((agent) => (
                          <SelectItem key={agent.artifact_name} value={agent.artifact_name}>
                            {agent.displayName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedAgentDataForLogs && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => window.open(`/api/github/download-artifact/${selectedRunId}/${selectedAgentDataForLogs.artifact_name}`, '_blank')}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Download
                      </Button>
                    )}
                  </div>
                </div>
                <div className="flex-1 overflow-auto bg-black p-4">
                  {logContentQuery.error ? (
                    <div className="text-center text-destructive p-8">
                      <p>Error loading log file</p>
                      <p className="text-sm mt-2">
                        {(logContentQuery.error as Error)?.message || 'Failed to load log file'}
                      </p>
                    </div>
                  ) : processedLogContent ? (
                    <pre className="text-sm font-mono text-success whitespace-pre-wrap break-words leading-relaxed">
                      {processedLogContent}
                    </pre>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent"></div>
                      <span className="ml-3 text-gray-400">Loading log file...</span>
                    </div>
                  )}
                </div>
              </div>
            ) : isRunDetailsLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent"></div>
                <span className="ml-3 text-muted-foreground">Loading logs...</span>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full p-8">
                <div className="text-center">
                  <Terminal className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <p className="text-muted-foreground">No log files available in artifacts</p>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="comments" className="p-6 space-y-4 m-0">
            {botCommentsData && botCommentsData.comments && botCommentsData.comments.length > 0 ? (
              <div className="space-y-4">
                {/* Sort comments by date (latest first) and render each in its own card */}
                {botCommentsData.comments
                  .filter(comment => comment && comment.body && comment.created_at && comment.user)
                  .sort((a, b) => {
                    try {
                      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                    } catch (error) {
                      console.warn('Error sorting comments by date:', error);
                      return 0;
                    }
                  })
                  .map((comment) => {
                    try {
                      const commentDate = new Date(comment.created_at);
                      
                      // Validate date
                      if (isNaN(commentDate.getTime())) {
                        console.warn('Invalid date for comment:', comment.id, comment.created_at);
                        return null;
                      }
                      
                      const isAgentAnalysis = (comment.body || '').includes('Agent Test Results Overview') ||
                                            (comment.body || '').includes('Detailed Failure Analysis') ||
                                            (comment.user?.login || '').includes('claude');
                      
                      // Format date and time with error handling
                      let dateStr = 'Unknown date';
                      let timeStr = 'Unknown time';

                      try {
                        dateStr = formatDateCompact(commentDate);
                        timeStr = formatTime(commentDate);
                      } catch (dateError) {
                        console.warn('Error formatting date for comment:', comment.id, dateError);
                      }
                      
                      return (
                        <Card key={comment.id || Math.random()} className={`${isAgentAnalysis ? 'border-info/30 bg-info/5' : 'border-gray-200 dark:border-gray-700'}`}>
                          <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <Badge
                                  variant={isAgentAnalysis ? "default" : "secondary"}
                                  className={isAgentAnalysis ? "bg-info text-info-foreground border-none" : ""}
                                >
                                  {isAgentAnalysis ? (
                                    <div className="flex items-center gap-1">
                                      <Brain className="h-3 w-3" />
                                      Agent Analysis
                                    </div>
                                  ) : (
                                    comment.user?.login || 'Unknown user'
                                  )}
                                </Badge>
                                {isAgentAnalysis && (
                                  <Badge variant="outline" className="text-xs border-info/50 text-info">
                                    Automated Analysis
                                  </Badge>
                                )}
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                asChild
                                className="h-7 text-xs"
                              >
                                <a
                                  href={comment.html_url || '#'}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  GitHub
                                </a>
                              </Button>
                            </div>
                            
                            {/* Date and time prominently displayed */}
                            <div className="text-sm text-muted-foreground font-medium">
                              {dateStr} at {timeStr}
                            </div>
                          </CardHeader>
                          
                          <CardContent>
                            <div className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 p-4 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
                              {/* Modern gradient background with high contrast text */}
                              {comment.body ? (
                                <div className="prose prose-sm max-w-none break-words overflow-wrap-anywhere">
                                  <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    components={{
                                      h1: ({ children }) => <h1 className="text-xl font-bold mt-4 mb-3 text-gray-900 dark:text-white border-b border-gray-300 dark:border-gray-600 pb-2 break-words">{children}</h1>,
                                      h2: ({ children }) => <h2 className="text-lg font-semibold mt-4 mb-3 text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-1 break-words">{children}</h2>,
                                      h3: ({ children }) => <h3 className="text-base font-semibold mt-3 mb-2 text-blue-700 dark:text-blue-300 break-words">{children}</h3>,
                                      h4: ({ children }) => <h4 className="text-sm font-semibold mt-3 mb-2 text-gray-800 dark:text-gray-200 break-words">{children}</h4>,
                                      h5: ({ children }) => <h5 className="text-sm font-medium mt-2 mb-1 text-gray-800 dark:text-gray-200 break-words">{children}</h5>,
                                      h6: ({ children }) => <h6 className="text-sm font-medium mt-2 mb-1 text-gray-600 dark:text-gray-400 break-words">{children}</h6>,
                                      ul: ({ children }) => <ul className="my-2 ml-4 list-disc text-gray-800 dark:text-gray-200">{children}</ul>,
                                      ol: ({ children }) => <ol className="my-2 ml-4 list-decimal text-gray-800 dark:text-gray-200">{children}</ol>,
                                      li: ({ children }) => <li className="text-gray-800 dark:text-gray-200 my-1 break-words">{children}</li>,
                                      code: ({ children }) => <code className="bg-gray-100 dark:bg-gray-700 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded text-xs font-mono break-all">{children}</code>,
                                      pre: ({ children }) => <pre className="bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 p-3 rounded-lg overflow-x-auto my-3 text-sm font-mono whitespace-pre-wrap break-words">{children}</pre>,
                                      strong: ({ children }) => <strong className="font-semibold text-gray-900 dark:text-white break-words">{children}</strong>,
                                      em: ({ children }) => <em className="italic text-gray-800 dark:text-gray-200">{children}</em>,
                                      p: ({ children }) => <p className="text-gray-800 dark:text-gray-200 leading-relaxed my-2 break-words">{children}</p>,
                                      blockquote: ({ children }) => <blockquote className="border-l-4 border-gradient-to-b from-blue-400 to-indigo-500 dark:from-blue-500 dark:to-indigo-600 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 pl-4 my-3 text-gray-700 dark:text-gray-300 italic py-2 rounded-r">{children}</blockquote>,
                                      a: ({ children, href }) => (
                                        <a
                                          href={href}
                                          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 underline break-words font-medium"
                                          target="_blank"
                                          rel="noopener noreferrer"
                                        >
                                          {children}
                                        </a>
                                      ),
                                      table: ({ children }) => <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600 my-4 bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900">{children}</table>,
                                      th: ({ children }) => <th className="border border-gray-300 dark:border-gray-600 bg-gradient-to-r from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 px-3 py-2 text-left text-gray-900 dark:text-white font-semibold">{children}</th>,
                                      td: ({ children }) => <td className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-800 dark:text-gray-200">{children}</td>
                                    }}
                                  >
                                    {comment.body}
                                  </ReactMarkdown>
                                </div>
                              ) : (
                                <p className="text-gray-500 dark:text-gray-400 italic">No content available</p>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    } catch (renderError) {
                      return (
                        <Card key={comment.id || Math.random()} className="border-destructive/30 bg-destructive/5">
                          <CardContent className="p-4">
                            <p className="text-destructive text-sm">Error rendering comment.</p>
                          </CardContent>
                        </Card>
                      );
                    }
                  })
                  .filter(Boolean)} {/* Remove null entries */}
              </div>
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <p className="text-muted-foreground">No workflow comments found</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Agent analysis comments will appear here when tests fail
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
