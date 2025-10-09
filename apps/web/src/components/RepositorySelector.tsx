import { useQuery } from "@tanstack/react-query";
import { GitPullRequest, FolderGit2, ExternalLink, ChevronRight, Loader2, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface RepositorySelectorProps {
  onSelectRepo: (repoName: string) => void;
  userButton?: React.ReactNode;
}

interface Repository {
  name: string;
  workflow: string;
  description?: string;
  defaultBranch?: string;
}

interface UserRepositoriesResponse {
  hasAllAccess: boolean;
  organization: string;
  repositories: Repository[];
}

interface RepoStats {
  open: number;
  closed: number;
  merged: number;
}

function RepositoryCard({ repo, organization, onSelect }: { repo: Repository; organization: string; onSelect: (name: string) => void }) {
  // Fetch accurate PR stats using the corrected API endpoint
  const { data: stats, isLoading } = useQuery<RepoStats>({
    queryKey: ['/api/github/repo-stats', organization, repo.name],
    queryFn: async () => {
      const response = await fetch(`/api/github/repo-stats/${organization}/${repo.name}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch repo stats: ${response.statusText}`);
      }

      return response.json();
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  return (
    <Card
      className="hover:border-primary/50 transition-all cursor-pointer group hover:shadow-md"
      onClick={() => onSelect(repo.name)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <FolderGit2 className="h-4 w-4 text-primary flex-shrink-0" />
            <CardTitle className="text-sm truncate">{repo.name}</CardTitle>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {repo.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {repo.description}
          </p>
        )}
        <div className="flex items-center justify-between text-xs">
          {isLoading ? (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Loading...</span>
            </div>
          ) : stats ? (
            <div className="flex items-center gap-1">
              <Badge variant="default" className="text-xs bg-green-600 hover:bg-green-700">
                {stats.open} open
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {stats.closed} closed
              </Badge>
              <Badge variant="outline" className="text-xs text-purple-600">
                {stats.merged} merged
              </Badge>
            </div>
          ) : (
            <div className="text-muted-foreground text-xs">No data</div>
          )}
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="h-5 px-1"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <a
              href={`https://github.com/${organization}/${repo.name}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function RepositorySelector({ onSelectRepo, userButton }: RepositorySelectorProps) {
  // Fetch accessible repositories from authenticated API
  // Repository access is automatically synced from GitHub on authentication
  const { data: repoData, isLoading, error } = useQuery<UserRepositoriesResponse>({
    queryKey: ['/api/user/repositories'],
    queryFn: async () => {
      const response = await fetch('/api/user/repositories');

      if (!response.ok) {
        throw new Error(`Failed to fetch repositories: ${response.statusText}`);
      }

      return response.json();
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    gcTime: 10 * 60 * 1000,
  });

  const repositories = repoData?.repositories || [];
  const organization = repoData?.organization || '';

  return (
    <div className="flex-1 flex flex-col bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <GitPullRequest className="h-6 w-6" />
              LogFlix
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {organization ? `Terminal Bench Log Viewer for ${organization}` : 'Terminal Bench Log Viewer'}
            </p>
          </div>
          <div className="flex-1 flex justify-center">
            {!isLoading && repositories.length > 0 && (
              <Badge variant="outline" className="text-sm">
                {repositories.length} {repositories.length === 1 ? 'Repository' : 'Repositories'}
              </Badge>
            )}
          </div>
          <div className="flex-1 flex justify-end">
            {userButton}
          </div>
        </div>
      </header>

      {/* Repository Cards */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
              <p className="text-muted-foreground">Loading repositories...</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <ShieldAlert className="h-12 w-12 text-destructive mx-auto mb-4" />
              <h2 className="text-lg font-semibold mb-2">Authentication Required</h2>
              <p className="text-muted-foreground max-w-md">
                Please sign in to view repositories. If you're already signed in, you may not have access to any repositories.
              </p>
            </div>
          </div>
        ) : repositories.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <FolderGit2 className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h2 className="text-lg font-semibold mb-2">No Repositories</h2>
              <p className="text-muted-foreground max-w-md">
                You don't have access to any repositories. Please contact your administrator to request access.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {repositories.map((repo) => (
              <RepositoryCard
                key={repo.name}
                repo={repo}
                organization={organization}
                onSelect={onSelectRepo}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}