import { useState, useEffect } from "react";
import { useSearch, useLocation } from "wouter";
import NavigationSidebar from "@/components/NavigationSidebar";
import MainContent from "@/components/MainContent";
import { TaskRun } from "@shared/schema";

export default function Home() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  
  const [selectedTaskRun, setSelectedTaskRun] = useState<{
    date: string;
    taskId: string;
    modelName: string;
  } | null>(null);

  // Initialize selectedTaskRun from URL parameters on mount
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const date = params.get('date');
    const taskId = params.get('task');
    const model = params.get('model');
    
    if (date && taskId && model) {
      setSelectedTaskRun({
        date,
        taskId,
        modelName: model
      });
    }
  }, [searchString]);

  // Handle task run selection and update URL
  const handleSelectTaskRun = (taskRun: { date: string; taskId: string; modelName: string }) => {
    setSelectedTaskRun(taskRun);
    
    // Update URL with query parameters
    const params = new URLSearchParams();
    params.set('date', taskRun.date);
    params.set('task', taskRun.taskId);
    params.set('model', taskRun.modelName);
    
    setLocation(`/?${params.toString()}`);
  };

  return (
    <div className="flex h-screen bg-background text-foreground">
      <NavigationSidebar 
        onSelectTaskRun={handleSelectTaskRun} 
        selectedTaskRun={selectedTaskRun}
      />
      <MainContent selectedTaskRun={selectedTaskRun} />
    </div>
  );
}
