import { ChatCompletionMessageParam } from "openai/resources.js";
import LLMClient from "../client/LLMClient.ts";
import { TokenUsage } from "../client/response.ts";
import ContextManager from "./manager.ts";
import { getCompressionPrompt } from "../prompts/system.ts";

const LIMITS = {
  TOOL_OUTPUT: 2000,
  ASSISTANT_REPLY: 3000,
  TOOL_ARGS: 500,
  USER_MESSAGE: 1500,
} as const;

function truncate(text: string, maxLen: number, suffix: string): string {
  return text.length > maxLen ? text.slice(0, maxLen) + suffix : text;
}

const toText = (content: ChatCompletionMessageParam["content"]): string =>
  typeof content === "string" ? content : "";

function formatHistoryForCompaction(
  messages: ChatCompletionMessageParam[],
): string {
  const output: string[] = [
    "Here is the conversation that needs to be continued:\n",
  ];

  for (const msg of messages) {
    switch (msg.role) {
      case "system":
        continue;

      case "tool": {
        const toolId = msg.tool_call_id ?? "unknown";
        const content = truncate(
          toText(msg.content),
          LIMITS.TOOL_OUTPUT,
          "\n... [tool output truncated]",
        );
        output.push(`[Tool Result (${toolId})]:\n${content}`);
        break;
      }

      case "assistant": {
        const content = toText(msg.content);
        if (content) {
          output.push(
            `Assistant:\n${truncate(content, LIMITS.ASSISTANT_REPLY, "\n... [response truncated]")}`,
          );
        }

        if (msg.tool_calls?.length) {
          const toolDetails = msg.tool_calls
            .filter((tc) => tc.type === "function")
            .map((tc) => {
              const name = tc.function.name ?? "unknown";
              const args = truncate(
                tc.function.arguments,
                LIMITS.TOOL_ARGS,
                "",
              );
              return `  - ${name}(${args})`;
            });
          output.push("Assistant called tools:\n" + toolDetails.join("\n"));
        }
        break;
      }

      case "user":
      default: {
        const content = truncate(
          toText(msg.content),
          LIMITS.USER_MESSAGE,
          "\n... [message truncated]",
        );
        if (content) {
          output.push(`User:\n${content}`);
        }
        break;
      }
    }
  }

  return output.join("\n\n---\n\n");
}

export async function compress(
  client: LLMClient,
  contextManager: ContextManager,
): Promise<[string | null, TokenUsage | null]> {
  const messages = contextManager.getMessages();

  if (messages.length < 3) {
    return [null, null];
  }

  const compressionMessages: ChatCompletionMessageParam[] = [
    { role: "system", content: getCompressionPrompt() },
    { role: "user", content: formatHistoryForCompaction(messages) },
  ];

  try {
    const result = await client.chatCompletion(compressionMessages, null, false);

    if (!result.text || !result.usage) {
      return [null, null];
    }

    return [result.text, result.usage];
  } catch {
    return [null, null];
  }
}
