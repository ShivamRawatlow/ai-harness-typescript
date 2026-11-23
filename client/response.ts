export type TextDelta = {
  content: string;
};

export enum StreamEventType {
  TEXT_DELTA = "text_delta",
  MESSAGE_COMPLETE = "message_complete",
  ERROR = "error",

  TOOL_CALL_START = "tool_call_start",
  TOOL_CALL_DELTA = "tool_call_delta",
  TOOL_CALL_COMPLETE = "tool_call_complete",
}

export type TokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens?: number;
};

export function addTokenUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
    cachedTokens: (a.cachedTokens || 0) + (b.cachedTokens || 0),
  };
}

export type ToolCall = {
  callId: string;
  name: string | null;
  arguments: Record<string, any>;
};

export type ToolCallDelta = {
  callId: string;
  name: string | null;
  argumentsDelta: string;
};

export type StreamEvent = {
  type: StreamEventType;
  textDelta?: TextDelta;
  error?: string;
  finishReason?: string;
  usage?: TokenUsage;
  toolCallDelta?: ToolCallDelta;
  toolCall?: ToolCall;
};

export type LLMResult = {
  text: string;
  toolCalls: ToolCall[];
  usage: TokenUsage | null;
  finishReason: string | undefined;
  error?: string;
};

export function parseToolCallArguments(
  argumentsStr: string,
): Record<string, any> {
  if (!argumentsStr) return {};
  try {
    return JSON.parse(argumentsStr);
  } catch {
    return { rawArguments: argumentsStr };
  }
}

export class ToolResultMessage {
  toolCallId: string;
  content: string;
  isError: boolean;

  constructor(toolCallId: string, content: string, isError = false) {
    this.toolCallId = toolCallId;
    this.content = content;
    this.isError = isError;
  }

  toOpenAIMessage() {
    return {
      role: "tool" as const,
      tool_call_id: this.toolCallId,
      content: this.content,
    };
  }
}
