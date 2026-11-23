import React from "react";
import { Text, Box } from "ink";
import { theme } from "../theme.js";
import { ToolCallCompletePanelProps } from "../tool-complete-panel.js";
import { ToolContentRenderer } from "./types.js";

export const memoryRenderer: ToolContentRenderer = {
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

    if (output.startsWith("Stored memories:")) {
      const lines = output.split("\n").slice(1);
      return (
        <Box flexDirection="column">
          <Text {...theme.muted}>{lines.length} stored</Text>
          {lines.map((line, i) => {
            const match = line.match(/^\s*([^:]+):\s*(.+)$/);
            if (!match) return null;
            const [, key, value] = match;
            return (
              <Box key={i} gap={1} flexDirection="column">
                <Box gap={1}>
                  <Text {...theme.muted}>•</Text>
                  <Text {...theme.highlight}>{key}</Text>
                </Box>
                <Box paddingLeft={2}>
                  <Text {...theme.code}>{value}</Text>
                </Box>
              </Box>
            );
          })}
        </Box>
      );
    }

    if (output.startsWith("Memory found:")) {
      const match = output.match(/^Memory found:\s*([^:]+):\s*(.+)$/);
      const key = match?.[1] ?? "unknown";
      const value = match?.[2] ?? output;
      return (
        <Box flexDirection="column">
          <Box gap={1}>
            <Text {...theme.success}>✓</Text>
            <Text {...theme.muted}>Found</Text>
          </Box>
          <Box gap={1} marginTop={1} paddingLeft={1}>
            <Text {...theme.highlight}>{key}</Text>
            <Text {...theme.muted}>→</Text>
            <Text {...theme.code}>{value}</Text>
          </Box>
        </Box>
      );
    }

    if (output.startsWith("Memory not found:")) {
      const match = output.match(/^Memory not found:\s*(.+)$/);
      const key = match?.[1] ?? "unknown";
      return (
        <Box gap={1}>
          <Text {...theme.warning}>○</Text>
          <Text {...theme.muted}>No memory found for key:</Text>
          <Text {...theme.code}>{key}</Text>
        </Box>
      );
    }

    if (output.startsWith("No memories stored")) {
      return (
        <Box gap={1}>
          <Text {...theme.muted}>○</Text>
          <Text {...theme.muted}>No memories stored</Text>
        </Box>
      );
    }

    if (output.startsWith("Set memory:")) {
      return (
        <Box gap={1}>
          <Text {...theme.success}>✓</Text>
          <Text {...theme.success}>{output}</Text>
        </Box>
      );
    }

    if (output.startsWith("Deleted memory:")) {
      return (
        <Box gap={1}>
          <Text {...theme.warning}>✗</Text>
          <Text {...theme.warning}>{output}</Text>
        </Box>
      );
    }

    if (output.startsWith("Cleared")) {
      return (
        <Box gap={1}>
          <Text {...theme.highlight}>⊘</Text>
          <Text {...theme.highlight}>{output}</Text>
        </Box>
      );
    }

    return (
      <Box gap={1}>
        <Text {...theme.muted}>→</Text>
        <Text {...theme.muted}>{output}</Text>
      </Box>
    );
  },
};
