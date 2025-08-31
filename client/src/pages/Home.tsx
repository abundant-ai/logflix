import NavigationSidebar from "@/components/NavigationSidebar";
import { Calendar, Terminal, Bot, BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <div className="flex h-screen bg-background text-foreground">
      <NavigationSidebar />
      <div className="flex-1 flex items-center justify-center">
        <div className="max-w-2xl text-center">
          <div className="mb-8">
            <Terminal className="h-16 w-16 text-primary mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-foreground mb-4">Terminal Bench Viewer</h1>
            <p className="text-lg text-muted-foreground">
              Browse and analyze terminal benchmarking data from AWS S3
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Calendar className="h-5 w-5 text-primary" />
                  Browse by Date
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm text-muted-foreground">
                  Explore benchmark runs organized by execution date
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Terminal className="h-5 w-5 text-accent" />
                  View Tasks
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm text-muted-foreground">
                  Examine different tasks and their configurations
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Bot className="h-5 w-5 text-warning" />
                  Compare Models
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm text-muted-foreground">
                  Analyze performance across different AI models
                </p>
              </CardContent>
            </Card>
          </div>
          
          <div className="text-sm text-muted-foreground">
            <p>Select a date and task from the sidebar to begin exploring benchmark data</p>
          </div>
        </div>
      </div>
    </div>
  );
}
