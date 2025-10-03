import { useState, useEffect } from "react";
import { useSearch, useLocation } from "wouter";
import NavigationSidebar from "@/components/NavigationSidebar";
import GitHubWorkflowContent from "@/components/GitHubWorkflowContent";
import { GitHubPRSelection } from "@shared/schema";

export default function Home() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  
  const [selectedPR, setSelectedPR] = useState<GitHubPRSelection | null>(null);

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
    
    setLocation(`/?${params.toString()}`);
  };

  return (
    <div className="flex h-screen bg-background text-foreground">
      <NavigationSidebar 
        onSelectPR={handleSelectPR} 
        selectedPR={selectedPR}
      />
      <GitHubWorkflowContent selectedPR={selectedPR} />
    </div>
  );
}
