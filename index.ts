import * as readline from "readline";
import Agent from "./agent/agent.js";
import { AgentEventRenderer } from "./ui/agent-event-renderer.js";
import { renderWelcome } from "./ui/renderer.js";
import { loadConfig } from "./config/loader.js";

const args = process.argv.slice(2);
let singlePrompt = "";
let forceInteractive = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--interactive") {
    forceInteractive = true;
  } else if (args[i] === "--prompt" && i + 1 < args.length) {
    singlePrompt = args[i + 1];
    i++;
  } else if (!args[i].startsWith("-")) {
    singlePrompt = args[i];
  }
}

if (forceInteractive) singlePrompt = "";

const config = loadConfig();
const agent = new Agent(config);
const renderer = new AgentEventRenderer(config.cwd);
renderer.attach(agent);

async function runPrompt(prompt: string): Promise<void> {
  await agent.run(prompt);
}

// Single-shot mode: --prompt "..."
if (singlePrompt) {
  await runPrompt(singlePrompt);
  agent.close();
  process.exit(0);
}

// Interactive REPL mode
await renderWelcome("AI Agent", [
  `Model: ${config.modelName}`,
  'Type your prompt and press Enter. Type "exit" to quit.',
]);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true,
});

const askQuestion = (): void => {
  rl.question("\nyou: ", async (input) => {
    const prompt = input.trim();

    if (prompt === "exit" || prompt === "quit") {
      agent.close();
      rl.close();
      return;
    }

    if (!prompt) {
      askQuestion();
      return;
    }

    await runPrompt(prompt);
    askQuestion();
  });
};

askQuestion();

rl.on("close", () => {
  process.exit(0);
});
