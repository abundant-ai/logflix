import {
  CheckCircle,
  XCircle,
  Clock,
  HelpCircle
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { sanitizeStatus } from "@/lib/statusHelpers";

interface AgentTestResult {
  model: string | null;
  status: 'PASS' | 'FAIL' | 'UNKNOWN';
  source: 'artifact' | 'fallback' | 'unknown';
  conclusion: string | null;
  jobStatus: string;
}

interface AgentTestResultsData {
  agentResults: {
    [agentName: string]: AgentTestResult[];
  };
}

interface AgentResultsTableProps {
  agentTestResultsData: AgentTestResultsData | null | undefined;
  isLoading: boolean;
}

/**
 * StatusDisplay Component
 *
 * Renders the Job Status and Test Result columns for an agent result.
 * Extracted to avoid code duplication between single-model and multi-model agent displays.
 */
const StatusDisplay = ({ result }: { result: AgentTestResult }) => {
  // Get status text and color
  const statusColor = result.status === 'PASS' ? 'text-success' :
                     result.status === 'FAIL' ? 'text-destructive' :
                     'text-muted-foreground';

  const statusIcon = result.status === 'PASS' ? (
    <CheckCircle className="h-3.5 w-3.5" />
  ) : result.status === 'FAIL' ? (
    <XCircle className="h-3.5 w-3.5" />
  ) : (
    <Clock className="h-3.5 w-3.5" />
  );

  // Get job status color
  const jobStatusColor = result.conclusion === 'success' ? 'text-success' :
                        result.conclusion === 'failure' ? 'text-destructive' :
                        'text-muted-foreground';

  return (
    <>
      <div className="flex items-center justify-center">
        <span className={`text-sm font-medium ${jobStatusColor}`}>
          {sanitizeStatus(result.conclusion || result.jobStatus || 'PENDING')}
        </span>
      </div>
      <div className="flex items-center justify-center gap-1.5">
        <span className={statusColor}>{statusIcon}</span>
        <span className={`text-sm font-semibold ${statusColor}`}>
          {result.status}
        </span>
      </div>
    </>
  );
};

/**
 * AgentResultsTable Component
 *
 * Displays a table of agent test results with support for:
 * - Single-model agents (Oracle, NOP)
 * - Multi-model agents (Terminus with different LLMs)
 * - Status badges and tooltips
 */
export default function AgentResultsTable({ agentTestResultsData, isLoading }: AgentResultsTableProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent"></div>
        <span className="ml-3 text-muted-foreground">Loading agent results...</span>
      </div>
    );
  }

  if (!agentTestResultsData?.agentResults || Object.keys(agentTestResultsData.agentResults).length === 0) {
    return <p className="text-sm text-muted-foreground">No agent results available</p>;
  }

  // Define agent display order
  const agentOrder = ['NOP', 'Oracle', 'Terminus'];
  const sortedAgents = Object.entries(agentTestResultsData.agentResults).sort(([a], [b]) => {
    const aIndex = agentOrder.indexOf(a);
    const bIndex = agentOrder.indexOf(b);
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    return a.localeCompare(b);
  });

  return (
    <TooltipProvider>
      <div className="space-y-0">
        {/* Column Headers */}
        <div className="grid grid-cols-[2fr_1.5fr_1.5fr] gap-6 px-4 py-3 border-b border-muted/40">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Agent</span>
          </div>
          <div className="flex items-center gap-1.5 text-center">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Job Status</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="inline-flex items-center">
                  <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">GitHub Actions workflow job completion status</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex items-center gap-1.5 text-center">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Test Result</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="inline-flex items-center">
                  <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Agent execution result from test output</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Agent Rows */}
        {sortedAgents.map(([agentName, results]) => {
          // Check if this agent has models
          const hasModels = results.some(r => r.model);

          if (hasModels) {
            // Agent with models - show grouped with models beneath
            return (
              <div key={agentName} className="border-b border-muted/20">
                {/* Agent header row */}
                <div className="grid grid-cols-[2fr_1.5fr_1.5fr] gap-6 px-4 py-3 bg-muted/10">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="text-sm font-semibold text-foreground cursor-help inline-block">
                        {agentName}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <p className="text-xs font-medium">Multi-model AI agent</p>
                      <p className="text-xs text-muted-foreground mt-1">Tests with multiple LLM providers</p>
                    </TooltipContent>
                  </Tooltip>
                  <div></div>
                  <div></div>
                </div>

                {/* Model rows */}
                {results.map((result, idx) => (
                  <div key={`${agentName}-${result.model || idx}`} className="grid grid-cols-[2fr_1.5fr_1.5fr] gap-6 px-4 py-3 hover:bg-muted/5 transition-colors">
                    <div className="flex items-center text-sm text-foreground pl-6">
                      {result.model || 'Default'}
                    </div>
                    <StatusDisplay result={result} />
                  </div>
                ))}
              </div>
            );
          } else {
            // Agent without models - show inline
            const result = results[0];

            // Get agent-specific tooltip
            const agentTooltip = agentName === 'NOP' ? (
              <>
                <p className="text-xs font-medium">No-Operation Agent (Baseline)</p>
                <p className="text-xs text-muted-foreground mt-1">Designed to always fail - validates test detection</p>
              </>
            ) : agentName === 'Oracle' ? (
              <>
                <p className="text-xs font-medium">Oracle Solution Agent</p>
                <p className="text-xs text-muted-foreground mt-1">Uses reference solution - should always pass</p>
              </>
            ) : (
              <>
                <p className="text-xs font-medium">{agentName} Agent</p>
                <p className="text-xs text-muted-foreground mt-1">Test agent</p>
              </>
            );

            return (
              <div key={agentName} className="grid grid-cols-[2fr_1.5fr_1.5fr] gap-6 px-4 py-3 border-b border-muted/20 hover:bg-muted/5 transition-colors">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="text-sm font-semibold text-foreground cursor-help inline-block">
                      {agentName}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {agentTooltip}
                  </TooltipContent>
                </Tooltip>
                <StatusDisplay result={result} />
              </div>
            );
          }
        })}
      </div>
    </TooltipProvider>
  );
}
