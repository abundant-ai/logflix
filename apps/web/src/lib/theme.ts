/**
 * Unified Theme Configuration
 * Consistent colors, spacing, and styling across the application
 */

export const theme = {
  colors: {
    // Primary colors
    primary: {
      50: '#eff6ff',
      100: '#dbeafe',
      200: '#bfdbfe',
      300: '#93c5fd',
      400: '#60a5fa',
      500: '#3b82f6', // Main primary
      600: '#2563eb',
      700: '#1d4ed8',
      800: '#1e40af',
      900: '#1e3a8a',
    },

    // Background colors (dark theme)
    background: {
      primary: '#0f172a',   // slate-900
      secondary: '#1e293b', // slate-800
      tertiary: '#334155',  // slate-700
      hover: '#475569',     // slate-600
    },

    // Text colors
    text: {
      primary: '#f1f5f9',   // slate-100
      secondary: '#cbd5e1', // slate-300
      tertiary: '#94a3b8',  // slate-400
      muted: '#64748b',     // slate-500
    },

    // Border colors
    border: {
      primary: '#475569',   // slate-600
      secondary: '#334155', // slate-700
      light: '#64748b',     // slate-500
    },

    // Status colors
    status: {
      success: '#10b981',   // green-500
      warning: '#f59e0b',   // amber-500
      error: '#ef4444',     // red-500
      info: '#3b82f6',      // blue-500
    },

    // Component-specific
    card: {
      background: '#1e293b',
      border: '#334155',
      hover: '#334155',
    },

    button: {
      primary: '#3b82f6',
      primaryHover: '#2563eb',
      secondary: '#334155',
      secondaryHover: '#475569',
    },
  },

  // Spacing scale
  spacing: {
    xs: '0.25rem',   // 4px
    sm: '0.5rem',    // 8px
    md: '1rem',      // 16px
    lg: '1.5rem',    // 24px
    xl: '2rem',      // 32px
    '2xl': '3rem',   // 48px
    '3xl': '4rem',   // 64px
  },

  // Border radius
  borderRadius: {
    sm: '0.25rem',   // 4px
    md: '0.375rem',  // 6px
    lg: '0.5rem',    // 8px
    xl: '0.75rem',   // 12px
    '2xl': '1rem',   // 16px
    full: '9999px',
  },

  // Typography
  typography: {
    fontFamily: {
      sans: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    },
    fontSize: {
      xs: '0.75rem',    // 12px
      sm: '0.875rem',   // 14px
      base: '1rem',     // 16px
      lg: '1.125rem',   // 18px
      xl: '1.25rem',    // 20px
      '2xl': '1.5rem',  // 24px
      '3xl': '1.875rem', // 30px
      '4xl': '2.25rem', // 36px
    },
  },

  // Shadows
  shadows: {
    sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
    xl: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
  },

  // Z-index scale
  zIndex: {
    dropdown: 1000,
    sticky: 1020,
    fixed: 1030,
    modalBackdrop: 1040,
    modal: 1050,
    popover: 1060,
    tooltip: 1070,
  },

  // Animations
  animations: {
    fast: '150ms',
    normal: '300ms',
    slow: '500ms',
  },
} as const;

// Clerk appearance theme configuration
export const clerkTheme = {
  baseTheme: undefined,
  variables: {
    colorPrimary: theme.colors.primary[500],
    colorText: theme.colors.text.primary,
    colorTextSecondary: theme.colors.text.secondary,
    colorBackground: theme.colors.background.primary,
    colorInputBackground: theme.colors.background.secondary,
    colorInputText: theme.colors.text.primary,
  },
  elements: {
    // User button
    userButtonBox: 'flex-row-reverse',
    userButtonTrigger: 'focus:shadow-none',
    userButtonPopoverCard: `bg-gradient-to-br from-slate-900/95 to-slate-800/95 shadow-2xl border-2 border-slate-600/50 backdrop-blur-xl`,
    userButtonPopoverActionButton: 'text-slate-100 hover:bg-slate-700/50',
    userButtonPopoverActionButtonText: 'text-slate-100 font-semibold',
    userButtonPopoverActionButtonIcon: 'text-slate-300',
    userButtonPopoverFooter: 'hidden',

    // Root and layout
    rootBox: 'bg-slate-900',
    card: 'bg-slate-900 shadow-2xl border-2 border-slate-600/50',
    main: 'bg-slate-900',
    page: 'bg-slate-900',
    pageScrollBox: 'bg-slate-900',
    scrollBox: 'bg-slate-900',

    // Navigation
    navbar: 'bg-slate-900 border-slate-700',
    navbarButton: 'text-slate-200 hover:text-white hover:bg-slate-800',
    navbarButtonIcon: 'text-slate-300',
    navbarMobileMenuButton: 'text-slate-200',

    // Headers and titles
    headerTitle: 'text-white text-2xl font-bold',
    headerSubtitle: 'text-slate-300',

    // Profile sections
    profileSection: 'bg-slate-800/50 border-slate-700',
    profileSectionTitle: 'text-white font-semibold',
    profileSectionTitleText: 'text-white font-semibold',
    profileSectionSubtitle: 'text-slate-300',
    profileSectionContent: 'text-slate-200',
    profileSectionPrimaryButton: 'text-blue-400 hover:text-blue-300',

    // Form elements
    formFieldLabel: 'text-slate-200 font-semibold',
    formFieldLabelRow: 'text-slate-200',
    formFieldInput: 'bg-slate-800 border-2 border-slate-600 text-white placeholder-slate-400',
    formFieldInputShowPasswordButton: 'text-slate-300',
    formButtonPrimary: 'bg-blue-600 hover:bg-blue-500 text-white font-bold',
    formButtonReset: 'text-slate-300 hover:text-white',

    // Text elements
    formHeaderTitle: 'text-white font-bold',
    formHeaderSubtitle: 'text-slate-300',
    formResendCodeLink: 'text-blue-400 hover:text-blue-300',
    identityPreviewText: 'text-white',
    identityPreviewEditButton: 'text-blue-400 hover:text-blue-300',

    // Badges and indicators
    badge: 'bg-slate-800 text-slate-200 border-slate-600',
    badgeSecondaryText: 'text-slate-300',

    // Accordion
    accordionTriggerButton: 'text-slate-200 hover:text-white hover:bg-slate-800',
    accordionContent: 'text-slate-200',

    // Links
    footerActionLink: 'text-blue-400 hover:text-blue-300 font-semibold',
    footerActionText: 'text-slate-300',

    // Menu items
    menuList: 'bg-slate-800 border-slate-700',
    menuItem: 'text-slate-200 hover:bg-slate-700',
    menuButton: 'text-slate-200 hover:bg-slate-700',

    // Alert
    alertText: 'text-slate-200',

    // Breadcrumbs
    breadcrumbsItem: 'text-slate-300',
    breadcrumbsItemDivider: 'text-slate-500',

    // Avatar
    avatarBox: 'border-slate-600',

    // Divider
    dividerLine: 'bg-slate-700',
    dividerText: 'text-slate-400',

    // Other text elements
    otpCodeFieldInput: 'bg-slate-800 border-slate-600 text-white',
    selectButton: 'bg-slate-800 border-slate-600 text-slate-200',
    selectSearchInput: 'bg-slate-800 text-white',
    selectOption: 'text-slate-200 hover:bg-slate-700',
    tableHead: 'text-slate-300',
    avatarImageActionsUpload: 'text-blue-400',
    fileDropAreaBox: 'border-slate-600',
    fileDropAreaButtonPrimary: 'text-blue-400',
  },
};

// Type exports
export type Theme = typeof theme;
export type ThemeColor = keyof typeof theme.colors;
