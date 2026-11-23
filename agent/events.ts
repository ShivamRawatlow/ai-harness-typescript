import { TokenUsage } from "../client/response.js";
import { ToolResult } from "../tools/base.js";

export enum AgentEventType {
  AGENT_START = "agent_start",
  AGENT_END = "agent_end",
  AGENT_ERROR = "agent_error",
  AGENT_MAX_TURNS = "agent_max_turns",
  TEXT_DELTA = "agent_text_delta",
  TEXT_COMPLETE = "agent_text_complete",
  TOOL_CALL_START = "tool_call_start",
  TOOL_CALL_COMPLETE = "tool_call_complete",
  CONTEXT_COMPACTED = "context_compacted",
}

export type AgentStartEvent = {
  type: AgentEventType.AGENT_START;
  message: string;
};

export type AgentEndEvent = {
  type: AgentEventType.AGENT_END;
  response: string | null;
  usage: TokenUsage | null;
};

export type AgentErrorEvent = {
  type: AgentEventType.AGENT_ERROR;
  error: string;
  details: Record<string, unknown>;
};

export type AgentMaxTurnsEvent = {
  type: AgentEventType.AGENT_MAX_TURNS;
  turns: number;
};

export type TextDeltaEvent = {
  type: AgentEventType.TEXT_DELTA;
  content: string;
};

export type TextCompleteEvent = {
  type: AgentEventType.TEXT_COMPLETE;
  content: string;
};

export type ToolCallStartEvent = {
  type: AgentEventType.TOOL_CALL_START;
  callId: string;
  name: string;
  kind?: string;
  arguments: Record<string, unknown>;
};

export type ToolCallCompleteEvent = {
  type: AgentEventType.TOOL_CALL_COMPLETE;
  callId: string;
  name: string;
  kind?: string;
  success: boolean;
  output: string;
  error?: string;
  metadata: Record<string, unknown>;
  truncated: boolean;
  diff?: string;
  exitCode?: number;
};

export type ContextCompactedEvent = {
  type: AgentEventType.CONTEXT_COMPACTED;
  tokensBefore: number;
  tokensAfter: number;
  savedTokens: number;
};

export type AgentEvent =
  | AgentStartEvent
  | AgentEndEvent
  | AgentErrorEvent
  | AgentMaxTurnsEvent
  | TextDeltaEvent
  | TextCompleteEvent
  | ToolCallStartEvent
  | ToolCallCompleteEvent
  | ContextCompactedEvent;

export const agentStart = (message: string): AgentStartEvent => ({
  type: AgentEventType.AGENT_START,
  message,
});

export const agentEnd = (
  response?: string | null,
  usage?: TokenUsage | null,
): AgentEndEvent => ({
  type: AgentEventType.AGENT_END,
  response: response ?? null,
  usage: usage ?? null,
});

export const agentMaxTurns = (turns: number): AgentMaxTurnsEvent => ({
  type: AgentEventType.AGENT_MAX_TURNS,
  turns,
});

export const agentError = (
  error: string,
  details: Record<string, unknown> = {},
): AgentErrorEvent => ({
  type: AgentEventType.AGENT_ERROR,
  error,
  details,
});

export const textDelta = (content: string): TextDeltaEvent => ({
  type: AgentEventType.TEXT_DELTA,
  content,
});

export const textComplete = (content: string): TextCompleteEvent => ({
  type: AgentEventType.TEXT_COMPLETE,
  content,
});

export const toolCallStart = (
  callId: string,
  name: string,
  arguments_: Record<string, unknown>,
  kind?: string,
): ToolCallStartEvent => ({
  type: AgentEventType.TOOL_CALL_START,
  callId,
  name,
  kind,
  arguments: arguments_,
});

export const contextCompacted = (
  tokensBefore: number,
  tokensAfter: number,
): ContextCompactedEvent => ({
  type: AgentEventType.CONTEXT_COMPACTED,
  tokensBefore,
  tokensAfter,
  savedTokens: tokensBefore - tokensAfter,
});

export const toolCallComplete = (
  callId: string,
  name: string,
  result: ToolResult,
  kind?: string,
): ToolCallCompleteEvent => ({
  type: AgentEventType.TOOL_CALL_COMPLETE,
  callId,
  name,
  kind,
  success: result.success,
  output: result.output,
  error: result.error,
  metadata: result.metadata,
  truncated: result.truncated,
  diff: result.diff?.toDiff(),
  exitCode: result.exitCode,
});
