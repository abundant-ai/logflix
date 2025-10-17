/**
 * Application-wide constants for consistent configuration
 */

/**
 * React Query cache time constants (in milliseconds)
 */
export const CACHE_TIME = {
  /** No caching - always fresh */
  NONE: 0,
  /** 1 minute - for frequently changing data */
  STALE_SHORT: 1 * 60 * 1000,
  /** 5 minutes - for moderately stable data */
  STALE_MEDIUM: 5 * 60 * 1000,
  /** 10 minutes - for stable data */
  STALE_LONG: 10 * 60 * 1000,
  /** 15 minutes - for garbage collection */
  GC_MEDIUM: 15 * 60 * 1000,
  /** 30 minutes - for long-term garbage collection */
  GC_LONG: 30 * 60 * 1000,
  /** 1 minute - for background refetch intervals */
  REFETCH_INTERVAL: 45 * 1000,
} as const;

/**
 * API request limits
 */
export const API_LIMITS = {
  /** Maximum PRs to fetch in a single request */
  MAX_PRS: 5000,
} as const;

/**
 * UI animation and timing constants
 */
export const ANIMATION = {
  /** Accordion animation duration */
  ACCORDION_DURATION: 0.2,
} as const;
