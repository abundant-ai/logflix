/**
 * ANSI escape code cleaning utilities for terminal output processing
 */

/**
 * Removes ANSI escape codes and control characters from terminal content
 * Handles CSI sequences, OSC sequences, and other terminal control codes
 *
 * @param content - Raw terminal content with ANSI codes
 * @returns Cleaned content without ANSI codes
 */
export function cleanAnsiCodes(content: string): string {
  if (!content) return '';

  // Enhanced ANSI cleaning with additional patterns for bracketed paste and cursor codes
  let cleanContent = content
    // Remove ESC sequences with parameters
    .replace(/\x1b\[[0-9;]*[mGKJHfABCDsuhl]/g, '') // Standard CSI sequences
    .replace(/\x1b\[\?[0-9;]*[hl]/g, '') // Private mode sequences (?2004h/l)
    .replace(/\x1b\[[0-9]*[ABCDEFGHIJKLMNOPQRSTUVWXYZ]/g, '') // Single letter CSI
    .replace(/\x1b[HJ]/g, '') // Direct cursor positioning (H) and erase (J)
    // Remove OSC sequences
    .replace(/\x1b\][0-9;]*.*?\x07/g, '') // OSC with BEL terminator
    .replace(/\x1b\][0-9;]*.*?\x1b\\/g, '') // OSC with ST terminator
    // Remove other escape sequences
    .replace(/\x1b[PX^_][^\x1b]*\x1b\\/g, '') // DCS, SOS, PM, APC
    .replace(/\x1b[>\=]/g, '') // Application/numeric keypad modes
    .replace(/\x1b[()][AB012]/g, '') // Character set selection
    .replace(/\x1b[#-/][0-9A-Za-z]/g, '') // Two character escape sequences
    .replace(/\x1b[NOPQRSTUVWXYZ[\\\]^_`]/g, '') // C1 control characters
    // Clean remaining control characters and formatting
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '') // Control chars except \n and \t
    .replace(/\r\n/g, '\n') // Normalize line endings
    .replace(/\r/g, '\n'); // Convert remaining CRs to LF

  // Final cleanup for readability
  cleanContent = cleanContent
    .replace(/\n{4,}/g, '\n\n\n') // Limit consecutive newlines
    .replace(/[ \t]+$/gm, '') // Remove trailing whitespace
    .replace(/^\s*\n/gm, '\n') // Remove empty lines with only whitespace
    .trimEnd();

  return cleanContent;
}
