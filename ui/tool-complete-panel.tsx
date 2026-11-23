import React, { useEffect, useState } from "react";
import { theme } from "./theme.js";
import { Text, Box } from "ink";
import { ToolPanelShell } from "./tool-panel.js";
import { toolRendererRegistry } from "./tool-renderers/index.js";

// ---------------------------------------------------------------------------
// ToolCallCompletePanelProps
// ---------------------------------------------------------------------------

export type ToolCallCompletePanelProps = {
  callId: string;
  name: string;
  kind?: string;
  success: boolean;
  output: string;
  error?: string;
  metadata: Record<string, unknown>;
  truncated: boolean;
  cwd?: string;
  diff?: string;
  exitCode?: number;
};

// ---------------------------------------------------------------------------
// ToolCallCompletePanel
// ---------------------------------------------------------------------------

export const ToolCallCompletePanel = (props: ToolCallCompletePanelProps) => {
  const { callId, name, kind, success, exitCode } = props;
  const statusIcon = success ? "✓" : "✗";
  const statusTheme = success ? theme.success : theme.error;

  const renderer = toolRendererRegistry.get(name);

  const [content, setContent] = useState<React.ReactNode>(null);

  useEffect(() => {
    renderer.prepare(props).then((prepared) => {
      setContent(renderer.render(props, prepared));
    });
  }, []);

  return (
    <ToolPanelShell
      callId={callId}
      kind={kind}
      titleLeft={
        <Box gap={1}>
          <Text {...statusTheme}>{statusIcon}</Text>
          <Text {...theme.tool}>{name}</Text>
        </Box>
      }
      footer={
        <Box gap={2}>
          <Text {...statusTheme}>{success ? "done" : "failed"}</Text>
          {exitCode !== undefined && (
            <Text {...theme.muted}>exit {exitCode}</Text>
          )}
        </Box>
      }
    >
      {content}
    </ToolPanelShell>
  );
};
