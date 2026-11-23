import { z } from "zod";

import { Tool, ToolInvocation, ToolKind, ToolResult } from "./base.ts";
import { Config } from "../config/config.ts";
import { AgentEventType } from "../agent/events.ts";

// ---------------------------------------------------------------------------
// Params schema
// ---------------------------------------------------------------------------

const SubagentParams = z.object({
  goal: z
    .string()
    .describe("The specific task or goal for the subagent to accomplish"),
});

type SubagentParamsType = z.infer<typeof SubagentParams>;

// ---------------------------------------------------------------------------
// SubagentDefinition
// ---------------------------------------------------------------------------

export interface SubagentDefinition {
  name: string;
  description: string;
  goalPrompt: string;
  allowedTools?: string[];
  maxTurns?: number;
  timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// SubagentTool
// ---------------------------------------------------------------------------

export class SubagentTool extends Tool {
  kind = ToolKind.SHELL;

  private readonly definition: SubagentDefinition;
  private readonly config: Config;

  constructor(config: Config, definition: SubagentDefinition) {
    super();
    this.config = config;
    this.definition = definition;
    this.name = `subagent_${definition.name}`;
    this.description = definition.description;
  }

  get schema() {
    return SubagentParams;
  }

  async execute(invocation: ToolInvocation): Promise<ToolResult> {
    const parsed = SubagentParams.safeParse(invocation.params);
    if (!parsed.success) {
      return ToolResult.errorResult(parsed.error.issues[0].message);
    }

    const params: SubagentParamsType = parsed.data;

    const subagentConfig = new Config({
      model: {
        name: this.config.model.name,
        temperature: this.config.model.temperature,
      },
      cwd: this.config.cwd,
      maxTurns: this.definition.maxTurns ?? 20,
      developerInstructions: this.config.developerInstructions,
      debug: this.config.debug,
    });

    const prompt = `You are a specialized sub-agent with a specific task to complete.

${this.definition.goalPrompt}

YOUR TASK:
${params.goal}

IMPORTANT:
- Focus only on completing the specified task
- Do not engage in unrelated actions
- Once you have completed the task or have the answer, provide your final response
- Be concise and direct in your output
`;

    const { default: Agent } = await import("../agent/agent.js");

    const toolCalls: string[] = [];
    let finalResponse: string | null = null;
    let terminateReason = "goal";
    let errorMessage: string | undefined;

    const agent = new Agent(subagentConfig);

    agent.on(AgentEventType.TOOL_CALL_START, (event) => {
      toolCalls.push(event.name);
    });
    agent.on(AgentEventType.TEXT_COMPLETE, (event) => {
      finalResponse = event.content;
    });
    agent.on(AgentEventType.AGENT_END, (event) => {
      if (finalResponse === null) {
        finalResponse = event.response;
      }
    });
    agent.on(AgentEventType.AGENT_ERROR, (event) => {
      terminateReason = "error";
      errorMessage = event.error;
      finalResponse = `Sub-agent error: ${event.error}`;
    });

    try {
      await agent.run(prompt);
    } catch (e: unknown) {
      terminateReason = "error";
      errorMessage = String(e);
      finalResponse = `Sub-agent failed: ${e}`;
    }

    const result = `Sub-agent '${this.definition.name}' completed.
Termination: ${terminateReason}
Tools called: ${toolCalls.length > 0 ? toolCalls.join(", ") : "None"}

Result:
${finalResponse ?? "No response"}`;

    if (errorMessage !== undefined) {
      return ToolResult.errorResult(result);
    }

    return ToolResult.successResult(result);
  }
}

// ---------------------------------------------------------------------------
// Built-in subagent definitions
// ---------------------------------------------------------------------------

export const CODEBASE_INVESTIGATOR: SubagentDefinition = {
  name: "codebase_investigator",
  description:
    "Investigates the codebase to answer questions about code structure, patterns, and implementations",
  goalPrompt: `You are a codebase investigation specialist.
Your job is to explore and understand code to answer questions.
Use read_file, grep, glob, and list_dir to investigate.
Do NOT modify any files.`,
  allowedTools: ["read_file", "grep", "glob", "list_dir"],
};

export const CODE_REVIEWER: SubagentDefinition = {
  name: "code_reviewer",
  description:
    "Reviews code changes and provides feedback on quality, bugs, and improvements",
  goalPrompt: `You are a code review specialist.
Your job is to review code and provide constructive feedback.
Look for bugs, code smells, security issues, and improvement opportunities.
Use read_file, list_dir and grep to examine the code.
Do NOT modify any files.`,
  allowedTools: ["read_file", "grep", "list_dir"],
  maxTurns: 10,
  timeoutMs: 300_000,
};

export function getDefaultSubagentDefinitions(): SubagentDefinition[] {
  return [CODEBASE_INVESTIGATOR, CODE_REVIEWER];
}
