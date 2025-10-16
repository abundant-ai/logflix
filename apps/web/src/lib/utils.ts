import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Sanitizes status strings by removing special characters and formatting
 */
export function sanitizeStatus(status: string): string {
  return status
    .replace(/[_\-\.]+/g, ' ')  // Replace _, -, . with spaces
    .trim()
    .toUpperCase();
}
