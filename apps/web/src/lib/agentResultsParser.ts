/**
 * Utility functions for parsing agent test results from GitHub Actions job names.
 * Centralizes the parsing logic to make it more maintainable and testable.
 */

export interface AgentTestResult {
  model: string | null;
  conclusion: string | null;
  status: string;
}

export interface AgentResultGroups {
  [agentName: string]: AgentTestResult[];
}

export interface JobData {
  name: string;
  conclusion: string | null;
  status: string;
}

/**
 * Determines if content in parentheses represents a model name (vs a note like "Should Fail")
 */
function isModelName(content: string): boolean {
  return /(?:claude|gpt|gemini|o1|llama|sonnet|pro|haiku|opus|-|\d)/i.test(content) && 
         !content.toLowerCase().includes('should fail');
}

/**
 * Normalizes agent names to standard format
 */
function normalizeAgentName(rawName: string): string {
  const cleanName = rawName.trim();
  
  // Handle known agent name variations
  if (cleanName === 'Oracle Solution') return 'Oracle';
  if (cleanName === 'NOP Agent') return 'NOP';
  
  return cleanName;
}

/**
 * Parses a single job name to extract agent name and model information
 */
export function parseAgentJobName(jobName: string): { agentName: string; modelName: string | null } | null {
  // Match pattern: "Test with {AgentName} (optional model/note)"
  const match = jobName.match(/^Test with (.+?)(?:\s*\((.+)\))?$/);
  
  if (!match) return null;
  
  const rawAgentName = match[1];
  const parenthesesContent = match[2]?.trim();
  
  const agentName = normalizeAgentName(rawAgentName);
  const modelName = parenthesesContent && isModelName(parenthesesContent) ? parenthesesContent : null;
  
  return { agentName, modelName };
}

/**
 * Groups job data by agent name and extracts test results
 */
export function groupAgentTestResults(jobs: JobData[]): AgentResultGroups {
  const agentGroups: AgentResultGroups = {};
  
  // Filter to only jobs that match the expected pattern
  const testJobs = jobs.filter(job => job.name.startsWith('Test with '));
  
  testJobs.forEach(job => {
    const parsed = parseAgentJobName(job.name);
    
    if (parsed) {
      const { agentName, modelName } = parsed;
      
      if (!agentGroups[agentName]) {
        agentGroups[agentName] = [];
      }
      
      agentGroups[agentName].push({
        model: modelName,
        conclusion: job.conclusion,
        status: job.status,
      });
    }
  });
  
  return agentGroups;
}

/**
 * Sorts agent groups according to preferred display order
 */
export function sortAgentGroups(agentGroups: AgentResultGroups): [string, AgentTestResult[]][] {
  // Define preferred agent display order
  const agentOrder = ['NOP', 'Oracle', 'Terminus'];
  
  return Object.entries(agentGroups).sort(([a], [b]) => {
    const aIndex = agentOrder.indexOf(a);
    const bIndex = agentOrder.indexOf(b);
    
    // If both agents are in the order list, sort by their position
    if (aIndex !== -1 && bIndex !== -1) {
      return aIndex - bIndex;
    }
    
    // If only one agent is in the order list, prioritize it
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    
    // If neither agent is in the order list, sort alphabetically
    return a.localeCompare(b);
  });
}

/**
 * Main function to parse and process agent test results from jobs data
 */
export function parseAgentTestResults(jobs: JobData[]): [string, AgentTestResult[]][] {
  const agentGroups = groupAgentTestResults(jobs);
  return sortAgentGroups(agentGroups);
}