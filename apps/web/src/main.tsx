import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import App from "./App";
import "./index.css";

// Import Clerk publishable key (optional - authentication is disabled if not set)
const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

// Only wrap with ClerkProvider if publishable key is available
const root = createRoot(document.getElementById("root")!);

if (PUBLISHABLE_KEY) {
  console.log("Clerk authentication enabled");
  root.render(
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      afterSignInUrl="/"
      afterSignUpUrl="/"
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      appearance={{
        baseTheme: undefined,
        variables: {
          colorPrimary: '#3b82f6',
          colorBackground: '#0f1419',
          colorInputBackground: '#1f2937',
          colorInputText: '#f9fafb',
          colorText: '#f9fafb',
          colorTextSecondary: '#e5e7eb',
          colorDanger: '#ef4444',
          borderRadius: '0.75rem',
        },
        elements: {
          card: 'bg-gradient-to-br from-slate-900/95 to-slate-800/95 shadow-2xl border-2 border-slate-600/50 backdrop-blur-xl',
          rootBox: 'mx-auto',
          headerTitle: 'text-white text-3xl font-bold tracking-tight',
          headerSubtitle: 'text-slate-200 text-base',
          socialButtonsBlockButton: 'border-2 border-slate-300/50 hover:border-blue-400 bg-white/90 hover:bg-white text-gray-800 font-semibold transition-all shadow-xl backdrop-blur-sm hover:shadow-2xl hover:scale-[1.02]',
          socialButtonsBlockButtonText: 'text-gray-800 font-bold text-base tracking-wide',
          socialButtonsBlockButtonArrow: 'text-gray-800 opacity-100',
          socialButtonsProviderIcon: 'brightness-100 contrast-100 saturate-100 opacity-100',
          socialButtonsIconButton: 'border-2 border-slate-300/50 bg-white/90 hover:bg-white',
          formButtonPrimary: 'bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-xl shadow-blue-500/40 transition-all hover:shadow-2xl hover:shadow-blue-500/50 hover:scale-[1.02]',
          footerActionLink: 'text-blue-400 hover:text-blue-300 font-semibold',
          formFieldInput: 'bg-slate-800/80 border-2 border-slate-500/70 focus:border-blue-400 text-white placeholder-slate-400 transition-colors backdrop-blur-sm',
          formFieldLabel: 'text-slate-100 font-semibold text-sm',
          dividerLine: 'bg-slate-500',
          dividerText: 'text-slate-300 font-medium',
          identityPreviewText: 'text-white',
          identityPreviewEditButton: 'text-blue-400 hover:text-blue-300',
          formFieldInputShowPasswordButton: 'text-slate-300 hover:text-white',
          // UserButton styling for better readability
          userButtonBox: 'shadow-lg',
          userButtonTrigger: 'focus:shadow-none',
          userButtonPopoverCard: 'bg-slate-900/98 border-2 border-slate-600/60 shadow-2xl backdrop-blur-xl',
          userButtonPopoverActionButton: 'text-slate-100 hover:text-white hover:bg-slate-800/80',
          userButtonPopoverActionButtonText: 'text-slate-100',
          userButtonPopoverActionButtonIcon: 'text-slate-300',
          userButtonPopoverFooter: 'hidden',
          userPreviewTextContainer: 'text-slate-100',
          userPreviewMainIdentifier: 'text-white font-semibold',
          userPreviewSecondaryIdentifier: 'text-slate-300',
          menuList: 'bg-slate-900/98 border-2 border-slate-600/60',
          menuItem: 'text-slate-100 hover:bg-slate-800/80 hover:text-white',
          menuButton: 'text-slate-100 hover:bg-slate-800/80 hover:text-white',
        },
      }}
    >
      <App />
    </ClerkProvider>
  );
} else {
  console.warn("Clerk authentication disabled - VITE_CLERK_PUBLISHABLE_KEY not configured");
  root.render(<App />);
}
