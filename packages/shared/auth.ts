/**
 * Authentication and Authorization Types
 * Shared between frontend and backend for consistent RBAC implementation
 */

// User roles in the system
export enum UserRole {
  ADMIN = 'admin',
  MEMBER = 'member',
}

// Permissions that can be granted to users
export enum Permission {
  // Repository permissions
  VIEW_ALL_REPOS = 'view:all_repos',
  VIEW_ASSIGNED_REPOS = 'view:assigned_repos',

  // Admin permissions
  MANAGE_USERS = 'manage:users',
  MANAGE_PERMISSIONS = 'manage:permissions',
  MANAGE_ORGANIZATIONS = 'manage:organizations',
}

// Role to permissions mapping
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.ADMIN]: [
    Permission.VIEW_ALL_REPOS,
    Permission.MANAGE_USERS,
    Permission.MANAGE_PERMISSIONS,
    Permission.MANAGE_ORGANIZATIONS,
  ],
  [UserRole.MEMBER]: [
    Permission.VIEW_ASSIGNED_REPOS,
  ],
};

// User metadata structure stored in Clerk
export interface UserMetadata {
  role: UserRole;
  assignedRepositories?: string[]; // Format: "owner/repo"
  organizationId?: string;
  lastGitHubSync?: string; // ISO timestamp of last GitHub sync
}

// Clerk Organization public metadata structure
// This is configured in Clerk Dashboard for each organization
export interface ClerkOrganizationMetadata {
  githubOrganization: string; // The GitHub organization name to sync repos from
  defaultWorkflow?: string;   // Default workflow file name (e.g., "test-tasks.yaml")
}

// Auth context for requests
export interface AuthContext {
  userId: string;
  role: UserRole;
  permissions: Permission[];
  assignedRepositories: string[];
  organizationId?: string;
  organizationMetadata?: ClerkOrganizationMetadata; // GitHub org settings from Clerk
}

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/**
 * Check if a user has access to a specific repository
 */
export function canAccessRepository(
  role: UserRole,
  assignedRepositories: string[],
  targetRepo: string
): boolean {
  // Admin has access to all repositories
  if (role === UserRole.ADMIN) {
    return true;
  }

  // Members can only access assigned repositories
  // Support both "owner/repo" and "repo" formats for flexibility
  const targetRepoName = targetRepo.includes('/') ? targetRepo.split('/')[1] : targetRepo;

  return assignedRepositories.some(assigned => {
    const assignedName = assigned.includes('/') ? assigned.split('/')[1] : assigned;
    // Match either exact full format or just the repo name
    return assigned === targetRepo || assignedName === targetRepoName;
  });
}

/**
 * Get all permissions for a role
 */
export function getPermissionsForRole(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role] || [];
}

/**
 * Validate if a string is a valid role
 */
export function isValidRole(role: string): role is UserRole {
  return Object.values(UserRole).includes(role as UserRole);
}

/**
 * Parse repository identifier into owner and repo
 */
export function parseRepositoryId(repoId: string): { owner: string; repo: string } | null {
  const parts = repoId.split('/');
  if (parts.length !== 2) {
    return null;
  }
  return { owner: parts[0], repo: parts[1] };
}

/**
 * Format repository identifier from owner and repo
 */
export function formatRepositoryId(owner: string, repo: string): string {
  return `${owner}/${repo}`;
}
