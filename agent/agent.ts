import { EventEmitter } from "node:events";
import { Config } from "../config/config.js";
import { loadConfig } from "../config/loader.js";
import { LLMResult, ToolCall, ToolResultMessage } from "../client/response.js";
import {
  AgentEvent,
  AgentEventType,
  agentStart,
  agentEnd,
  agentError,
  agentMaxTurns,
  textDelta,
  textComplete,
  toolCallStart,
  toolCallComplete,
  contextCompacted,
} from "./events.js";
import Session from "./session.js";

// ---------------------------------------------------------------------------
// Typed EventEmitter overloads
// ---------------------------------------------------------------------------

export interface AgentEvents {
  [AgentEventType.AGENT_START]: [event: import("./events.js").AgentStartEvent];
  [AgentEventType.AGENT_END]: [event: import("./events.js").AgentEndEvent];
  [AgentEventType.AGENT_ERROR]: [event: import("./events.js").AgentErrorEvent];
  [AgentEventType.AGENT_MAX_TURNS]: [
    event: import("./events.js").AgentMaxTurnsEvent,
  ];
  [AgentEventType.TEXT_DELTA]: [event: import("./events.js").TextDeltaEvent];
  [AgentEventType.TEXT_COMPLETE]: [
    event: import("./events.js").TextCompleteEvent,
  ];
  [AgentEventType.TOOL_CALL_START]: [
    event: import("./events.js").ToolCallStartEvent,
  ];
  [AgentEventType.TOOL_CALL_COMPLETE]: [
    event: import("./events.js").ToolCallCompleteEvent,
  ];
  [AgentEventType.CONTEXT_COMPACTED]: [
    event: import("./events.js").ContextCompactedEvent,
  ];
}

export default class Agent extends EventEmitter {
  session: Session;
  config: Config;

  constructor(config?: Config) {
    super();
    this.config = config ?? loadConfig();
    this.session = new Session(this.config);
  }

  // ---------------------------------------------------------------------------
  // Typed on/once/emit overloads
  // ---------------------------------------------------------------------------

  on<K extends keyof AgentEvents>(
    event: K,
    listener: (...args: AgentEvents[K]) => void,
  ): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  once<K extends keyof AgentEvents>(
    event: K,
    listener: (...args: AgentEvents[K]) => void,
  ): this {
    return super.once(event, listener as (...args: unknown[]) => void);
  }

  emit<K extends keyof AgentEvents>(
    event: K,
    ...args: AgentEvents[K]
  ): boolean {
    return super.emit(event, ...args);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async run(message: string): Promise<void> {
    await this.session.initialize();
    this.session.contextManager!.addUserMessage(message);

    this.emit(AgentEventType.AGENT_START, agentStart(message));

    // Track the latest complete response internally without polluting the
    // external listener list — use removeListener to clean up after run().
    let finalResponse: string | null = null;
    const onTextComplete = (
      event: import("./events.js").TextCompleteEvent,
    ): void => {
      finalResponse = event.content;
    };
    this.on(AgentEventType.TEXT_COMPLETE, onTextComplete);

    await this.agenticLoop();

    this.removeListener(AgentEventType.TEXT_COMPLETE, onTextComplete);
    this.emit(AgentEventType.AGENT_END, agentEnd(finalResponse));
  }

  // ---------------------------------------------------------------------------
  // Private — agentic loop
  // ---------------------------------------------------------------------------

  private dispatch(event: AgentEvent): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    super.emit(event.type, event as any);
  }

  private async handleLLMResult(result: LLMResult): Promise<{
    responseText: string;
    pendingToolCalls: ToolCall[];
  }> {
    if (result.error) {
      this.dispatch(agentError(result.error));
      return { responseText: "", pendingToolCalls: [] };
    }

    if (result.usage) {
      this.session.contextManager!.setLatestUsage(result.usage);
    }

    // Emit text deltas — during streaming these arrive via _onTextDelta hook;
    // here we emit the complete text as a single delta for non-streaming,
    // or it was already emitted incrementally for streaming.
    // Either way responseText holds the full accumulated text.

    return {
      responseText: result.text,
      pendingToolCalls: result.toolCalls,
    };
  }

  private async streamLLMResponse(): Promise<{
    responseText: string;
    pendingToolCalls: ToolCall[];
    latestUsage: import("../client/response.js").TokenUsage | null;
  }> {
    // Wire the streaming text-delta hook so the agent emits TEXT_DELTA
    // events incrementally as chunks arrive.
    this.session.client.onTextDelta = (delta) => {
      this.dispatch(textDelta(delta.content));
    };

    const result = await this.session.client.chatCompletion(
      this.session.contextManager!.getMessages(),
      this.session.toolRegistry.getSchemas(),
    );

    // Clean up hook.
    this.session.client.onTextDelta = undefined;

    const { responseText, pendingToolCalls } =
      await this.handleLLMResult(result);

    return { responseText, pendingToolCalls, latestUsage: result.usage };
  }

  private async executeToolCalls(
    toolCalls: ToolCall[],
  ): Promise<ToolResultMessage[]> {
    const toolResultMessages: ToolResultMessage[] = [];

    for (const toolCall of toolCalls) {
      const toolKind = this.session.toolRegistry.get(toolCall.name ?? "")?.kind;

      this.dispatch(
        toolCallStart(
          toolCall.callId,
          toolCall.name ?? "",
          toolCall.arguments,
          toolKind,
        ),
      );

      const result = await this.session.toolRegistry.invoke(
        toolCall.name ?? "",
        toolCall.arguments,
        this.config.cwd,
      );

      this.dispatch(
        toolCallComplete(
          toolCall.callId,
          toolCall.name ?? "",
          result,
          toolKind,
        ),
      );

      toolResultMessages.push(
        new ToolResultMessage(
          toolCall.callId,
          result.toModelOutput(),
          !result.success,
        ),
      );
    }

    return toolResultMessages;
  }

  private async maybeCompressContext(
    latestUsage: import("../client/response.js").TokenUsage | null,
  ): Promise<void> {
    if (!this.session.contextManager!.needsCompression()) return;

    const tokensBefore = latestUsage?.totalTokens ?? 0;
    const [summary, usage] = await this.session.chatCompactor(
      this.session.client,
      this.session.contextManager!,
    );

    if (summary && usage) {
      this.session.contextManager!.replaceWithSummary(summary);
      this.session.contextManager!.setLatestUsage(usage);
      this.dispatch(contextCompacted(tokensBefore, usage.totalTokens));
    }
  }

  private async agenticLoop(): Promise<void> {
    const { responseText, pendingToolCalls, latestUsage } =
      await this.streamLLMResponse();

    this.session.contextManager!.addAssistantMessage(
      responseText || null,
      pendingToolCalls.length > 0
        ? pendingToolCalls.map((tc) => ({
            id: tc.callId,
            type: "function" as const,
            function: {
              name: tc.name ?? "",
              arguments: JSON.stringify(tc.arguments),
            },
          }))
        : undefined,
    );

    if (responseText) {
      this.dispatch(textComplete(responseText));
    }

    if (pendingToolCalls.length === 0) return;

    const toolResults = await this.executeToolCalls(pendingToolCalls);

    for (const toolResult of toolResults) {
      this.session.contextManager!.addToolResult(
        toolResult.toolCallId,
        toolResult.content,
      );
    }

    const turns = this.session.incrementTurn();
    if (this.session.hasReachedMaxTurns()) {
      this.dispatch(agentMaxTurns(turns));
      return;
    }

    this.session.contextManager!.pruneToolOutputs();

    await this.maybeCompressContext(latestUsage);

    await this.agenticLoop();
  }

  close(): void {
    this.session.client.close();
    void this.session.shutdown();
  }
}
