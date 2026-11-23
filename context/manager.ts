import {
  ChatCompletionMessageParam,
  ChatCompletionAssistantMessageParam,
  ChatCompletionToolMessageParam,
  ChatCompletionUserMessageParam,
  ChatCompletionSystemMessageParam,
  ChatCompletionMessageToolCall,
} from "openai/resources.js";
import { Config } from "../config/config.js";
import { TokenUsage } from "../client/response.ts";
import { getSystemPrompt } from "../prompts/system.ts";
import { countTokens } from "../utils/text.ts";

class MessageItem {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCallId: string | null;
  toolCalls: ChatCompletionMessageToolCall[];
  tokenCount: number | null;
  prunedAt: Date | null;

  constructor(fields: {
    role: "user" | "assistant" | "system" | "tool";
    content: string;
    toolCallId?: string | null;
    toolCalls?: ChatCompletionMessageToolCall[];
    tokenCount?: number | null;
  }) {
    this.role = fields.role;
    this.content = fields.content;
    this.toolCallId = fields.toolCallId ?? null;
    this.toolCalls = fields.toolCalls ?? [];
    this.tokenCount = fields.tokenCount ?? null;
    this.prunedAt = null;
  }

  toOpenAIMessage(): ChatCompletionMessageParam {
    if (this.role === "tool") {
      const result: ChatCompletionToolMessageParam = {
        role: "tool",
        tool_call_id: this.toolCallId!,
        content: this.content,
      };
      return result;
    }

    if (this.role === "assistant") {
      const result: ChatCompletionAssistantMessageParam = {
        role: "assistant",
        content: this.content || null,
      };
      if (this.toolCalls.length > 0) {
        result.tool_calls = this.toolCalls;
      }
      return result;
    }

    if (this.role === "system") {
      const result: ChatCompletionSystemMessageParam = {
        role: "system",
        content: this.content,
      };
      return result;
    }

    const result: ChatCompletionUserMessageParam = {
      role: "user",
      content: this.content,
    };
    return result;
  }
}

export default class ContextManager {
  private readonly systemPrompt: string | null;
  private readonly messages: MessageItem[] = [];
  private readonly modelName: string;
  private readonly contextWindow: number;
  private latestUsage: TokenUsage | null = null;

  constructor(
    config: Config,
    userMemory?: string,
    tools?: { name: string; description: string }[],
  ) {
    this.modelName = config.modelName;
    this.contextWindow = config.model.contextWindow;
    this.systemPrompt = getSystemPrompt(config, userMemory, tools);
  }

  addUserMessage(content: string | null): void {
    if (!content) return;
    this.messages.push(
      new MessageItem({
        role: "user",
        content,
        tokenCount: countTokens(content, this.modelName),
      }),
    );
  }

  addToolResult(toolCallId: string, content: string): void {
    this.messages.push(
      new MessageItem({
        role: "tool",
        content,
        toolCallId,
        tokenCount: countTokens(content, this.modelName),
      }),
    );
  }

  addAssistantMessage(
    content: string | null,
    toolCalls?: ChatCompletionMessageToolCall[],
  ): void {
    if (!content && !toolCalls?.length) return;
    this.messages.push(
      new MessageItem({
        role: "assistant",
        content: content ?? "",
        toolCalls,
        tokenCount: countTokens(content ?? "", this.modelName),
      }),
    );
  }

  setLatestUsage(usage: TokenUsage): void {
    this.latestUsage = usage;
  }

  private static readonly PRUNE_PROTECT_TOKENS = 4000;
  private static readonly PRUNE_MINIMUM_TOKENS = 1000;

  pruneToolOutputs(): number {
    const userMessageCount = this.messages.filter(
      (msg) => msg.role === "user",
    ).length;

    if (userMessageCount < 2) return 0;

    let totalTokens = 0;
    let prunedTokens = 0;
    const toPrune: MessageItem[] = [];

    for (let i = this.messages.length - 1; i >= 0; i--) {
      const msg = this.messages[i];
      if (msg.role === "tool" && msg.toolCallId) {
        if (msg.prunedAt) break;

        const tokens =
          msg.tokenCount ?? countTokens(msg.content, this.modelName);
        totalTokens += tokens;

        if (totalTokens > ContextManager.PRUNE_PROTECT_TOKENS) {
          prunedTokens += tokens;
          toPrune.push(msg);
        }
      }
    }

    if (prunedTokens < ContextManager.PRUNE_MINIMUM_TOKENS) return 0;

    for (const msg of toPrune) {
      msg.content = "[Old tool result content cleared]";
      msg.tokenCount = countTokens(msg.content, this.modelName);
      msg.prunedAt = new Date();
    }

    return toPrune.length;
  }

  needsCompression(): boolean {
    if (!this.latestUsage) return false;
    return this.latestUsage.totalTokens > this.contextWindow * 0.8;
  }

  replaceWithSummary(summary: string): void {
    this.messages.length = 0;

    const continuationContent = `# Context Restoration (Previous Session Compacted)

The previous conversation was compacted due to context length limits. Below is a detailed summary of the work done so far.

**CRITICAL: Actions listed under "COMPLETED ACTIONS" are already done. DO NOT repeat them.**

---

${summary}

---

Resume work from where we left off. Focus ONLY on the remaining tasks.`;

    this.messages.push(
      new MessageItem({
        role: "user",
        content: continuationContent,
        tokenCount: countTokens(continuationContent, this.modelName),
      }),
    );

    const ackContent = `I've reviewed the context from the previous session. I understand:
- The original goal and what was requested
- Which actions are ALREADY COMPLETED (I will NOT repeat these)
- The current state of the project
- What still needs to be done

I'll continue with the REMAINING tasks only, starting from where we left off.`;

    this.messages.push(
      new MessageItem({
        role: "assistant",
        content: ackContent,
        tokenCount: countTokens(ackContent, this.modelName),
      }),
    );

    const continueContent =
      "Continue with the REMAINING work only. Do NOT repeat any completed actions. " +
      "Proceed with the next step as described in the context above.";

    this.messages.push(
      new MessageItem({
        role: "user",
        content: continueContent,
        tokenCount: countTokens(continueContent, this.modelName),
      }),
    );
  }

  getMessages(): ChatCompletionMessageParam[] {
    const result: ChatCompletionMessageParam[] = [];

    if (this.systemPrompt) {
      result.push({ role: "system", content: this.systemPrompt });
    }

    for (const item of this.messages) {
      result.push(item.toOpenAIMessage());
    }

    return result;
  }
}
