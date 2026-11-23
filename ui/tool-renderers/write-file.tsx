import React from "react";
import { Text, Box } from "ink";
import { theme } from "../theme.js";
import { BOX_WIDTH } from "../tool-panel.js";
import { ToolCallCompletePanelProps } from "../tool-complete-panel.js";
import { ToolContentRenderer } from "./types.js";
import { displayPathRelToCwd } from "../../utils/paths.js";

const DIFF_MAX_LINES = 40;

const diffLineTheme = (line: string): Record<string, unknown> => {
  if (line.startsWith("+++") || line.startsWith("---")) return theme.muted;
  if (line.startsWith("+")) return theme.success;
  if (line.startsWith("-")) return theme.error;
  if (line.startsWith("@@")) return theme.info;
  return theme.code;
};

export const writeFileRenderer: ToolContentRenderer = {
  async prepare() {
    return {};
  },

  render(props) {
    const { output, metadata, diff, cwd } = props;
    const primaryPath =
      typeof metadata.path === "string" ? metadata.path : null;
    const isNewFile = metadata.is_new_file === true;
    const lineCount = metadata.lines as number | undefined;
    const byteCount = metadata.bytes as number | undefined;

    const header = primaryPath
      ? `${displayPathRelToCwd(primaryPath, cwd)}${isNewFile ? " (new)" : ""}`
      : output;
    const stats =
      lineCount !== undefined && byteCount !== undefined
        ? `${lineCount} lines • ${byteCount} bytes`
        : undefined;

    if (!diff) {
      return <Text {...theme.muted}>{header}</Text>;
    }

    const diffLines = diff.split("\n");
    const visible = diffLines.slice(0, DIFF_MAX_LINES);
    const clipped = diffLines.length > DIFF_MAX_LINES;

    return (
      <Box flexDirection="column">
        <Box gap={2}>
          <Text {...theme.muted}>{header}</Text>
          {stats && <Text {...theme.muted}>{stats}</Text>}
        </Box>
        {visible.map((line, i) => (
          <Text key={i} {...diffLineTheme(line)} wrap="truncate">
            {line}
          </Text>
        ))}
        {clipped && <Text {...theme.muted}>…</Text>}
      </Box>
    );
  },
};
