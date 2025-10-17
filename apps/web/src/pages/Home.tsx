import { useState, useEffect } from "react";
import { useSearch, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useOrganization } from "@clerk/clerk-react";
import { ArrowLeft, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import NavigationSidebar from "@/components/NavigationSidebar";
import GitHubWorkflowContent from "@/components/GitHubWorkflowContent";
import GlobalHeader from "@/components/GlobalHeader";
import { GitHubPRSelection } from "@logflix/shared/schema";
import { CACHE_TIME } from "@/lib/constants";
import { fetchAPI } from "@/lib/api";

interface HomeProps {
  repoName: string;
}

interface Repository {
  name: string;
  workflow: string;
  description?: string;
}

interface UserRepositoriesResponse {
  hasAllAccess: boolean;
  organization: string;
  repositories: Repository[];
}

export default function Home({ repoName }: HomeProps) {
  const [, setLocation] = useLocation();
  const searchString = useSearch();

  const [selectedPR, setSelectedPR] = useState<GitHubPRSelection | null>(null);

  // Get current active organization from Clerk - this triggers refetch when org changes
  const { organization: clerkOrg } = useOrganization();

  // Fetch accessible repositories to validate and get organization
  // Query key includes organization ID to refetch when switching organizations
  const { data: repoData, isLoading, error } = useQuery<UserRepositoriesResponse>({
    queryKey: ['/api/user/repositories', clerkOrg?.id],
    queryFn: async () => {
      const response = await fetch('/api/user/repositories');
      if (!response.ok) {
        throw new Error(`Failed to fetch repositories: ${response.statusText}`);
      }
      return response.json();
    },
    enabled: !!clerkOrg,
    staleTime: CACHE_TIME.STALE_MEDIUM,
    gcTime: CACHE_TIME.STALE_LONG,
  });

  // Validate repository access
  const repo = repoData?.repositories.find(r => r.name === repoName);
  const organization = repoData?.organization || '';

  // Fetch PR stats for the header
  const { data: prStats } = useQuery<{ open: number; closed: number; merged: number; draft: number }>({
    queryKey: ["/api/github/repo-stats", organization, repoName],
    queryFn: async () => {
      const response = await fetch(`/api/github/repo-stats/${organization}/${repoName}`);
      if (!response.ok) throw new Error(`Failed to fetch repo stats: ${response.statusText}`);
      return response.json();
    },
    enabled: !!organization && !!repoName && !!repo,
    staleTime: CACHE_TIME.STALE_LONG,
    gcTime: CACHE_TIME.GC_LONG,
  });

  // Initialize from URL parameters - MUST be before any conditional returns
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const prNumber = params.get('pr');
    const prTitle = params.get('title');

    if (prNumber) {
      const parsedPRNumber = Number(prNumber);
      if (!isNaN(parsedPRNumber) && parsedPRNumber > 0) {
        setSelectedPR({
          type: 'pr',
          prNumber: parsedPRNumber,
          prTitle: prTitle || ''
        });
      }
    }
  }, [searchString]);

  // Redirect if repository not found or no access - MUST be before any conditional returns
  useEffect(() => {
    if (!repo && repoData) {
      setLocation('/');
    }
  }, [repo, repoData, setLocation]);

  // Handle PR selection and update URL
  const handleSelectPR = (selection: GitHubPRSelection) => {
    setSelectedPR(selection);
    
    // Update URL with query parameters
    const params = new URLSearchParams();
    params.set('pr', selection.prNumber.toString());
    if (selection.prTitle) {
      params.set('title', selection.prTitle);
    }
    
    setLocation(`/repo/${repoName}?${params.toString()}`);
  };

  // Compute page content conditionally to avoid early returns
  let pageContent;

  if (isLoading) {
    pageContent = (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading repository...</p>
        </div>
      </div>
    );
  } else if (error || !repoData) {
    pageContent = (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <ShieldAlert className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h2 className="text-lg font-semibold mb-2">Authentication Required</h2>
          <p className="text-muted-foreground max-w-md mb-4">
            Please sign in to access repositories.
          </p>
          <Button onClick={() => setLocation('/')}>
            Back to Home
          </Button>
        </div>
      </div>
    );
  } else if (!repo) {
    pageContent = (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <ShieldAlert className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h2 className="text-lg font-semibold mb-2">Access Denied</h2>
          <p className="text-muted-foreground max-w-md mb-4">
            You don't have access to the repository '{repoName}'. Redirecting...
          </p>
        </div>
      </div>
    );
  } else {
    pageContent = (
      <div className="flex flex-col h-screen bg-background text-foreground">
        <GlobalHeader
          organization={organization}
          repository={repoName}
          workflow={repo.workflow}
          prStats={prStats ? {
            open: prStats.open,
            merged: prStats.merged,
            closed: prStats.closed,
            draft: prStats.draft,
            total: prStats.open + prStats.merged + prStats.closed
          } : undefined}
        />
        <div className="flex flex-1 overflow-hidden">
          <NavigationSidebar
            onSelectPR={handleSelectPR}
            selectedPR={selectedPR}
            repoName={repoName}
            organization={organization}
            workflow={repo.workflow}
            onBack={() => setLocation('/')}
          />
          <GitHubWorkflowContent
            selectedPR={selectedPR}
            organization={organization}
            repoName={repoName}
            workflow={repo.workflow}
          />
        </div>
      </div>
    );
  }

  return pageContent;
}
