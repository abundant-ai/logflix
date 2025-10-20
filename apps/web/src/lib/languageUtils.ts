/**
 * Language mapping for syntax highlighting
 * Maps file extensions to language identifiers for react-syntax-highlighter
 */
export const LANGUAGE_MAP: Record<string, string> = {
  'py': 'python',
  'js': 'javascript',
  'jsx': 'jsx',
  'ts': 'typescript',
  'tsx': 'tsx',
  'json': 'json',
  'yaml': 'yaml',
  'yml': 'yaml',
  'md': 'markdown',
  'sh': 'bash',
  'bash': 'bash',
  'java': 'java',
  'cpp': 'cpp',
  'c': 'c',
  'go': 'go',
  'rs': 'rust',
  'rb': 'ruby',
  'php': 'php',
  'html': 'html',
  'css': 'css',
  'sql': 'sql',
  'xml': 'xml'
};

/**
 * Detects programming language from file path extension
 * @param filePath - Path to the file
 * @returns Language identifier for syntax highlighting, defaults to 'text' if unknown
 */
export const getLanguageFromFile = (filePath: string): string => {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  return LANGUAGE_MAP[ext] || 'text';
};
