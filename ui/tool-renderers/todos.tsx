import React from "react";
import { Text, Box } from "ink";
import { theme } from "../theme.js";
import { ToolCallCompletePanelProps } from "../tool-complete-panel.js";
import { ToolContentRenderer } from "./types.js";

export const todosRenderer: ToolContentRenderer = {
  async prepare() {
    return {};
  },

  render(props) {
    const { success, output, error } = props;

    if (!success) {
      return (
        <Box flexDirection="column">
          <Text {...theme.error}>{error ?? output}</Text>
        </Box>
      );
    }

    if (output.startsWith("Todos:")) {
      const lines = output.split("\n").slice(1);
      return (
        <Box flexDirection="column">
          <Text {...theme.muted}>{lines.length} pending</Text>
          {lines.map((line, i) => {
            const match = line.match(/^\s*\[([^\]]+)\]\s+(.+)/);
            if (!match) return null;
            const [, id, content] = match;
            return (
              <Box key={i} gap={1}>
                <Text {...theme.muted}>☐</Text>
                <Text {...theme.code}>{content}</Text>
                <Text {...theme.muted}>[{id}]</Text>
              </Box>
            );
          })}
        </Box>
      );
    }

    if (output.startsWith("Completed")) {
      const match = output.match(/^Completed todo \[[^\]]+\]: (.+)/);
      const content = match?.[1] ?? output;
      return (
        <Box gap={1}>
          <Text {...theme.success}>☑</Text>
          <Text {...theme.code}>{content}</Text>
        </Box>
      );
    }

    const isAdd = output.startsWith("Added");
    const textTheme = isAdd ? theme.highlight : theme.muted;
    return (
      <Box>
        <Text {...textTheme}>{output}</Text>
      </Box>
    );
  },
};
