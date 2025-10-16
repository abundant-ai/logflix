/**
 * Date formatting utilities for consistent date display across the application
 */

/**
 * Formats a date string to a localized full date and time string
 * @example "1/15/2025, 3:45:30 PM"
 */
export function formatDate(dateString: string | Date): string {
  return new Date(dateString).toLocaleString();
}

/**
 * Formats a date string to a localized date only (no time)
 * @example "1/15/2025"
 */
export function formatDateShort(dateString: string | Date): string {
  return new Date(dateString).toLocaleDateString();
}

/**
 * Formats a date with custom options
 */
export function formatDateTime(
  dateString: string | Date,
  options?: Intl.DateTimeFormatOptions
): string {
  return new Date(dateString).toLocaleString(undefined, options);
}

/**
 * Formats a date as "Mon Jan 15" format
 */
export function formatDateCompact(dateString: string | Date): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Formats time as "3:45 PM" format
 */
export function formatTime(dateString: string | Date): string {
  return new Date(dateString).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * Formats duration from seconds to human-readable string
 * @example formatDuration(185) => "3m 5s"
 */
export function formatDuration(secs: number): string {
  if (secs <= 0) {
    return "0m 0s";
  }

  const hours = Math.floor(secs / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  const remainingSecs = secs % 60;

  if (hours > 0) {
    return `${hours}h ${mins}m ${remainingSecs}s`;
  }
  return `${mins}m ${remainingSecs}s`;
}
