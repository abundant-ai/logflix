// GitHub OAuth token utilities and repository sync logic
import { ORGANIZATION, REPOSITORIES } from "./config";

export interface GitHubRepository {
  name: string;
  full_name: string;
  private: boolean;
  permissions?: {
    admin: boolean;
    push: boolean;
    pull: boolean;
  };
}

export interface GitHubTokenInfo {
  token: string;
  scopes?: string[];
}

/**
 * Fetch all repositories the user has access to in the organization
 * Uses GitHub API with user's OAuth token
 */
export async function fetchUserGitHubRepositories(
  accessToken: string,
  organization: string = ORGANIZATION
): Promise<string[]> {
  try {
    // Fetch user's repositories in the organization
    const response = await fetch(
      `https://api.github.com/orgs/${organization}/repos?per_page=100`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "LogFlix-App",
        },
      }
    );

    if (!response.ok) {
      console.error(`GitHub API error: ${response.status} ${response.statusText}`);
      const errorBody = await response.text();
      console.error(`Response body: ${errorBody}`);
      throw new Error(`Failed to fetch GitHub repositories: ${response.statusText}`);
    }

    const repos = (await response.json()) as GitHubRepository[];

    // Filter to only include repositories that are in our REPOSITORIES config
    // This ensures we only grant access to repos we're actually tracking
    const configuredRepoNames = REPOSITORIES.map((r) => r.name);
    const accessibleRepos = repos
      .filter((repo) => configuredRepoNames.includes(repo.name))
      .map((repo) => repo.name);

    console.log(`User has access to ${accessibleRepos.length} configured repositories:`, accessibleRepos);

    return accessibleRepos;
  } catch (error) {
    console.error("Error fetching GitHub repositories:", error);
    throw error;
  }
}

/**
 * Fetch user's organization membership to determine role
 */
export async function fetchUserOrgMembership(
  accessToken: string,
  organization: string = ORGANIZATION,
  username: string
): Promise<{ role: "admin" | "member" | null }> {
  try {
    const response = await fetch(
      `https://api.github.com/orgs/${organization}/memberships/${username}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "LogFlix-App",
        },
      }
    );

    if (response.status === 404) {
      // User is not a member of the organization
      return { role: null };
    }

    if (!response.ok) {
      console.error(`GitHub API error: ${response.status} ${response.statusText}`);
      throw new Error(`Failed to fetch organization membership: ${response.statusText}`);
    }

    const membership = await response.json();
    const role = membership.role === "admin" ? "admin" : "member";

    console.log(`User ${username} is ${role} in ${organization}`);

    return { role };
  } catch (error) {
    console.error("Error fetching organization membership:", error);
    throw error;
  }
}

/**
 * Determine if a user should be an admin based on GitHub org role
 */
export function shouldBeAdmin(githubOrgRole: "admin" | "member" | null): boolean {
  return githubOrgRole === "admin";
}
