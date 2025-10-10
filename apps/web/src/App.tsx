import { Switch, Route, Redirect } from "wouter";
import { SignedIn, SignedOut, useUser, UserButton } from "@clerk/clerk-react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import RepositorySelector from "@/components/RepositorySelector";
import Home from "@/pages/Home";
import SignInPage from "@/pages/SignIn";
import SignUpPage from "@/pages/SignUp";
import NotFound from "@/pages/not-found";
import { useLocation } from "wouter";
import { clerkTheme } from "@/lib/theme";

// Check if Clerk is enabled
const isClerkEnabled = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

// Create a reusable UserButton component with consistent styling
const StyledUserButton = () => (
  <UserButton
    afterSignOutUrl="/sign-in"
    appearance={clerkTheme}
  />
);

// Router with Clerk authentication
function AuthenticatedRouter() {
  const [, setLocation] = useLocation();
  const { isLoaded } = useUser();

  // Show loading state while Clerk initializes
  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-lg text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <Switch>
      {/* Public routes */}
      <Route path="/sign-in">
        <SignedOut>
          <SignInPage />
        </SignedOut>
        <SignedIn>
          <Redirect to="/" />
        </SignedIn>
      </Route>

      <Route path="/sign-up">
        <SignedOut>
          <SignUpPage />
        </SignedOut>
        <SignedIn>
          <Redirect to="/" />
        </SignedIn>
      </Route>

      {/* Clerk SSO callback route */}
      <Route path="/sso-callback">
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="text-lg text-muted-foreground">Completing sign in...</div>
        </div>
      </Route>

      {/* Protected routes */}
      <Route path="/">
        <SignedOut>
          <Redirect to="/sign-in" />
        </SignedOut>
        <SignedIn>
          <RepositorySelector
            onSelectRepo={(repo) => setLocation(`/repo/${repo}`)}
          />
        </SignedIn>
      </Route>

      <Route path="/repo/:repo">
        {(params) => (
          <>
            <SignedOut>
              <Redirect to="/sign-in" />
            </SignedOut>
            <SignedIn>
              <Home
                repoName={params.repo}
              />
            </SignedIn>
          </>
        )}
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

// Router without authentication (when Clerk is not configured)
function UnauthenticatedRouter() {
  const [, setLocation] = useLocation();

  return (
    <Switch>
      {/* Public routes - all routes are public without auth */}
      <Route path="/">
        <div className="relative">
          {/* Warning banner that auth is disabled */}
          <div className="absolute left-4 right-4 top-4 z-50 rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-3 text-sm text-yellow-500">
            <strong>Authentication Disabled:</strong> Configure VITE_CLERK_PUBLISHABLE_KEY to enable user authentication.
          </div>
          <div className="pt-16">
            <RepositorySelector onSelectRepo={(repo) => setLocation(`/repo/${repo}`)} />
          </div>
        </div>
      </Route>

      <Route path="/repo/:repo">
        {(params) => (
          <div className="relative">
            {/* Warning banner that auth is disabled */}
            <div className="absolute left-4 right-4 top-4 z-50 rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-3 text-sm text-yellow-500">
              <strong>Authentication Disabled:</strong> Configure VITE_CLERK_PUBLISHABLE_KEY to enable user authentication.
            </div>
            <div className="pt-16">
              <Home repoName={params.repo} />
            </div>
          </div>
        )}
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
          {isClerkEnabled ? <AuthenticatedRouter /> : <UnauthenticatedRouter />}
        </TooltipProvider>
      </QueryClientProvider>
    </div>
  );
}

export default App;
