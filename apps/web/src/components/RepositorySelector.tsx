import { useQuery } from "@tanstack/react-query";
import { GitPullRequest, FolderGit2, ExternalLink, ChevronRight, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ORGANIZATION, REPOSITORIES } from "@logflix/shared/config";

interface RepositorySelectorProps {
  onSelectRepo: (repoName: string) => void;
  userButton?: React.ReactNode;
}

interface RepoStats {
  open: number;
  closed: number;
  merged: number;
}

function RepositoryCard({ repo, onSelect }: { repo: any; onSelect: (name: string) => void }) {
  // Fetch accurate PR stats using the corrected API endpoint
  const { data: stats, isLoading } = useQuery<RepoStats>({
    queryKey: ['/api/github/repo-stats', ORGANIZATION, repo.name],
    queryFn: async () => {
      const response = await fetch(`/api/github/repo-stats/${ORGANIZATION}/${repo.name}`);
      
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
              href={`https://github.com/${ORGANIZATION}/${repo.name}`}
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
              Terminal Bench Log Viewer for {ORGANIZATION}
            </p>
          </div>
          <div className="flex-1 flex justify-center">
            <Badge variant="outline" className="text-sm">
              {REPOSITORIES.length} {REPOSITORIES.length === 1 ? 'Repository' : 'Repositories'}
            </Badge>
          </div>
          <div className="flex-1 flex justify-end">
            {userButton}
          </div>
        </div>
      </header>

      {/* Repository Cards */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {REPOSITORIES.map((repo) => (
            <RepositoryCard
              key={repo.name}
              repo={repo}
              onSelect={onSelectRepo}
            />
          ))}
        </div>
      </div>
    </div>
  );
}