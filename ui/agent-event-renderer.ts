import Agent from "../agent/agent.js";
import { AgentEventType } from "../agent/events.js";
import {
  AssistantRenderer,
  renderToolCallStart,
  renderToolCallComplete,
  renderError,
} from "./renderer.js";

/**
 * Wires all agent events to their UI renderers.
 *
 * Usage:
 *   const renderer = new AgentEventRenderer(config.cwd);
 *   renderer.attach(agent);
 *   await agent.run(prompt);
 */
export class AgentEventRenderer {
  private readonly cwd: string;

  constructor(cwd: string) {
    this.cwd = cwd;
  }

  attach(agent: Agent): void {
    const assistantRenderer = new AssistantRenderer();

    agent.on(AgentEventType.TEXT_DELTA, (event) => {
      assistantRenderer.write(event.content);
    });

    agent.on(AgentEventType.TEXT_COMPLETE, async () => {
      assistantRenderer.end();
      await assistantRenderer.waitUntilExit();
    });

    agent.on(AgentEventType.TOOL_CALL_START, async (event) => {
      await renderToolCallStart(event, this.cwd);
    });

    agent.on(AgentEventType.TOOL_CALL_COMPLETE, async (event) => {
      await renderToolCallComplete(event, this.cwd);
    });

    agent.on(AgentEventType.AGENT_ERROR, async (event) => {
      assistantRenderer.end();
      await assistantRenderer.waitUntilExit();
      await renderError(event.error);
    });

    agent.on(AgentEventType.CONTEXT_COMPACTED, (event) => {
      console.log(
        `\n[Context compacted: ${event.tokensBefore} → ${event.tokensAfter} tokens]\n`,
      );
    });
  }
}
