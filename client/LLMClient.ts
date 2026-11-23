import { OpenAI } from "openai/client.js";
import { RateLimitError, APIConnectionError, APIError } from "openai/error.js";
import { ChatCompletionMessageParam } from "openai/resources.js";
import { ChatCompletionCreateParamsBase } from "openai/resources/chat/completions.js";
import {
  TextDelta,
  TokenUsage,
  LLMResult,
  parseToolCallArguments,
} from "./response.js";
import { OpenAIToolSchema } from "../tools/base.js";
import { Config } from "../config/config.js";

export default class LLMClient {
  client: OpenAI | null;
  config: Config;

  constructor(config: Config) {
    this.client = null;
    this.config = config;
  }

  getClient() {
    if (!this.client) {
      this.client = new OpenAI({
        apiKey: this.config.apiKey,
        baseURL: this.config.baseUrl,
        maxRetries: 3,
      });
    }
    return this.client;
  }

  private async streamResponse(
    client: OpenAI,
    kwargs: ChatCompletionCreateParamsBase,
  ): Promise<LLMResult> {
    const stream = await client.chat.completions.create({
      ...kwargs,
      stream: true,
    });

    const toolCallAccum: Record<
      number,
      { id: string; name: string; arguments: string }
    > = {};

    let text = "";
    let finishReason: string | undefined;
    let usage: TokenUsage | null = null;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      if (chunk.usage) {
        usage = {
          promptTokens: chunk.usage.prompt_tokens,
          completionTokens: chunk.usage.completion_tokens,
          totalTokens: chunk.usage.total_tokens,
          cachedTokens: chunk.usage.prompt_tokens_details?.cached_tokens,
        };
      }

      if (chunk.choices[0]?.finish_reason) {
        finishReason = chunk.choices[0].finish_reason;
      }

      if (delta?.content) {
        text += delta.content;
        this.onTextDelta?.({ content: delta.content });
      }

      if (delta?.tool_calls) {
        for (const toolCallDelta of delta.tool_calls) {
          const idx = toolCallDelta.index;

          if (!(idx in toolCallAccum)) {
            toolCallAccum[idx] = {
              id: toolCallDelta.id ?? "",
              name: "",
              arguments: "",
            };

            if (toolCallDelta.function?.name) {
              toolCallAccum[idx].name = toolCallDelta.function.name;
            }
          }

          if (toolCallDelta.function?.arguments) {
            toolCallAccum[idx].arguments += toolCallDelta.function.arguments;
          }
        }
      }
    }

    const toolCalls = Object.values(toolCallAccum).map((tc) => ({
      callId: tc.id,
      name: tc.name,
      arguments: parseToolCallArguments(tc.arguments),
    }));

    return { text, toolCalls, usage, finishReason };
  }

  private async nonStreamResponse(
    client: OpenAI,
    kwargs: ChatCompletionCreateParamsBase,
  ): Promise<LLMResult> {
    const response = await client.chat.completions.create({
      ...kwargs,
      stream: false,
    });

    const message = response.choices[0].message;

    const text = message.content ?? "";

    let usage: TokenUsage | null = null;
    if (response.usage) {
      usage = {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
        cachedTokens: response.usage.prompt_tokens_details?.cached_tokens,
      };
    }

    const toolCalls = (message.tool_calls ?? [])
      .filter((tc) => tc.type === "function")
      .map((tc) => ({
        callId: tc.id,
        name: tc.function.name,
        arguments: parseToolCallArguments(tc.function.arguments),
      }));

    return {
      text,
      toolCalls,
      usage,
      finishReason: response.choices[0].finish_reason,
    };
  }

  // Optional hook: agent sets this to receive streaming text deltas.
  onTextDelta?: (delta: TextDelta) => void;

  async chatCompletion(
    messages: ChatCompletionMessageParam[],
    tools: OpenAIToolSchema[] | null = null,
    stream = true,
  ): Promise<LLMResult> {
    const client = this.getClient();

    const kwargs: ChatCompletionCreateParamsBase = {
      model: this.config.modelName,
      temperature: this.config.model.temperature,
      messages: messages,
      stream: stream,
    };

    if (tools && tools.length > 0) {
      kwargs.tools = this.buildTools(tools);
      kwargs.tool_choice = "auto";
    }

    try {
      if (stream) {
        return await this.streamResponse(client, kwargs);
      } else {
        return await this.nonStreamResponse(client, kwargs);
      }
    } catch (error) {
      if (error instanceof RateLimitError) {
        return {
          text: "",
          toolCalls: [],
          usage: null,
          finishReason: undefined,
          error: `Rate limit reached: ${error.message}`,
        };
      }
      if (error instanceof APIConnectionError) {
        return {
          text: "",
          toolCalls: [],
          usage: null,
          finishReason: undefined,
          error: `Connection error: ${error.message}`,
        };
      }
      if (error instanceof APIError) {
        return {
          text: "",
          toolCalls: [],
          usage: null,
          finishReason: undefined,
          error: `API error ${error.status}: ${error.message}`,
        };
      }
      throw error;
    }
  }

  private buildTools(tools: OpenAIToolSchema[]) {
    return tools.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description ?? "",
        parameters: tool.parameters ?? { type: "object", properties: {} },
      },
    }));
  }

  close() {
    if (this.client) {
      this.client = null;
    }
  }
}
