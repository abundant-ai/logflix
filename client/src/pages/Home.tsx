import { useState } from "react";
import NavigationSidebar from "@/components/NavigationSidebar";
import MainContent from "@/components/MainContent";
import { TaskRun } from "@shared/schema";

export default function Home() {
  const [selectedTaskRun, setSelectedTaskRun] = useState<{
    date: string;
    taskId: string;
    modelName: string;
  } | null>(null);

  return (
    <div className="flex h-screen bg-background text-foreground">
      <NavigationSidebar 
        onSelectTaskRun={setSelectedTaskRun} 
        selectedTaskRun={selectedTaskRun}
      />
      <MainContent selectedTaskRun={selectedTaskRun} />
    </div>
  );
}
