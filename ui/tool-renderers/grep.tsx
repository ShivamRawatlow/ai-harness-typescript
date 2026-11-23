import React from "react";
import { Text, Box } from "ink";
import { theme } from "../theme.js";
import { ToolCallCompletePanelProps } from "../tool-complete-panel.js";
import { ToolContentRenderer } from "./types.js";
import { displayPathRelToCwd } from "../../utils/paths.js";

const GREP_MAX_LINES = 30;

export const grepRenderer: ToolContentRenderer = {
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
    const filesSearched =
      typeof metadata.files_searched === "number"
        ? metadata.files_searched
        : null;
    const searchPath =
      typeof metadata.path === "string" ? metadata.path : null;

    const statsLine = [
      matchCount !== null
        ? `${matchCount} match${matchCount !== 1 ? "es" : ""}`
        : null,
      filesSearched !== null
        ? `${filesSearched} file${filesSearched !== 1 ? "s" : ""} searched`
        : null,
      searchPath ? displayPathRelToCwd(searchPath, cwd) : null,
    ]
      .filter(Boolean)
      .join(" • ");

    if (matchCount === 0) {
      return (
        <Box flexDirection="column">
          <Text {...theme.muted}>{statsLine}</Text>
          <Text {...theme.muted}>(no matches)</Text>
        </Box>
      );
    }

    const rawLines = output.trimEnd().split("\n");
    let visibleCount = 0;
    const clipped = rawLines.length > GREP_MAX_LINES;
    const visible = rawLines.slice(0, GREP_MAX_LINES);

    return (
      <Box flexDirection="column">
        <Text {...theme.muted}>{statsLine}</Text>
        {visible.map((line, i) => {
          if (line.startsWith("=== ") && line.endsWith(" ===")) {
            const filePath = line.slice(4, -4);
            return (
              <Box key={i} marginTop={visibleCount++ === 0 ? 0 : 1}>
                <Text {...theme.info}>{filePath}</Text>
              </Box>
            );
          }
          if (line === "") return null;
          const colonIdx = line.indexOf(":");
          const lineNo = colonIdx !== -1 ? line.slice(0, colonIdx) : null;
          const lineContent =
            colonIdx !== -1 ? line.slice(colonIdx + 1) : line;
          return (
            <Box key={i}>
              {lineNo && (
                <Text {...theme.muted}>
                  {lineNo.padStart(4)}
                  {"│"}
                </Text>
              )}
              <Text {...theme.code} wrap="truncate">
                {lineContent}
              </Text>
            </Box>
          );
        })}
        {clipped && (
          <Text {...theme.muted}>
            … ({rawLines.length - GREP_MAX_LINES} more lines)
          </Text>
        )}
      </Box>
    );
  },
};
