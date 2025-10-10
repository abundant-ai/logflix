import { UserButton } from "@clerk/clerk-react";
import { Activity, GitBranch, GitPullRequest, CheckCircle, XCircle, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface GlobalHeaderProps {
  organization?: string;
  repository?: string;
  workflow?: string;
  prStats?: {
    open: number;
    merged: number;
    closed: number;
    total: number;
  };
  repositoryCount?: number;
  showRepoStats?: boolean;
}

export default function GlobalHeader({
  organization,
  repository,
  workflow,
  prStats,
  repositoryCount,
  showRepoStats = false
}: GlobalHeaderProps) {
  return (
    <header className="bg-card border-b border-border sticky top-0 z-50">
      <div className="flex items-center justify-between px-6 py-3">
        {/* Left: Branding and Repo Info */}
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex items-center gap-2 flex-shrink-0">
            <GitBranch className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold text-foreground">LogFlix</h1>
          </div>

          {showRepoStats && repositoryCount !== undefined ? (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-sm">
                {repositoryCount} {repositoryCount === 1 ? 'Repository' : 'Repositories'}
              </Badge>
            </div>
          ) : organization && repository ? (
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm text-muted-foreground truncate">
                {organization}/{repository}
              </span>
              {prStats && (
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="flex items-center gap-1">
                    <GitPullRequest className="h-4 w-4 text-blue-500" />
                    <span className="text-sm text-muted-foreground">{prStats.total}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4 text-green-500" />
                    <span className="text-sm text-muted-foreground">{prStats.open}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <CheckCircle className="h-4 w-4 text-purple-500" />
                    <span className="text-sm text-muted-foreground">{prStats.merged}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <XCircle className="h-4 w-4 text-red-500" />
                    <span className="text-sm text-muted-foreground">{prStats.closed}</span>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Right: Status and User */}
        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-success" />
            <span className="text-sm font-medium text-success">Live</span>
          </div>
          <UserButton
            afterSignOutUrl="/sign-in"
            appearance={{
              elements: {
                avatarBox: "w-8 h-8"
              }
            }}
          />
        </div>
      </div>
    </header>
  );
}
