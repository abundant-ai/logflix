import { UserButton, OrganizationSwitcher } from "@clerk/clerk-react";
import { Activity, GitBranch, GitPullRequest, CheckCircle, XCircle, Clock, GitCommit, Tag, Loader2, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useIsFetching } from "@tanstack/react-query";
import { useState, useEffect } from "react";

interface GlobalHeaderProps {
  organization?: string;
  repository?: string;
  workflow?: string;
  prStats?: {
    open: number;
    merged: number;
    closed: number;
    draft: number;
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
  // Track background fetching state
  const isFetching = useIsFetching();

  // Track network status
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // Initial state
    setIsOnline(navigator.onLine);

    // Listen for network changes
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Determine status display
  const getStatusDisplay = () => {
    if (!isOnline) {
      return {
        icon: <WifiOff className="h-4 w-4 text-destructive" />,
        text: 'Offline',
        color: 'text-destructive'
      };
    }

    if (isFetching > 0) {
      return {
        icon: <Loader2 className="h-4 w-4 text-warning animate-spin" />,
        text: 'Fetching',
        color: 'text-warning'
      };
    }

    return {
      icon: <Activity className="h-4 w-4 text-success" />,
      text: 'Live',
      color: 'text-success'
    };
  };

  const statusDisplay = getStatusDisplay();

  return (
    <header className="bg-card border-b border-border sticky top-0 z-50">
      <div className="flex items-center justify-between px-6 py-3">
        {/* Left: Branding and Repo Info */}
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-shrink-0">
            <GitBranch className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold text-foreground">LogFlix</h1>
          </div>

          {showRepoStats ? (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-sm">
                {repositoryCount ?? 0} {(repositoryCount ?? 0) === 1 ? 'Repository' : 'Repositories'}
              </Badge>
            </div>
          ) : organization && repository ? (
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="text-sm text-muted-foreground truncate">
                {organization}/{repository}
              </span>
              <div className="flex items-center gap-4 flex-shrink-0">
                <div className="flex items-center gap-1.5">
                  <GitPullRequest className="h-4 w-4 text-info" />
                  <span className="text-sm text-muted-foreground">{prStats?.total ?? 0}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle className="h-4 w-4 text-success" />
                  <span className="text-sm text-muted-foreground">{prStats?.open ?? 0}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <GitCommit className="h-4 w-4 text-merged" />
                  <span className="text-sm text-muted-foreground">{prStats?.merged ?? 0}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <XCircle className="h-4 w-4 text-destructive" />
                  <span className="text-sm text-muted-foreground">{prStats?.closed ?? 0}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Tag className="h-4 w-4 text-warning" />
                  <span className="text-sm text-muted-foreground">{prStats?.draft ?? 0}</span>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Right: Status, Organization, and User */}
        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            {statusDisplay.icon}
            <span className={`text-sm font-medium ${statusDisplay.color}`}>{statusDisplay.text}</span>
          </div>
          <OrganizationSwitcher
            hidePersonal
            afterSelectOrganizationUrl="/"
            appearance={{
              elements: {
                rootBox: "flex items-center",
                organizationSwitcherTrigger: "px-3 py-1.5 rounded-md hover:bg-accent text-sm border border-border bg-card",
                organizationSwitcherTriggerIcon: "text-muted-foreground",
                organizationPreviewTextContainer: "text-foreground",
                organizationPreviewMainIdentifier: "text-foreground font-medium",
                organizationPreviewSecondaryIdentifier: "text-muted-foreground",
                organizationSwitcherPopoverCard: "bg-card border border-border shadow-lg",
                organizationSwitcherPopoverActionButton: "hover:bg-accent text-foreground",
                organizationSwitcherPopoverActionButtonText: "text-foreground",
                organizationSwitcherPopoverActionButtonIcon: "text-muted-foreground",
              }
            }}
          />
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
