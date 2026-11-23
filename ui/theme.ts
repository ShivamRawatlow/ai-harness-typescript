import { ToolKind } from "../tools/base.js";

export const theme = {
  info: { color: "cyan" },
  warning: { color: "yellow" },
  error: { color: "redBright", bold: true },
  success: { color: "green" },
  dim: { dimColor: true },
  muted: { color: "gray" },
  border: { color: "gray" },
  highlight: { color: "cyan", bold: true },
  // Roles
  user: { color: "blueBright", bold: true },
  assistant: { color: "whiteBright" },
  // Tools
  tool: { color: "magentaBright", bold: true },
  toolRead: { color: "cyan" },
  toolWrite: { color: "yellow" },
  toolShell: { color: "magenta" },
  toolNetwork: { color: "blueBright" },
  toolMemory: { color: "green" },
  toolMcp: { color: "cyanBright" },
  // Code
  code: { color: "white" },
} as const;

export const toolKindThemeKey = (
  kind: string | undefined,
): keyof typeof theme => {
  switch (kind) {
    case ToolKind.READ:
      return "toolRead";
    case ToolKind.WRITE:
      return "toolWrite";
    case ToolKind.SHELL:
      return "toolShell";
    case ToolKind.NETWORK:
      return "toolNetwork";
    case ToolKind.MEMORY:
      return "toolMemory";
    case ToolKind.MCP:
      return "toolMcp";
    default:
      return "tool";
  }
};
