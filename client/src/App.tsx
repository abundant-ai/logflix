import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import RepositorySelector from "@/components/RepositorySelector";
import Home from "@/pages/Home";
import NotFound from "@/pages/not-found";
import { useLocation } from "wouter";

function Router() {
  const [, setLocation] = useLocation();

  return (
    <Switch>
      <Route path="/">
        {() => <RepositorySelector onSelectRepo={(repo) => setLocation(`/repo/${repo}`)} />}
      </Route>
      <Route path="/repo/:repo">
        {(params) => <Home repoName={params.repo} />}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <div className="dark">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </QueryClientProvider>
    </div>
  );
}

export default App;
