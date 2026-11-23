import React from "react";
import { Text, Box } from "ink";
import { theme } from "../theme.js";
import { ToolCallCompletePanelProps } from "../tool-complete-panel.js";
import { ToolContentRenderer } from "./types.js";
import { displayPathRelToCwd } from "../../utils/paths.js";

export const listDirRenderer: ToolContentRenderer = {
  async prepare() {
    return {};
  },

  render(props) {
    const { output, metadata, cwd } = props;

    const dirPath =
      typeof metadata.path === "string" ? metadata.path : null;
    const entryCount =
      typeof metadata.entries === "number" ? metadata.entries : null;

    const header = [
      dirPath ? displayPathRelToCwd(dirPath, cwd) : null,
      entryCount !== null
        ? `${entryCount} item${entryCount !== 1 ? "s" : ""}`
        : null,
    ]
      .filter(Boolean)
      .join(" • ");

    if (output === "Directory is empty") {
      return (
        <Box flexDirection="column">
          {header && <Text {...theme.muted}>{header}</Text>}
          <Text {...theme.muted}>(empty)</Text>
        </Box>
      );
    }

    const entries = output.trimEnd().split("\n");

    return (
      <Box flexDirection="column">
        {header && <Text {...theme.muted}>{header}</Text>}
        {entries.map((entry, i) => (
          <Box key={i} gap={1}>
            <Text {...(entry.endsWith("/") ? theme.info : theme.code)}>
              {entry}
            </Text>
          </Box>
        ))}
      </Box>
    );
  },
};
