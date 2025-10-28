import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, User, Calendar, TrendingUp, Filter, ChevronDown, ArrowLeft, GitPullRequest, CheckCircle, XCircle, GitCommit, Tag } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { GitHubPullRequest, GitHubPRSelection } from "@logflix/shared/schema";
import { logger } from "@/lib/logger";
import { createAPIParams, fetchAPI } from "@/lib/api";
import { CACHE_TIME, API_LIMITS } from "@/lib/constants";
import { formatDateShort } from "@/lib/date";
import { getPRStatusIcon } from "@/lib/statusHelpers";

interface NavigationSidebarProps {
  onSelectPR: (selection: GitHubPRSelection) => void;
  selectedPR: GitHubPRSelection | null;
  repoName: string;
  organization: string;
  workflow: string;
  onBack: () => void;
}

export default function NavigationSidebar({ onSelectPR, selectedPR, repoName, organization, workflow, onBack }: NavigationSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<'created' | 'updated'>('created');
  const [authorFilter, setAuthorFilter] = useState("");
  const [selectedStates, setSelectedStates] = useState<string[]>(['all']);
  const [timeRange, setTimeRange] = useState<'all' | 'week' | 'month'>('all');

  // Fetch repository stats for counts and display
  const { data: statsData } = useQuery<{ open: number; closed: number; merged: number; draft: number }>({
    queryKey: ["/api/github/repo-stats", organization, repoName],
    queryFn: () => fetchAPI(`/api/github/repo-stats/${organization}/${repoName}`),
    staleTime: CACHE_TIME.STALE_LONG,
    gcTime: CACHE_TIME.GC_LONG,
  });

  // Get sort display text
  const getSortText = () => {
    switch (sortBy) {
      case 'created': return 'Recently Created';
      case 'updated': return 'Recently Updated';
      default: return 'Recently Created';
    }
  };

  const getSortIcon = () => {
    switch (sortBy) {
      case 'created': return Calendar;
      case 'updated': return TrendingUp;
      default: return Calendar;
    }
  };

  // Helper functions for state filtering
  const toggleState = (state: string) => {
    setSelectedStates(prev => {
      if (state === 'all') {
        return ['all'];
      }
      
      const filtered = prev.filter(s => s !== 'all');
      if (filtered.includes(state)) {
        return filtered.filter(s => s !== state);
      } else {
        return [...filtered, state];
      }
    });
  };

  const { data: prData, isLoading, error } = useQuery<{ pullRequests: GitHubPullRequest[]; total_count: number }>({
    queryKey: ["/api/github/pull-requests", organization, repoName, workflow, "v2"],
    queryFn: async () => {
      const params = createAPIParams(
        { owner: organization, repo: repoName, workflow },
        {
          state: 'all',
          limit: String(API_LIMITS.MAX_PRS),
          sort: 'created',
          direction: 'desc'
        }
      );

      const url = `/api/github/pull-requests?${params}`;
      const result = await fetchAPI<{ pullRequests: GitHubPullRequest[]; total_count: number }>(url);

      return result;
    },
    refetchInterval: CACHE_TIME.REFETCH_INTERVAL,
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: true,
    staleTime: CACHE_TIME.NONE,
    gcTime: CACHE_TIME.NONE,
    retry: 3,
  });

  const isSelected = (prNumber: number) => {
    return selectedPR?.prNumber === prNumber;
  };

  const filteredPRs = useMemo(() => {
    if (!prData?.pullRequests) return [];
    
    // First, deduplicate PRs by number (safety measure)
    const uniquePRMap = new Map();
    prData.pullRequests.forEach(pr => {
      if (!uniquePRMap.has(pr.number)) {
        uniquePRMap.set(pr.number, pr);
      }
    });
    const uniquePRs = Array.from(uniquePRMap.values()) as GitHubPullRequest[];
    
    return uniquePRs
      .filter(pr => {
        // Search filter
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          const matches = [
            pr.number.toString(),
            pr.title.toLowerCase(),
            pr.user.login.toLowerCase(),
            pr.head.ref.toLowerCase()
          ].some(field => field.includes(query));
          
          if (!matches) return false;
        }
        
        // Author filter
        if (authorFilter) {
          if (!pr.user.login.toLowerCase().includes(authorFilter.toLowerCase())) {
            return false;
          }
        }
        
        // State filter - compute merged, closed (non-merged), draft states
        if (!selectedStates.includes('all')) {
          const isOpen = pr.state === 'open';
          const isMerged = pr.state === 'closed' && pr.merged_at;
          const isClosed = pr.state === 'closed' && !pr.merged_at;
          const isDraft = pr.draft || false;
          
          const matchesState = (
            (selectedStates.includes('open') && isOpen) ||
            (selectedStates.includes('merged') && isMerged) ||
            (selectedStates.includes('closed') && isClosed) ||
            (selectedStates.includes('draft') && isDraft)
          );
          
          if (!matchesState) return false;
        }
        
        // Time range filter
        if (timeRange === 'week') {
          const oneWeekAgo = new Date();
          oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
          if (new Date(pr.created_at) < oneWeekAgo) return false;
        } else if (timeRange === 'month') {
          const oneMonthAgo = new Date();
          oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
          if (new Date(pr.created_at) < oneMonthAgo) return false;
        }
        
        return true;
      })
      .sort((a, b) => {
        // Proper sorting - latest first
        switch (sortBy) {
          case 'created':
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          case 'updated':
            return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
          default:
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }
      });
  }, [prData?.pullRequests, searchQuery, authorFilter, selectedStates, timeRange, sortBy]);

  return (
    <div className="w-80 bg-card border-r border-border flex flex-col" data-testid="navigation-sidebar">
      {/* Back Button */}
      <div className="p-3 border-b border-border">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={onBack}
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Repositories</span>
        </Button>
      </div>

      {/* Search and Advanced Controls */}
      <div className="px-4 py-3 border-b border-border space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Search PRs by number, title, author, branch..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-search"
          />
        </div>

        <div className="flex gap-1">
          {/* Sort Button - Compact design */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="flex-1 justify-start min-w-0 px-2">
                {sortBy === 'created' && <Calendar className="h-3 w-3 mr-1 flex-shrink-0" />}
                {sortBy === 'updated' && <TrendingUp className="h-3 w-3 mr-1 flex-shrink-0" />}
                <span className="truncate text-sm font-medium">
                  {getSortText()}
                </span>
                <ChevronDown className="h-3 w-3 ml-auto flex-shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              <DropdownMenuItem onClick={() => setSortBy('created')}>
                <Calendar className="h-4 w-4 mr-2" />
                Recently Created
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy('updated')}>
                <TrendingUp className="h-4 w-4 mr-2" />
                Recently Updated
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* State Filter Button - Multi-select design */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="flex-shrink-0 px-2">
                <Filter className="h-4 w-4" />
                {!selectedStates.includes('all') && <div className="w-1.5 h-1.5 bg-primary rounded-full ml-1 flex-shrink-0" />}
                <ChevronDown className="h-3 w-3 ml-1 flex-shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-1.5">
                <div className="relative">
                  <User className="absolute left-2 top-1/2 transform -translate-y-1/2 text-muted-foreground h-3 w-3" />
                  <Input
                    placeholder="Filter by author..."
                    className="pl-7 h-7 text-xs"
                    value={authorFilter}
                    onChange={(e) => setAuthorFilter(e.target.value)}
                  />
                </div>
              </div>
              <DropdownMenuSeparator />
              
              {/* PR State Filters */}
              <DropdownMenuCheckboxItem
                checked={selectedStates.includes('all')}
                onCheckedChange={() => toggleState('all')}
              >
                <GitPullRequest className="h-4 w-4 mr-2 text-info" />
                All ({statsData ? statsData.open + statsData.closed + statsData.merged : 0})
              </DropdownMenuCheckboxItem>
              
              <DropdownMenuCheckboxItem
                checked={selectedStates.includes('all') || selectedStates.includes('open')}
                onCheckedChange={() => toggleState('open')}
              >
                <CheckCircle className="h-4 w-4 mr-2 text-success" />
                Open ({statsData?.open || 0})
              </DropdownMenuCheckboxItem>

              <DropdownMenuCheckboxItem
                checked={selectedStates.includes('all') || selectedStates.includes('merged')}
                onCheckedChange={() => toggleState('merged')}
              >
                <GitCommit className="h-4 w-4 mr-2 text-merged" />
                Merged ({statsData?.merged || 0})
              </DropdownMenuCheckboxItem>

              <DropdownMenuCheckboxItem
                checked={selectedStates.includes('all') || selectedStates.includes('closed')}
                onCheckedChange={() => toggleState('closed')}
              >
                <XCircle className="h-4 w-4 mr-2 text-destructive" />
                Closed ({statsData?.closed || 0})
              </DropdownMenuCheckboxItem>

              <DropdownMenuCheckboxItem
                checked={selectedStates.includes('all') || selectedStates.includes('draft')}
                onCheckedChange={() => toggleState('draft')}
              >
                <Tag className="h-4 w-4 mr-2 text-warning" />
                Draft ({statsData?.draft || 0})
              </DropdownMenuCheckboxItem>
              
              <DropdownMenuSeparator />
              
              {/* Time Range Filters */}
              <DropdownMenuItem onClick={() => setTimeRange('all')}>
                <Calendar className="h-4 w-4 mr-2" />
                All Time {timeRange === 'all' && '✓'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTimeRange('week')}>
                <Calendar className="h-4 w-4 mr-2" />
                This Week {timeRange === 'week' && '✓'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTimeRange('month')}>
                <Calendar className="h-4 w-4 mr-2" />
                This Month {timeRange === 'month' && '✓'}
              </DropdownMenuItem>
              
              {(authorFilter || !selectedStates.includes('all') || timeRange !== 'all') && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      setAuthorFilter("");
                      setSelectedStates(['all']);
                      setTimeRange('all');
                    }}
                  >
                    Clear All Filters
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
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
                    <div className="flex items-start gap-3">
                      <div className="flex items-center gap-1 mt-1 flex-shrink-0">
                        {getPRStatusIcon(pr)}
                      </div>
                      <div className="flex-1 min-w-0">
                        {/* Header row with PR number and dates */}
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-sm font-medium text-foreground">
                            #{pr.number}
                          </span>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-4 w-4 text-info" />
                              <span>{formatDateShort(pr.created_at)}</span>
                            </div>
                            <span>•</span>
                            <div className="flex items-center gap-1">
                              <TrendingUp className="h-4 w-4 text-warning" />
                              <span>{formatDateShort(pr.updated_at)}</span>
                            </div>
                          </div>
                        </div>
                        
                        {/* Title */}
                        <p className="text-sm text-foreground line-clamp-2 mb-1">
                          {pr.title}
                        </p>
                        
                        {/* Bottom row with author and status indicators */}
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <User className="h-4 w-4" />
                            <span>{pr.user.login}</span>
                          </div>
                          {pr.merged_at && (
                            <>
                              <span>•</span>
                              <div className="flex items-center gap-1 text-merged">
                                <span>{formatDateShort(pr.merged_at)}</span>
                              </div>
                            </>
                          )}
                          {pr.draft && (
                            <>
                              <span>•</span>
                              <div className="flex items-center gap-1 text-warning">
                                <Tag className="h-4 w-4" />
                                <span>Draft</span>
                              </div>
                            </>
                          )}
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

