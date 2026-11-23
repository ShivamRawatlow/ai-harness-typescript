import React from "react";
import { Text, Box } from "ink";
import { theme } from "../theme.js";
import { ToolCallCompletePanelProps } from "../tool-complete-panel.js";
import { ToolContentRenderer } from "./types.js";

const SHELL_MAX_LINES = 20;

const renderLines = (
  text: string,
  textTheme: Record<string, unknown>,
): React.ReactNode => {
  if (!text) return null;
  const all = text.split("\n");
  const visible = all.slice(0, SHELL_MAX_LINES);
  const clipped = all.length > SHELL_MAX_LINES;
  return (
    <>
      {visible.map((line, i) => (
        <Text key={i} {...textTheme} wrap="truncate">
          {line}
        </Text>
      ))}
      {clipped && <Text {...theme.muted}>…</Text>}
    </>
  );
};

export const shellRenderer: ToolContentRenderer = {
  async prepare() {
    return {};
  },

  render(props) {
    const { success, output, error, exitCode, truncated } = props;

    // Blocked command — show the error message prominently
    if (!success && !output.trim()) {
      return (
        <Box flexDirection="column">
          <Text {...theme.error}>{error ?? "Command failed"}</Text>
        </Box>
      );
    }

    // Split stdout and stderr sections joined with "\n--- stderr ---\n"
    const stderrMarker = "\n--- stderr ---\n";
    const markerIdx = output.indexOf(stderrMarker);

    const stdoutRaw =
      markerIdx !== -1 ? output.slice(0, markerIdx) : output;
    const exitCodeLine =
      exitCode !== undefined ? `\nExit code: ${exitCode}` : "";
    const stdoutClean = exitCodeLine
      ? stdoutRaw
          .replace(new RegExp(`${exitCodeLine}$`), "")
          .trimEnd()
      : stdoutRaw.trimEnd();

    const stderrRaw =
      markerIdx !== -1
        ? output
            .slice(markerIdx + stderrMarker.length)
            .replace(new RegExp(`${exitCodeLine}$`), "")
            .trimEnd()
        : "";

    return (
      <Box flexDirection="column">
        {stdoutClean && renderLines(stdoutClean, theme.code)}
        {stderrRaw && (
          <Box flexDirection="column" marginTop={stdoutClean ? 1 : 0}>
            <Text {...theme.muted}>── stderr ──</Text>
            {renderLines(stderrRaw, theme.warning)}
          </Box>
        )}
        {truncated && <Text {...theme.muted}>(output truncated)</Text>}
        {!success && !stderrRaw && error && (
          <Box marginTop={1}>
            <Text {...theme.error}>{error}</Text>
          </Box>
        )}
      </Box>
    );
  },
};
