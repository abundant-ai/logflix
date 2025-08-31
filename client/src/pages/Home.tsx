import NavigationSidebar from "@/components/NavigationSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Terminal, Database, Calendar } from "lucide-react";

export default function Home() {
  return (
    <div className="flex h-screen bg-background text-foreground">
      <NavigationSidebar />
      
      {/* Welcome Content */}
      <div className="flex-1 p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="text-center space-y-4">
            <h1 className="text-4xl font-bold text-foreground">Terminal-Bench Viewer</h1>
            <p className="text-xl text-muted-foreground">
              Analyze agent trajectories and debug Terminal-Bench runs
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Terminal className="h-5 w-5" />
                  Terminal Sessions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  View real-time terminal recordings with ANSI escape sequence filtering for clean display.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Agent Analysis
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Analyze agent thinking patterns, planned commands, and decision-making processes.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Task Comparison
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Compare multiple models side-by-side on the same tasks with performance metrics.
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Getting Started</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <p>
                  <strong>1. Browse Tasks:</strong> Use the sidebar to explore available benchmark dates and tasks from S3.
                </p>
                <p>
                  <strong>2. Select a Task:</strong> Click on any task to view all model runs for that specific benchmark.
                </p>
                <p>
                  <strong>3. Compare Models:</strong> Switch between model tabs to compare agent performance and behavior.
                </p>
                <p>
                  <strong>4. Timeline Navigation:</strong> Use the yellow markers on the progress bar to jump between agent actions.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
