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
        /**
         * Clerk Component Styling Strategy
         *
         * PRIMARY: This appearance configuration controls all Clerk component styling
         * - Uses design system tokens for consistency with app theme
         * - Comprehensive element-level customization
         *
         * SECONDARY: Minimal CSS overrides in index.css (ONLY for edge cases)
         * - GitHub icon SVG filter (appearance API can't control this)
         * - See index.css for documented exceptions
         *
         * When updating Clerk styles, modify THIS object first.
         * Only add CSS overrides if absolutely necessary.
         */
        baseTheme: undefined,
        variables: {
          colorPrimary: 'hsl(210, 100%, 45%)',
          colorBackground: 'hsl(220, 13%, 16%)',
          colorInputBackground: 'hsl(220, 13%, 19%)',
          colorInputText: 'hsl(220, 8%, 95%)',
          colorText: 'hsl(220, 8%, 95%)',
          colorTextSecondary: 'hsl(220, 8%, 65%)',
          colorDanger: 'hsl(0, 75%, 60%)',
          colorSuccess: 'hsl(142, 76%, 36%)',
          colorWarning: 'hsl(38, 92%, 50%)',
          borderRadius: '8px',
        },
        elements: {
          card: 'bg-card shadow-2xl border border-border backdrop-blur-xl',
          rootBox: 'mx-auto',
          headerTitle: 'text-foreground text-3xl font-bold tracking-tight',
          headerSubtitle: 'text-muted-foreground text-base',
          socialButtonsBlockButton: 'border-2 border-border hover:border-primary bg-card hover:bg-accent text-foreground font-semibold transition-all shadow-xl backdrop-blur-sm hover:shadow-2xl hover:scale-[1.02]',
          socialButtonsBlockButtonText: 'text-foreground font-bold text-base tracking-wide',
          socialButtonsBlockButtonArrow: 'text-foreground opacity-100',
          socialButtonsProviderIcon: 'brightness-100 contrast-100 saturate-100 opacity-100',
          socialButtonsIconButton: 'border-2 border-border bg-card hover:bg-accent',
          formButtonPrimary: 'bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-xl shadow-primary/40 transition-all hover:shadow-2xl hover:shadow-primary/50 hover:scale-[1.02]',
          footerActionLink: 'text-primary hover:text-primary/80 font-semibold',
          formFieldInput: 'bg-input border-2 border-border focus:border-primary text-foreground placeholder-muted-foreground transition-colors',
          formFieldLabel: 'text-foreground font-semibold text-sm',
          dividerLine: 'bg-border',
          dividerText: 'text-muted-foreground font-medium',
          identityPreviewText: 'text-foreground font-medium',
          identityPreviewEditButton: 'text-primary hover:text-primary/80',
          formFieldInputShowPasswordButton: 'text-muted-foreground hover:text-foreground',
          userButtonBox: 'shadow-lg',
          userButtonTrigger: 'focus:shadow-none',
          userButtonPopoverCard: 'bg-card border-2 border-border shadow-2xl',
          userButtonPopoverActionButton: 'text-foreground hover:text-foreground hover:bg-muted',
          userButtonPopoverActionButtonText: 'text-foreground font-medium',
          userButtonPopoverActionButtonIcon: 'text-muted-foreground',
          userButtonPopoverFooter: 'hidden',
          userPreviewTextContainer: 'text-foreground',
          userPreviewMainIdentifier: 'text-foreground font-semibold text-base',
          userPreviewSecondaryIdentifier: 'text-muted-foreground font-normal',
          profileSectionPrimaryButton: 'text-primary hover:text-primary/80 font-semibold',
          profileSectionTitle: 'text-foreground font-semibold text-base',
          profileSectionContent: 'text-foreground',
          accordionTriggerButton: 'text-foreground hover:text-foreground',
          accordionContent: 'text-foreground',
          navbarButton: 'text-foreground hover:bg-muted',
          navbarButtonIcon: 'text-foreground',
          pageScrollBox: 'bg-background',
          modalContent: 'bg-card border border-border',
          modalCloseButton: 'text-muted-foreground hover:text-foreground',
          alertText: 'text-foreground',
          formFieldSuccessText: 'text-success',
          formFieldErrorText: 'text-destructive',
          formHeaderTitle: 'text-foreground font-semibold',
          formHeaderSubtitle: 'text-muted-foreground',
          badge: 'bg-primary/20 text-primary border border-primary/30 font-medium',
          badgeSecondary: 'bg-secondary text-secondary-foreground border border-border',
          profileSection: 'text-foreground',
          profileSectionSubtitle: 'text-muted-foreground',
          profileSectionItemTitle: 'text-foreground font-medium',
          profileSectionItemValue: 'text-foreground',
          connectedAccount: 'text-foreground',
          connectedAccountName: 'text-foreground font-semibold',
          connectedAccountProvider: 'text-muted-foreground',
          connectedAccountIcon: 'brightness-100 opacity-100 filter-none',
          avatarImageActionsUpload: 'text-foreground bg-secondary hover:bg-secondary/80',
          avatarImageActionsRemove: 'text-destructive hover:text-destructive/80',
          breadcrumbs: 'text-muted-foreground',
          breadcrumbsItem: 'text-muted-foreground hover:text-foreground',
          breadcrumbsItemDivider: 'text-border',
          avatarBox: 'border-2 border-border',
          tableHead: 'bg-muted text-foreground font-semibold',
          table: 'text-foreground',
          organizationSwitcherTrigger: 'bg-card text-foreground border border-border hover:bg-accent',
          organizationPreviewMainIdentifier: 'text-foreground font-medium',
          organizationPreviewSecondaryIdentifier: 'text-muted-foreground',
          // Tab styling
          tabButton: 'text-foreground hover:text-foreground',
          tabButton__active: 'text-primary border-b-2 border-primary',
          tabListContainer: 'text-foreground',
          tabPanel: 'text-foreground',
          tabListContainerButton: 'text-foreground hover:text-primary',
          tabListContainerButton__active: 'text-primary',
          tabBadge: 'text-muted-foreground',
          // Role badges and status indicators
          membersPageInvitationsTab: 'text-foreground',
          membersPageInvitationsTabBadge: 'text-muted-foreground',
          organizationMembersTab: 'text-foreground',
          organizationMembersTabBadge: 'text-muted-foreground',
          // Organization members page specific
          membersList: 'text-foreground',
          membersListItem: 'text-foreground',
          membersPageInviteButton: 'bg-primary text-primary-foreground hover:bg-primary/90',
          // Search styling
          formFieldInput__organizationMembers: 'bg-input border border-border text-foreground placeholder-muted-foreground',
          formFieldInputGroup: 'text-foreground',
          searchInputContainer: 'bg-input border border-border',
          searchInput: 'bg-input text-foreground placeholder-muted-foreground',
          // Organization list and connected accounts
          userPreview: 'text-foreground',
          organizationPreview: 'text-foreground',
          organizationPreviewAvatarContainer: 'border border-border',
          // Additional element styling for visibility
          selectButton: 'text-foreground bg-card border border-border hover:bg-accent',
          selectOption: 'text-foreground hover:bg-accent',
          selectOptionsContainer: 'bg-card border border-border',
          menuButton: 'text-foreground hover:bg-muted',
          menuItem: 'text-foreground hover:bg-muted',
          menuList: 'bg-card border border-border',
          main: 'text-foreground',
          navbar: 'bg-card text-foreground',
          navbarMobileMenuRow: 'text-foreground hover:bg-muted',
          otpCodeFieldInput: 'bg-input border border-border text-foreground',
          // Fix for icons and images - ensure visibility
          providerIcon: 'brightness-100 invert-0 filter-none opacity-100',
          providerIcon__github: 'brightness-100 invert-0 opacity-100 contrast-100',
          avatarImage: 'brightness-100 opacity-100',
          // Table and list text elements
          tableText: 'text-foreground',
          tableCellText: 'text-foreground',
          tableCell: 'text-foreground',
          paginationButton: 'text-foreground hover:bg-muted',
          paginationButtonNext: 'text-foreground hover:bg-muted',
          paginationButtonPrevious: 'text-foreground hover:bg-muted',
          paginationRowText: 'text-foreground',
          // Ensure all text content is visible
          userPreviewAvatarContainer: 'border border-border',
          identityPreview: 'text-foreground',
          identityPreviewAvatarContainer: 'border border-border',
          // Organization members specific elements
          organizationList: 'text-foreground',
          organizationListItem: 'text-foreground hover:bg-muted',
          invitationButton: 'text-primary hover:text-primary/80',
          membershipRole: 'text-foreground',
          membershipRole__admin: 'text-primary',
          membershipRole__member: 'text-foreground',
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
