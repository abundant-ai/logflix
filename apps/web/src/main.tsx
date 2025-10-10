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
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      appearance={{
        baseTheme: undefined,
        variables: {
          colorPrimary: '#3b82f6',
          colorBackground: '#1a1f2e',
          colorInputBackground: '#2d3548',
          colorInputText: '#ffffff',
          colorText: '#ffffff',
          colorTextSecondary: '#cbd5e1',
          colorDanger: '#ef4444',
          borderRadius: '0.75rem',
        },
        elements: {
          card: 'bg-slate-900 shadow-2xl border border-slate-700 backdrop-blur-xl',
          rootBox: 'mx-auto',
          headerTitle: 'text-white text-3xl font-bold tracking-tight',
          headerSubtitle: 'text-slate-300 text-base',
          socialButtonsBlockButton: 'border-2 border-slate-300/50 hover:border-blue-400 bg-white/90 hover:bg-white text-gray-900 font-semibold transition-all shadow-xl backdrop-blur-sm hover:shadow-2xl hover:scale-[1.02]',
          socialButtonsBlockButtonText: 'text-gray-900 font-bold text-base tracking-wide',
          socialButtonsBlockButtonArrow: 'text-gray-900 opacity-100',
          socialButtonsProviderIcon: 'brightness-100 contrast-100 saturate-100 opacity-100',
          socialButtonsIconButton: 'border-2 border-slate-300/50 bg-white/90 hover:bg-white',
          formButtonPrimary: 'bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-xl shadow-blue-500/40 transition-all hover:shadow-2xl hover:shadow-blue-500/50 hover:scale-[1.02]',
          footerActionLink: 'text-blue-400 hover:text-blue-300 font-semibold',
          formFieldInput: 'bg-slate-800 border-2 border-slate-600 focus:border-blue-400 text-white placeholder-slate-400 transition-colors',
          formFieldLabel: 'text-slate-200 font-semibold text-sm',
          dividerLine: 'bg-slate-600',
          dividerText: 'text-slate-300 font-medium',
          identityPreviewText: 'text-white font-medium',
          identityPreviewEditButton: 'text-blue-400 hover:text-blue-300',
          formFieldInputShowPasswordButton: 'text-slate-400 hover:text-white',
          // UserButton styling for better readability
          userButtonBox: 'shadow-lg',
          userButtonTrigger: 'focus:shadow-none',
          userButtonPopoverCard: 'bg-slate-900 border-2 border-slate-700 shadow-2xl',
          userButtonPopoverActionButton: 'text-white hover:text-white hover:bg-slate-800',
          userButtonPopoverActionButtonText: 'text-white font-medium',
          userButtonPopoverActionButtonIcon: 'text-slate-300',
          userButtonPopoverFooter: 'hidden',
          userPreviewTextContainer: 'text-white',
          userPreviewMainIdentifier: 'text-white font-semibold text-base',
          userPreviewSecondaryIdentifier: 'text-slate-300 font-normal',
          // Account page specific styling
          profileSectionPrimaryButton: 'text-blue-400 hover:text-blue-300 font-semibold',
          profileSectionTitle: 'text-white font-semibold text-base',
          profileSectionContent: 'text-slate-200',
          accordionTriggerButton: 'text-white hover:text-white',
          accordionContent: 'text-slate-200',
          navbarButton: 'text-white hover:bg-slate-800',
          navbarButtonIcon: 'text-white',
          pageScrollBox: 'bg-slate-900',
          modalContent: 'bg-slate-900 border border-slate-700',
          modalCloseButton: 'text-slate-400 hover:text-white',
          alertText: 'text-white',
          formFieldSuccessText: 'text-green-400',
          formFieldErrorText: 'text-red-400',
          formHeaderTitle: 'text-white font-semibold',
          formHeaderSubtitle: 'text-slate-300',
          // Profile page additional styling for better visibility
          badge: 'bg-blue-600/20 text-blue-300 border border-blue-500/30 font-medium',
          badgeSecondary: 'bg-slate-700 text-slate-200 border border-slate-600',
          profileSection: 'text-slate-100',
          profileSectionSubtitle: 'text-slate-300',
          profileSectionItemTitle: 'text-white font-medium',
          profileSectionItemValue: 'text-slate-200',
          connectedAccount: 'text-white',
          connectedAccountName: 'text-white font-semibold',
          connectedAccountProvider: 'text-slate-300',
          connectedAccountIcon: 'brightness-100 opacity-100 filter-none',
          avatarImageActionsUpload: 'text-white bg-slate-800 hover:bg-slate-700',
          avatarImageActionsRemove: 'text-red-400 hover:text-red-300',
          breadcrumbs: 'text-slate-300',
          breadcrumbsItem: 'text-slate-300 hover:text-white',
          breadcrumbsItemDivider: 'text-slate-600',
          avatarBox: 'border-2 border-slate-700',
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
