import { useState, useEffect } from "react";
import { useSearch, useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import NavigationSidebar from "@/components/NavigationSidebar";
import GitHubWorkflowContent from "@/components/GitHubWorkflowContent";
import { GitHubPRSelection } from "@logflix/shared/schema";
import { REPOSITORIES } from "@logflix/shared/config";

interface HomeProps {
  repoName: string;
  userButton?: React.ReactNode;
}

export default function Home({ repoName, userButton }: HomeProps) {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  
  const [selectedPR, setSelectedPR] = useState<GitHubPRSelection | null>(null);

  // Validate repository
  const repo = REPOSITORIES.find(r => r.name === repoName);
  
  if (!repo) {
    // Invalid repo, redirect to selector
    useEffect(() => {
      setLocation('/');
    }, [setLocation]);
    return null;
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
        onBack={() => setLocation('/')}
        userButton={userButton}
      />
      <GitHubWorkflowContent selectedPR={selectedPR} />
    </div>
  );
}
