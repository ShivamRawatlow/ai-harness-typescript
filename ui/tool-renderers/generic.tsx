import React from "react";
import { Text, Box } from "ink";
import { theme } from "../theme.js";
import { ToolCallCompletePanelProps } from "../tool-complete-panel.js";
import { ToolContentRenderer } from "./types.js";

export const genericRenderer: ToolContentRenderer = {
  async prepare() {
    return {};
  },

  render(props) {
    const { output } = props;
    const lines = output.trimEnd().split("\n").slice(0, 10);
    const clipped = output.split("\n").length > 10;
    return (
      <Box flexDirection="column">
        {lines.map((line, i) => (
          <Text key={i} {...theme.code} wrap="truncate">
            {line}
          </Text>
        ))}
        {clipped && <Text {...theme.muted}>…</Text>}
      </Box>
    );
  },
};
