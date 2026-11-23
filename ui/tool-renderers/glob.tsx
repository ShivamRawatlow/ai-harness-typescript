import React from "react";
import { Text, Box } from "ink";
import { theme } from "../theme.js";
import { ToolCallCompletePanelProps } from "../tool-complete-panel.js";
import { ToolContentRenderer } from "./types.js";
import { displayPathRelToCwd } from "../../utils/paths.js";

const MAX_DISPLAY = 30;

export const globRenderer: ToolContentRenderer = {
  async prepare() {
    return {};
  },

  render(props) {
    const { success, output, error, metadata, cwd } = props;

    if (!success) {
      return (
        <Box flexDirection="column">
          <Text {...theme.error}>{error ?? output}</Text>
        </Box>
      );
    }

    const matchCount =
      typeof metadata.matches === "number" ? metadata.matches : null;
    const searchPath =
      typeof metadata.path === "string" ? metadata.path : null;

    const statsLine = [
      matchCount !== null
        ? `${matchCount} file${matchCount !== 1 ? "s" : ""} matched`
        : null,
      searchPath ? displayPathRelToCwd(searchPath, cwd) : null,
    ]
      .filter(Boolean)
      .join(" • ");

    if (matchCount === 0) {
      return (
        <Box flexDirection="column">
          <Text {...theme.muted}>{statsLine}</Text>
          <Text {...theme.muted}>(no files matched)</Text>
        </Box>
      );
    }

    const allLines = output.trimEnd().split("\n");
    const isLimited = allLines[allLines.length - 1]?.startsWith("...(limited");
    const fileLines = isLimited ? allLines.slice(0, -1) : allLines;
    const visible = fileLines.slice(0, MAX_DISPLAY);
    const clipped = fileLines.length > MAX_DISPLAY;

    return (
      <Box flexDirection="column">
        <Text {...theme.muted}>{statsLine}</Text>
        {visible.map((line, i) => (
          <Text key={i} {...theme.code} wrap="truncate">
            {line}
          </Text>
        ))}
        {clipped && (
          <Text {...theme.muted}>… ({fileLines.length - MAX_DISPLAY} more)</Text>
        )}
        {isLimited && (
          <Text {...theme.warning}>limited to 1000 results</Text>
        )}
      </Box>
    );
  },
};
