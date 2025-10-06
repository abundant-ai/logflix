import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, GitPullRequest, User, Clock, Tag, Calendar, TrendingUp, SortAsc, Filter, ChevronDown, CheckCircle, XCircle, AlertCircle, GitCommit, FileText } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GitHubPullRequest, GitHubPRSelection } from "@shared/schema";

interface NavigationSidebarProps {
  onSelectPR: (selection: GitHubPRSelection) => void;
  selectedPR: GitHubPRSelection | null;
}

// Hardcoded configuration - no more env setup needed
const ORGANIZATION = 'abundant-ai';
const REPOSITORIES = [
  { name: 'tbench-hammer', workflow: 'test-tasks.yaml' },
  // Add more repositories here as needed
];

export default function NavigationSidebar({ onSelectPR, selectedPR }: NavigationSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<'created' | 'updated' | 'popularity' | 'long-running'>('updated');
  const [selectedRepo, setSelectedRepo] = useState(() =>
    localStorage.getItem('selected_repo') || REPOSITORIES[0].name
  );
  const [authorFilter, setAuthorFilter] = useState("");
  const [showDrafts, setShowDrafts] = useState(false);
  const [showFailedTests, setShowFailedTests] = useState(false);
  const [showRecentActivity, setShowRecentActivity] = useState(false);
  const [showMultipleCommits, setShowMultipleCommits] = useState(false);
  const [timeRange, setTimeRange] = useState<'all' | 'week' | 'month'>('all');

  // Get current repository config
  const currentRepo = REPOSITORIES.find(r => r.name === selectedRepo) || REPOSITORIES[0];

  // Get sort display text
  const getSortText = () => {
    switch (sortBy) {
      case 'created': return 'Created';
      case 'updated': return 'Updated';
      case 'long-running': return 'Long Running';
      default: return 'Updated';
    }
  };

  const getSortIcon = () => {
    switch (sortBy) {
      case 'created': return Calendar;
      case 'updated': return TrendingUp;
      case 'long-running': return Clock;
      default: return TrendingUp;
    }
  };

  const { data: prData, isLoading, error } = useQuery<{ pullRequests: GitHubPullRequest[]; total_count: number }>({
    queryKey: ["/api/github/pull-requests", sortBy, selectedRepo, ORGANIZATION, currentRepo.workflow],
    queryFn: async () => {
      const params = new URLSearchParams({
        state: 'open',
        limit: '500',
        sort: sortBy,
        direction: 'desc',
        owner: ORGANIZATION,
        repo: selectedRepo,
        workflow: currentRepo.workflow
      });
      
      const response = await fetch(`/api/github/pull-requests?${params}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch PRs: ${response.statusText}`);
      }
      
      return response.json();
    },
    // Aggressive background refetching for real-time updates
    refetchInterval: 45 * 1000, // Slightly longer interval for larger dataset
    refetchOnWindowFocus: true, // Refetch when user returns to tab
    refetchIntervalInBackground: true, // Continue refetching even when tab is not active
    staleTime: 10 * 1000, // 10 seconds for larger dataset
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
    retry: 3, // More retries for reliability with larger data
  });

  // Simplified since we only show open PRs now
  const getPRStatusIcon = () => {
    return <GitPullRequest className="h-3 w-3 text-success" />;
  };

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
    const uniquePRs = Array.from(uniquePRMap.values());
    
    console.log(`API returned ${prData.pullRequests.length} PRs, ${uniquePRs.length} unique after client-side deduplication`);
    
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
        
        // Recent activity filter (updated in last 7 days)
        if (showRecentActivity) {
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          if (new Date(pr.updated_at) < sevenDaysAgo) return false;
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
          case 'long-running':
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          default:
            return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        }
      });
  }, [prData?.pullRequests, searchQuery, authorFilter, showRecentActivity, timeRange, sortBy, showFailedTests, showMultipleCommits, showDrafts]);

  return (
    <div className="w-80 bg-card border-r border-border flex flex-col" data-testid="navigation-sidebar">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <GitPullRequest className="h-5 w-5" />
            LogFlix
          </h1>
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${
              error ? 'bg-destructive' : isLoading ? 'bg-warning animate-pulse' : 'bg-success'
            }`}></div>
            <span className="text-xs text-muted-foreground">
              {error ? 'Error' : isLoading ? 'Syncing...' : 'Live'}
            </span>
          </div>
        </div>
        <div className="mt-2 text-xs text-muted-foreground truncate">
          {ORGANIZATION}/{selectedRepo}
        </div>
        {/* Repository Selector */}
        {REPOSITORIES.length > 1 && (
          <div className="mt-2">
            <Select value={selectedRepo} onValueChange={(value) => {
              setSelectedRepo(value);
              localStorage.setItem('selected_repo', value);
            }}>
              <SelectTrigger className="text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REPOSITORIES.map((repo) => (
                  <SelectItem key={repo.name} value={repo.name}>
                    {repo.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
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
                {sortBy === 'long-running' && <Clock className="h-3 w-3 mr-1 flex-shrink-0" />}
                <span className="truncate text-xs font-medium">
                  {getSortText()}
                </span>
                <ChevronDown className="h-3 w-3 ml-auto flex-shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              <DropdownMenuItem onClick={() => setSortBy('updated')}>
                <TrendingUp className="h-4 w-4 mr-2" />
                Recently Updated
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy('created')}>
                <Calendar className="h-4 w-4 mr-2" />
                Recently Created
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy('long-running')}>
                <Clock className="h-4 w-4 mr-2" />
                Long Running
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Filter Button - Compact design */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="flex-shrink-0 px-2">
                <Filter className="h-3 w-3 mr-1" />
                <span className="text-xs font-medium">Filter</span>
                {(authorFilter || showRecentActivity || showFailedTests || showMultipleCommits || showDrafts || timeRange !== 'all') && <div className="w-1.5 h-1.5 bg-primary rounded-full ml-1 flex-shrink-0" />}
                <ChevronDown className="h-3 w-3 ml-1 flex-shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
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
              
              <DropdownMenuSeparator />
              
              {/* Activity Filters */}
              <DropdownMenuCheckboxItem
                checked={showRecentActivity}
                onCheckedChange={setShowRecentActivity}
              >
                <AlertCircle className="h-4 w-4 mr-2" />
                Recent Activity (7 days)
              </DropdownMenuCheckboxItem>
              
              <DropdownMenuCheckboxItem
                checked={showFailedTests}
                onCheckedChange={setShowFailedTests}
              >
                <XCircle className="h-4 w-4 mr-2" />
                Failed Tests Only
              </DropdownMenuCheckboxItem>
              
              <DropdownMenuCheckboxItem
                checked={showDrafts}
                onCheckedChange={setShowDrafts}
              >
                <Tag className="h-4 w-4 mr-2" />
                Include Drafts
              </DropdownMenuCheckboxItem>
              
              {(authorFilter || showRecentActivity || showFailedTests || showDrafts || timeRange !== 'all') && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      setAuthorFilter("");
                      setShowRecentActivity(false);
                      setShowFailedTests(false);
                      setShowDrafts(false);
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
                    <div className="flex items-start gap-2">
                      <div className="flex items-center gap-1 mt-0.5">
                        {getPRStatusIcon()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">
                            #{pr.number}
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
