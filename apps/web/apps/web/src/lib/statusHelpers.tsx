/**
 * Utilities for handling GitHub workflow and PR status display
 */

import { CheckCircle, XCircle, Clock, GitCommit, Tag } from "lucide-react";
import { GitHubPullRequest } from "@logflix/shared/schema";

/**
 * Status configuration type
 */
export interface StatusConfig {
  color: string;
  icon: JSX.Element;
  label: string;
}

/**
 * Get color class for workflow run status
 */
export function getWorkflowStatusColor(
  status: string,
  conclusion?: string | null
): string {
  if (status === 'completed' && conclusion) {
    switch (conclusion) {
      case 'success': return 'text-success';
      case 'failure': return 'text-destructive';
      case 'cancelled': return 'text-neutral';
      case 'timed_out': return 'text-warning';
      case 'skipped': return 'text-info';
      case 'neutral': return 'text-neutral';
      case 'action_required': return 'text-warning';
      default: return 'text-neutral';
    }
  }

  switch (status) {
    case 'in_progress': return 'text-warning';
    case 'queued': return 'text-info';
    case 'requested':
    case 'waiting':
    case 'pending': return 'text-neutral';
    default: return 'text-neutral';
  }
}

/**
 * Get icon component for workflow run status
 */
export function getWorkflowStatusIcon(
  status: string,
  conclusion?: string | null
): JSX.Element {
  if (status === 'completed' && conclusion) {
    switch (conclusion) {
      case 'success': return <CheckCircle className="h-5 w-5 text-success" />;
      case 'failure': return <XCircle className="h-5 w-5 text-destructive" />;
      case 'cancelled': return <XCircle className="h-5 w-5 text-neutral" />;
      case 'timed_out': return <Clock className="h-5 w-5 text-warning" />;
      case 'skipped': return <Clock className="h-5 w-5 text-info" />;
      case 'neutral': return <Clock className="h-5 w-5 text-neutral" />;
      case 'action_required': return <Clock className="h-5 w-5 text-warning" />;
      default: return <Clock className="h-5 w-5 text-neutral" />;
    }
  }

  switch (status) {
    case 'in_progress': return <Clock className="h-5 w-5 animate-pulse text-warning" />;
    case 'queued': return <Clock className="h-5 w-5 text-info" />;
    case 'requested':
    case 'waiting':
    case 'pending': return <Clock className="h-5 w-5 text-neutral" />;
    default: return <Clock className="h-5 w-5 text-neutral" />;
  }
}

/**
 * Get status label text
 */
export function getWorkflowStatusLabel(
  status: string,
  conclusion?: string | null
): string {
  if (status === 'completed' && conclusion) {
    switch (conclusion) {
      case 'success': return 'COMPLETED';
      case 'failure': return 'FAILED';
      case 'cancelled': return 'CANCELLED';
      case 'timed_out': return 'TIMED OUT';
      case 'skipped': return 'SKIPPED';
      case 'neutral': return 'NEUTRAL';
      case 'action_required': return 'ACTION REQUIRED';
      default: return String(conclusion || 'completed').toUpperCase();
    }
  }

  switch (status) {
    case 'in_progress': return 'IN PROGRESS';
    case 'queued': return 'QUEUED';
    case 'requested': return 'REQUESTED';
    case 'waiting': return 'WAITING';
    case 'pending': return 'PENDING';
    default: return String(status || 'unknown').toUpperCase();
  }
}

/**
 * Get combined status configuration for workflow runs
 */
export function getWorkflowStatusConfig(
  status: string,
  conclusion?: string | null
): StatusConfig {
  return {
    color: getWorkflowStatusColor(status, conclusion),
    icon: getWorkflowStatusIcon(status, conclusion),
    label: getWorkflowStatusLabel(status, conclusion),
  };
}

/**
 * Get PR status icon based on state, merged status, and draft
 */
export function getPRStatusIcon(pr: GitHubPullRequest): JSX.Element {
  if (pr.draft) {
    return <Tag className="h-5 w-5 text-warning" />;
  } else if (pr.state === 'open') {
    return <CheckCircle className="h-5 w-5 text-success" />;
  } else if (pr.state === 'closed' && pr.merged_at) {
    return <GitCommit className="h-5 w-5 text-merged" />;
  } else {
    return <XCircle className="h-5 w-5 text-destructive" />;
  }
}
