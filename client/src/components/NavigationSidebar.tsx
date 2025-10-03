import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Filter, GitPullRequest, CheckCircle, XCircle, Clock, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GitHubPullRequest, GitHubPRSelection } from "@shared/schema";

interface NavigationSidebarProps {
  onSelectPR: (selection: GitHubPRSelection) => void;
  selectedPR: GitHubPRSelection | null;
}

export default function NavigationSidebar({ onSelectPR, selectedPR }: NavigationSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [sortBy, setSortBy] = useState<'created' | 'updated'>('updated');

  const { data: prData, isLoading, error } = useQuery<{ pullRequests: GitHubPullRequest[]; total_count: number }>({
    queryKey: ["/api/github/pull-requests", { state: stateFilter, limit: 50, sort: sortBy, direction: 'desc' }],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const getPRStatusColor = (state: string, merged: boolean) => {
    if (merged) return 'text-purple-500 bg-purple-500/20';
    if (state === 'open') return 'text-success bg-success/20';
    return 'text-muted-foreground bg-muted/20';
  };

  const getPRStatusIcon = (state: string, merged: boolean) => {
    if (merged) return <CheckCircle className="h-3 w-3 text-purple-500" />;
    if (state === 'open') return <GitPullRequest className="h-3 w-3 text-success" />;
    return <XCircle className="h-3 w-3 text-muted-foreground" />;
  };

  const isSelected = (prNumber: number) => {
    return selectedPR?.prNumber === prNumber;
  };

  const filteredPRs = prData?.pullRequests.filter(pr => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      pr.number.toString().includes(query) ||
      pr.title.toLowerCase().includes(query) ||
      pr.user.login.toLowerCase().includes(query) ||
      pr.head.ref.toLowerCase().includes(query)
    );
  });

  return (
    <div className="w-80 bg-card border-r border-border flex flex-col" data-testid="navigation-sidebar">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <GitPullRequest className="h-5 w-5" />
            GitHub PR Viewer
          </h1>
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${
              error ? 'bg-destructive' : isLoading ? 'bg-warning' : 'bg-success'
            }`}></div>
            <span className="text-xs text-muted-foreground">
              {error ? 'Error' : isLoading ? 'Loading' : 'Connected'}
            </span>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-1">Pull requests & CI workflows</p>
      </div>

      {/* Search and Filters */}
      <div className="px-4 py-3 border-b border-border space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Search PRs by number, title, author..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-search"
          />
        </div>

        <div className="flex gap-2">
          <Select value={stateFilter} onValueChange={(value) => setStateFilter(value as 'all' | 'open' | 'closed')}>
            <SelectTrigger className="flex-1" data-testid="select-state">
              <SelectValue placeholder="State" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All PRs</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={(value) => setSortBy(value as 'created' | 'updated')}>
            <SelectTrigger className="flex-1" data-testid="select-sort">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updated">Recently Updated</SelectItem>
              <SelectItem value="created">Recently Created</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* PRs List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-2">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <div className="text-muted-foreground">Loading pull requests...</div>
          </div>
        )}
        {error && (
          <div className="flex items-center justify-center py-8 px-4">
            <div className="text-destructive text-center">
              <div>Failed to load pull requests</div>
              <div className="text-sm text-muted-foreground mt-1">
                Run: gh auth login
              </div>
            </div>
          </div>
        )}
        {filteredPRs && !isLoading && !error && (
          <div className="space-y-1">
            {filteredPRs.map((pr) => {
              const isMerged = !!pr.merged_at;
              return (
                <div key={pr.number} className="mb-1">
                  <div
                    className={`flex flex-col px-3 py-2 hover:bg-muted rounded cursor-pointer transition-colors ${
                      isSelected(pr.number) 
                        ? 'bg-primary/20 border border-primary/30' 
                        : ''
                    }`}
                    onClick={() => onSelectPR({
                      type: 'pr',
                      prNumber: pr.number,
                      prTitle: pr.title
                    })}
                    data-testid={`pr-${pr.number}`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex items-center gap-1 mt-0.5">
                        {getPRStatusIcon(pr.state, isMerged)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">
                            #{pr.number}
                          </span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            getPRStatusColor(pr.state, isMerged)
                          }`}>
                            {isMerged ? 'merged' : pr.state}
                          </span>
                        </div>
                        <p className="text-sm text-foreground mt-1 line-clamp-2">
                          {pr.title}
                        </p>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            <span>{pr.user.login}</span>
                          </div>
                          <span>•</span>
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span>{new Date(pr.updated_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredPRs.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <p>No pull requests found</p>
                {searchQuery && <p className="text-sm mt-2">Try a different search term</p>}
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
