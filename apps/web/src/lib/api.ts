/**
 * API utility functions for making GitHub API requests
 */

/**
 * Creates URLSearchParams with consistent base parameters for GitHub API calls
 */
export function createAPIParams(
  base: {
    owner: string;
    repo: string;
    workflow?: string;
  },
  additionalParams?: Record<string, string>
): URLSearchParams {
  return new URLSearchParams({
    owner: base.owner,
    repo: base.repo,
    ...(base.workflow && { workflow: base.workflow }),
    ...additionalParams,
  });
}

/**
 * Generic fetch helper with error handling
 */
export async function fetchAPI<T>(url: string): Promise<T> {
  const response = await fetch(url);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({
      error: response.statusText
    }));
    throw new Error(errorData.error || `Failed to fetch: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch helper with query parameters
 */
export async function fetchAPIWithParams<T>(
  url: string,
  params: URLSearchParams
): Promise<T> {
  return fetchAPI<T>(`${url}?${params}`);
}
