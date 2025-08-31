import { useLocation, Link } from "wouter";
import { ChevronRight, Terminal } from "lucide-react";
import MainContent from "@/components/MainContent";

export default function TaskRunPage() {
  const [location] = useLocation();
  const urlParams = new URLSearchParams(location.split('?')[1] || '');
  const date = urlParams.get('date');
  const taskId = urlParams.get('taskId');
  const model = urlParams.get('model');

  if (!date || !taskId || !model) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Terminal className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-foreground mb-2">Invalid Parameters</h2>
          <p className="text-muted-foreground">Missing required parameters: date, taskId, or model</p>
          <Link href="/" className="text-primary hover:underline mt-4 inline-block">
            Go back to home
          </Link>
        </div>
      </div>
    );
  }

  const selectedTaskRun = {
    date,
    taskId,
    modelName: model
  };

  return (
    <div className="min-h-screen bg-background">
      <MainContent selectedTaskRun={selectedTaskRun} />
    </div>
  );
}