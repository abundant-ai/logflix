// GitHub OAuth token utilities and repository sync logic

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
 * Fetch all repositories the user has access to using the /user/repos endpoint
 * This includes repos accessible through team memberships, collaborator access, and ownership
 * Supports pagination to handle users with many repositories
 */
export async function fetchAllUserAccessibleRepositories(
  accessToken: string,
  organization?: string
): Promise<string[]> {
  try {
    const allRepos: GitHubRepository[] = [];
    let page = 1;
    let hasMorePages = true;

    while (hasMorePages) {
      // Use /user/repos with affiliation to get all repos the user has access to
      const response = await fetch(
        `https://api.github.com/user/repos?affiliation=organization_member,collaborator&per_page=100&page=${page}`,
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

      if (repos.length === 0) {
        hasMorePages = false;
      } else {
        allRepos.push(...repos);
        page++;
        // GitHub returns less than per_page items on the last page
        if (repos.length < 100) {
          hasMorePages = false;
        }
      }
    }

    // Filter by organization if specified
    let accessibleRepos = allRepos;
    if (organization) {
      accessibleRepos = allRepos.filter((repo) =>
        repo.full_name.startsWith(`${organization}/`)
      );
    }

    const repoFullNames = accessibleRepos.map((repo) => repo.full_name);

    return repoFullNames;
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
  organization: string,
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

    const membership = await response.json() as { role: string };
    const role = membership.role === "admin" ? "admin" : "member";

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
