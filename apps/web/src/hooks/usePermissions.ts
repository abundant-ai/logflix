import { useQuery } from "@tanstack/react-query";
import { useUser } from "@clerk/clerk-react";
import { UserRole, Permission, AuthContext, hasPermission } from "@logflix/shared/auth";

interface UserPermissions {
  userId: string | null;
  role: UserRole;
  permissions: Permission[];
  assignedRepositories: string[];
  organizationId?: string;
  isAdmin: boolean;
  isMember: boolean;
  hasAllAccess: boolean;
  canAccessRepository: (repo: string) => boolean;
  hasPermission: (permission: Permission) => boolean;
}

/**
 * Hook to get current user's permissions and role
 */
export function usePermissions(): UserPermissions & { isLoading: boolean; error: Error | null } {
  const { isSignedIn, user } = useUser();

  const { data, isLoading, error } = useQuery<AuthContext>({
    queryKey: ["userPermissions", user?.id],
    queryFn: async () => {
      const response = await fetch("/api/user/permissions", {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch user permissions");
      }

      return response.json();
    },
    enabled: isSignedIn,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: 2,
  });

  // Default permissions for non-authenticated users or loading state
  const defaultPermissions: UserPermissions = {
    userId: null,
    role: UserRole.MEMBER,
    permissions: [],
    assignedRepositories: [],
    isAdmin: false,
    isMember: true,
    hasAllAccess: false,
    canAccessRepository: () => false,
    hasPermission: () => false,
  };

  if (!isSignedIn || isLoading || !data) {
    return {
      ...defaultPermissions,
      isLoading,
      error: error as Error | null,
    };
  }

  const isAdmin = data.role === UserRole.ADMIN;
  const isMember = data.role === UserRole.MEMBER;

  return {
    userId: data.userId,
    role: data.role,
    permissions: data.permissions,
    assignedRepositories: data.assignedRepositories,
    organizationId: data.organizationId,
    isAdmin,
    isMember,
    hasAllAccess: isAdmin,
    canAccessRepository: (repo: string) => {
      if (isAdmin) return true;
      return data.assignedRepositories.includes(repo);
    },
    hasPermission: (permission: Permission) => {
      return hasPermission(data.role, permission);
    },
    isLoading,
    error: error as Error | null,
  };
}

/**
 * Hook to get user's accessible repositories
 */
export function useAccessibleRepositories() {
  const { isSignedIn } = useUser();

  return useQuery<{ hasAllAccess: boolean; repositories: string[] }>({
    queryKey: ["accessibleRepositories"],
    queryFn: async () => {
      const response = await fetch("/api/user/repositories", {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch accessible repositories");
      }

      return response.json();
    },
    enabled: isSignedIn,
    staleTime: 5 * 60 * 1000,
  });
}
