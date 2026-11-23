import path from "path";
import {
  getSingletonHighlighter,
  type ThemedToken,
  type BundledLanguage,
} from "shiki";

// ---------------------------------------------------------------------------
// Singleton highlighter — initialised once on first use
// ---------------------------------------------------------------------------

const THEME = "github-dark";

const LANGS = [
  "typescript",
  "tsx",
  "javascript",
  "jsx",
  "json",
  "toml",
  "yaml",
  "markdown",
  "bash",
  "rust",
  "go",
  "java",
  "kotlin",
  "swift",
  "c",
  "cpp",
  "css",
  "html",
  "xml",
  "sql",
  "python",
] as const;

let highlighterPromise: ReturnType<typeof getSingletonHighlighter> | null =
  null;

const getHighlighter = () => {
  if (!highlighterPromise) {
    highlighterPromise = getSingletonHighlighter({
      themes: [THEME],
      langs: [...LANGS],
    });
  }
  return highlighterPromise;
};

// ---------------------------------------------------------------------------
// Language detection from file extension
// ---------------------------------------------------------------------------

const EXT_MAP: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "tsx",
  ".js": "javascript",
  ".jsx": "jsx",
  ".json": "json",
  ".toml": "toml",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".md": "markdown",
  ".sh": "bash",
  ".bash": "bash",
  ".zsh": "bash",
  ".rs": "rust",
  ".go": "go",
  ".java": "java",
  ".kt": "kotlin",
  ".swift": "swift",
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
  ".hpp": "cpp",
  ".css": "css",
  ".html": "html",
  ".xml": "xml",
  ".sql": "sql",
  ".py": "python",
};

export const guessLanguage = (filePath: string | null): string => {
  if (!filePath) return "text";
  const ext = path.extname(filePath).toLowerCase();
  return EXT_MAP[ext] ?? "text";
};

// ---------------------------------------------------------------------------
// Hex colour → ANSI truecolour escape
// ---------------------------------------------------------------------------

const FontStyle = {
  Bold: 1,
  Italic: 2,
  Underline: 4,
} as const;

const hexToAnsi = (hex: string): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
};

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const ITALIC = "\x1b[3m";
const UNDERLINE = "\x1b[4m";

const renderToken = (token: ThemedToken): string => {
  if (!token.color) return token.content;
  let prefix = hexToAnsi(token.color);
  if (token.fontStyle) {
    if (token.fontStyle & FontStyle.Bold) prefix += BOLD;
    if (token.fontStyle & FontStyle.Italic) prefix += ITALIC;
    if (token.fontStyle & FontStyle.Underline) prefix += UNDERLINE;
  }
  return prefix + token.content + RESET;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the code string with ANSI colour escapes applied via Shiki.
 * Falls back to the raw code string if highlighting fails or lang is "text".
 */
export const highlightCode = async (
  code: string,
  filePath: string | null,
): Promise<string[]> => {
  const lang = guessLanguage(filePath);

  if (lang === "text") return code.split("\n");

  try {
    const h = await getHighlighter();
    const { tokens } = h.codeToTokens(code, {
      lang: lang as BundledLanguage,
      theme: THEME,
    });
    return tokens.map((lineTokens) => lineTokens.map(renderToken).join(""));
  } catch {
    return code.split("\n");
  }
};
