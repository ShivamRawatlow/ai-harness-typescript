import React from "react";
import { Text, Box } from "ink";
import { theme } from "../theme.js";
import { BOX_WIDTH } from "../tool-panel.js";
import { ToolCallCompletePanelProps } from "../tool-complete-panel.js";
import { ToolContentRenderer } from "./types.js";

const SUBAGENT_RESULT_MAX_LINES = 15;

function parseSubagentOutput(output: string): {
  termination: string | null;
  toolsCalled: string | null;
  result: string | null;
} {
  const terminationMatch = output.match(/^Termination:\s*(.+)$/m);
  const toolsMatch = output.match(/^Tools called:\s*(.+)$/m);
  const resultMatch = output.match(/^Result:\n([\s\S]*)$/m);
  return {
    termination: terminationMatch?.[1]?.trim() ?? null,
    toolsCalled: toolsMatch?.[1]?.trim() ?? null,
    result: resultMatch?.[1]?.trim() ?? null,
  };
}

export const subagentRenderer: ToolContentRenderer = {
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

    const { termination, toolsCalled, result } = parseSubagentOutput(output);
    const resultLines = (result ?? output.trimEnd()).split("\n");
    const clipped = resultLines.length > SUBAGENT_RESULT_MAX_LINES;
    const visibleLines = resultLines.slice(0, SUBAGENT_RESULT_MAX_LINES);

    return (
      <Box flexDirection="column" gap={0}>
        <Box gap={2}>
          {termination !== null && (
            <Box gap={1}>
              <Text {...theme.muted}>termination</Text>
              <Text {...theme.code}>{termination}</Text>
            </Box>
          )}
          {toolsCalled !== null && (
            <Box gap={1}>
              <Text {...theme.muted}>tools</Text>
              <Text {...theme.code}>{toolsCalled}</Text>
            </Box>
          )}
        </Box>
        <Text {...theme.border}>{"─".repeat(BOX_WIDTH - 4)}</Text>
        {visibleLines.map((line, i) => (
          <Text key={i} {...theme.code} wrap="wrap">
            {line}
          </Text>
        ))}
        {clipped && <Text {...theme.muted}>…</Text>}
      </Box>
    );
  },
};
