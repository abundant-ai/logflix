import { useState, useEffect } from "react";
import { useSearch, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import NavigationSidebar from "@/components/NavigationSidebar";
import GitHubWorkflowContent from "@/components/GitHubWorkflowContent";
import { GitHubPRSelection } from "@logflix/shared/schema";

interface HomeProps {
  repoName: string;
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

export default function Home({ repoName, userButton }: HomeProps) {
  const [, setLocation] = useLocation();
  const searchString = useSearch();

  const [selectedPR, setSelectedPR] = useState<GitHubPRSelection | null>(null);

  // Fetch accessible repositories to validate and get organization
  const { data: repoData, isLoading, error } = useQuery<UserRepositoriesResponse>({
    queryKey: ['/api/user/repositories'],
    queryFn: async () => {
      const response = await fetch('/api/user/repositories');
      if (!response.ok) {
        throw new Error(`Failed to fetch repositories: ${response.statusText}`);
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Validate repository access
  const repo = repoData?.repositories.find(r => r.name === repoName);
  const organization = repoData?.organization || '';

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading repository...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error || !repoData) {
    return (
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
  }

  // Redirect if repository not found or no access (must be at top level for hooks)
  useEffect(() => {
    if (!repo && repoData) {
      setLocation('/');
    }
  }, [repo, repoData, setLocation]);

  // Show access denied message while redirecting
  if (!repo) {
    return (
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
  }

  // Initialize from URL parameters
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const prNumber = params.get('pr');
    const prTitle = params.get('title');

    if (prNumber) {
      setSelectedPR({
        type: 'pr',
        prNumber: parseInt(prNumber, 10),
        prTitle: prTitle || ''
      });
    }
  }, [searchString]);

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

  return (
    <div className="flex h-screen bg-background text-foreground">
      <NavigationSidebar
        onSelectPR={handleSelectPR}
        selectedPR={selectedPR}
        repoName={repoName}
        organization={organization}
        workflow={repo.workflow}
        onBack={() => setLocation('/')}
        userButton={userButton}
      />
      <GitHubWorkflowContent selectedPR={selectedPR} />
    </div>
  );
}
