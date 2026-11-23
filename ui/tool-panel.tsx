import React from "react";
import { Text, Box } from "ink";
import { displayPathRelToCwd } from "../utils/paths.js";
import { theme, toolKindThemeKey } from "./theme.js";

export const BOX_WIDTH = 72;

// ---------------------------------------------------------------------------
// ArgsTable helpers
// ---------------------------------------------------------------------------

const PREFERRED_ORDER: Record<string, string[]> = {
  read_file: ["path", "offset", "limit"],
  write_file: ["path", "create_directories", "content"],
  edit: ["path", "replace_all", "old_string", "new_string"],
  shell: ["command", "timeout", "cwd"],
  list_dir: ["path", "include_hidden"],
  grep: ["path", "case_insensitive", "pattern"],
  glob: ["path", "pattern"],
  todos: ["id", "action", "content"],
  memory: ["action", "key", "value"],
  web_search: ["query", "max_results"],
};

const SUBAGENT_PREFIX = "subagent_";

const resolvePreferredOrder = (toolName: string): string[] => {
  if (toolName in PREFERRED_ORDER) return PREFERRED_ORDER[toolName];
  if (toolName.startsWith(SUBAGENT_PREFIX)) return ["goal"];
  return [];
};

const orderedArgs = (
  toolName: string,
  args: Record<string, unknown>,
): [string, unknown][] => {
  const preferred = resolvePreferredOrder(toolName);
  const seen = new Set<string>();
  const result: [string, unknown][] = [];

  for (const key of preferred) {
    if (key in args) {
      result.push([key, args[key]]);
      seen.add(key);
    }
  }

  for (const key of Object.keys(args)) {
    if (!seen.has(key)) result.push([key, args[key]]);
  }

  return result;
};

const CONTENT_KEYS = new Set(["content", "old_string", "new_string"]);
const PATH_KEYS = new Set(["path", "cwd"]);

const formatArgValue = (key: string, value: unknown, cwd?: string): string => {
  if (typeof value === "boolean") return String(value);
  if (typeof value === "string") {
    if (CONTENT_KEYS.has(key)) {
      const lineCount = value.split("\n").length;
      const byteCount = Buffer.byteLength(value, "utf8");
      return `<${lineCount} lines • ${byteCount} bytes>`;
    }
    if (PATH_KEYS.has(key)) {
      return displayPathRelToCwd(value, cwd);
    }
    return value;
  }
  return JSON.stringify(value);
};

// ---------------------------------------------------------------------------
// ArgsTable
// ---------------------------------------------------------------------------

type ArgsTableProps = {
  toolName: string;
  args: Record<string, unknown>;
  cwd?: string;
};

export const ArgsTable = ({ toolName, args, cwd }: ArgsTableProps) => (
  <Box flexDirection="column">
    {orderedArgs(toolName, args).map(([key, value]) => (
      <Box key={key}>
        <Text {...theme.muted}>{key.padEnd(16)}</Text>
        <Text {...theme.code} wrap="truncate">
          {formatArgValue(key, value, cwd)}
        </Text>
      </Box>
    ))}
  </Box>
);

// ---------------------------------------------------------------------------
// ToolPanelShell — shared border box for start + complete panels
// ---------------------------------------------------------------------------

type ToolPanelShellProps = {
  callId: string;
  kind?: string;
  titleLeft: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
};

export const ToolPanelShell = ({
  callId,
  kind,
  titleLeft,
  footer,
  children,
}: ToolPanelShellProps) => {
  const kindTheme = theme[toolKindThemeKey(kind)];
  const borderColor = "color" in kindTheme ? kindTheme.color : undefined;
  const shortId = "#" + callId.slice(0, 8);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={borderColor}
      marginTop={1}
      paddingX={1}
      width={BOX_WIDTH}
    >
      <Box justifyContent="space-between">
        <Box gap={1}>{titleLeft}</Box>
        <Text {...theme.muted}>{shortId}</Text>
      </Box>

      <Text {...theme.border}>{"─".repeat(BOX_WIDTH - 4)}</Text>

      {children}

      <Box justifyContent="flex-end">{footer}</Box>
    </Box>
  );
};

// ---------------------------------------------------------------------------
// ToolCallPanel (start state)
// ---------------------------------------------------------------------------

type ToolCallPanelProps = {
  callId: string;
  name: string;
  kind?: string;
  args: Record<string, unknown>;
  cwd?: string;
};

export const ToolCallPanel = ({
  callId,
  name,
  kind,
  args,
  cwd,
}: ToolCallPanelProps) => {
  const argEntries = Object.entries(args);
  return (
    <ToolPanelShell
      callId={callId}
      kind={kind}
      titleLeft={<Text {...theme.tool}>{name}</Text>}
      footer={<Text {...theme.muted}>running</Text>}
    >
      {argEntries.length === 0 ? (
        <Text {...theme.muted}>(no args)</Text>
      ) : (
        <ArgsTable toolName={name} args={args} cwd={cwd} />
      )}
    </ToolPanelShell>
  );
};
