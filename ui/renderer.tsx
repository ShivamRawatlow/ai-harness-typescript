import React from "react";
import { render, Text, Box } from "ink";
import { theme } from "./theme.js";
import { BOX_WIDTH, ToolCallPanel } from "./tool-panel.js";
import { ToolCallCompletePanel } from "./tool-complete-panel.js";
import type {
  ToolCallStartEvent,
  ToolCallCompleteEvent,
} from "../agent/events.js";

export { theme } from "./theme.js";

// ---------------------------------------------------------------------------
// stripMarkdown
// ---------------------------------------------------------------------------

function stripMarkdown(text: string): string {
  return (
    text
      // headings: ## Heading → Heading
      .replace(/^#{1,6}\s+/gm, "")
      // bold+italic: ***text*** or ___text___
      .replace(/\*{3}(.+?)\*{3}/g, "$1")
      .replace(/_{3}(.+?)_{3}/g, "$1")
      // bold: **text** or __text__
      .replace(/\*{2}(.+?)\*{2}/g, "$1")
      .replace(/_{2}(.+?)_{2}/g, "$1")
      // italic: *text* or _text_
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/_(.+?)_/g, "$1")
      // inline code: `code`
      .replace(/`([^`]+)`/g, "$1")
      // horizontal rules
      .replace(/^[-*_]{3,}\s*$/gm, "")
      // links: [text](url) → text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      // strikethrough: ~~text~~
      .replace(/~~(.+?)~~/g, "$1")
  );
}

// ---------------------------------------------------------------------------
// AssistantOutput
// ---------------------------------------------------------------------------

type AssistantOutputProps = {
  text: string;
  variant?: "assistant" | "error";
};

const AssistantOutput = ({
  text,
  variant = "assistant",
}: AssistantOutputProps) => (
  <Box flexDirection="column" marginTop={1}>
    <Text {...(variant === "error" ? theme.error : theme.muted)}>
      {variant === "error" ? "error" : "assistant"}
    </Text>
    <Text
      {...(variant === "error" ? theme.error : theme.assistant)}
      wrap="wrap"
    >
      {variant === "error" ? "Error: " : ""}
      {stripMarkdown(text)}
    </Text>
  </Box>
);

// ---------------------------------------------------------------------------
// WelcomePanel
// ---------------------------------------------------------------------------

type WelcomePanelProps = {
  title: string;
  lines: string[];
};

const WelcomePanel = ({ title, lines }: WelcomePanelProps) => (
  <Box
    flexDirection="column"
    borderStyle="round"
    borderColor={theme.border.color}
    marginTop={1}
    paddingX={2}
    paddingY={1}
    width={BOX_WIDTH}
  >
    <Text {...theme.highlight}>{title}</Text>
    <Text {...theme.border}>{"─".repeat(BOX_WIDTH - 6)}</Text>
    {lines.map((line, i) => (
      <Text key={i} {...theme.code}>
        {line}
      </Text>
    ))}
  </Box>
);

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

/**
 * Renders any React node to the terminal once, then unmounts.
 */
export const renderOnce = async (node: React.ReactNode): Promise<void> => {
  const instance = render(<>{node}</>);
  const exited = instance.waitUntilExit();
  instance.unmount();
  await exited;
};

// ANSI codes matching the theme colours used by AssistantOutput.
const ANSI_GRAY = "\x1b[90m";
const ANSI_RESET = "\x1b[0m";

/**
 * Streams assistant output directly to stdout without ink, avoiding the
 * rerender-per-delta flicker that ink's log-update causes.
 */
export class AssistantRenderer {
  private started = false;

  write(delta: string): void {
    if (!this.started) {
      process.stdout.write(`\n${ANSI_GRAY}assistant${ANSI_RESET}\n`);
      this.started = true;
    }
    process.stdout.write(stripMarkdown(delta));
  }

  end(): void {
    if (this.started) process.stdout.write("\n");
  }

  waitUntilExit(): Promise<void> {
    return Promise.resolve();
  }
}

/**
 * Renders a tool-call-start panel to the terminal.
 */
export const renderToolCallStart = (
  event: ToolCallStartEvent,
  cwd?: string,
): Promise<void> =>
  renderOnce(
    <ToolCallPanel
      callId={event.callId}
      name={event.name}
      kind={event.kind}
      args={event.arguments}
      cwd={cwd}
    />,
  );

/**
 * Renders a tool-call-complete panel to the terminal.
 */
export const renderToolCallComplete = (
  event: ToolCallCompleteEvent,
  cwd?: string,
): Promise<void> =>
  renderOnce(
    <ToolCallCompletePanel
      callId={event.callId}
      name={event.name}
      kind={event.kind}
      success={event.success}
      output={event.output}
      error={event.error}
      metadata={event.metadata}
      truncated={event.truncated}
      cwd={cwd}
      diff={event.diff}
      exitCode={event.exitCode}
    />,
  );

/**
 * Renders an error message to the terminal.
 */
export const renderError = (error: string): Promise<void> =>
  renderOnce(<AssistantOutput text={error} variant="error" />);

/**
 * Renders a welcome panel to the terminal.
 */
export const renderWelcome = (title: string, lines: string[]): Promise<void> =>
  renderOnce(<WelcomePanel title={title} lines={lines} />);
