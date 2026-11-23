# AI Harness

TypeScript AI harness for running an OpenAI-compatible coding agent from the terminal with streaming output, tool execution, session context, and lightweight persistent memory.

## Overview

This repository is a small agent runtime built around chat completions plus tool calling. It includes:

- a CLI for one-shot and interactive sessions in [`index.ts`](index.ts)
- a recursive agent loop in [`Agent`](agent/agent.ts:22)
- streamed model responses and tool-call reconstruction in [`LLMClient`](client/LLMClient.ts:15)
- message/state assembly in [`ContextManager`](context/manager.ts:71)
- a default tool registry in [`createDefaultRegistry()`](tools/registry.ts:93)
- system prompt construction in [`getSystemPrompt()`](prompts/system.ts:15)

## Features

- OpenAI-compatible API client configured via [`Config`](config/config.ts:64)
- Single-prompt and interactive CLI commands in [`index.ts`](index.ts)
- Streaming assistant text and tool execution events
- Built-in filesystem, shell, search, web, todo, and memory tools under [`tools/builtin`](tools/builtin)
- Project instructions loaded from `AGENT.MD` in the current working directory by [`loadConfig()`](config/loader.ts:87)
- Persistent user memory stored at `~/.ai-agent-data/user_memory.json` by [`MemoryTool`](tools/builtin/memory.ts:17)
- Shell environment filtering via [`ShellEnvironmentPolicy`](config/config.ts:8)

## Requirements

- Node.js 20+
- npm
- An OpenAI-compatible API endpoint
- Environment variables:
  - `API_KEY` required
  - `BASE_URL` optional
  - `MODEL_NAME` optional, defaults to `nvidia/nemotron-3-super-120b-a12b:free`
  - `TAVLY_API_KEY` optional, only needed for [`web_search`](tools/builtin/webSearch.ts:27) and [`web_fetch`](tools/builtin/webFetch.ts:29)

## Installation

```bash
npm install
```

Create a [`.env`](.env) file or export variables in your shell:

```bash
API_KEY=your_api_key
BASE_URL=https://your-openai-compatible-endpoint/v1
MODEL_NAME=your-model-name
TAVLY_API_KEY=your-tavily-key
```

## Usage

Run one prompt:

```bash
npm run start -- ask "summarize this repository"
```

Start interactive mode:

```bash
npm run start -- interactive
```

## Architecture

- [`index.ts`](index.ts) sets up the CLI and renders streamed agent/tool events.
- [`agent/session.ts`](agent/session.ts:42) creates the client, registry, memory, and context manager.
- [`agent/agent.ts`](agent/agent.ts:52) runs the model/tool loop until completion or max turns.
- [`context/manager.ts`](context/manager.ts:71) stores user, assistant, system, and tool messages.
- [`client/LLMClient.ts`](client/LLMClient.ts:182) sends chat completions and streams response events.
- [`tools/registry.ts`](tools/registry.ts:19) validates, registers, and invokes tools.
- [`prompts/system.ts`](prompts/system.ts:15) assembles the system prompt given environment, tools, memory, and instructions.

## Built-in tools

The default registry from [`createDefaultRegistry()`](tools/registry.ts:93) includes:

- [`ReadFileTool`](tools/builtin/readFile.ts:46)
- [`WriteFileTool`](tools/builtin/writeFile.ts:38)
- [`EditFileTool`](tools/builtin/editFile.ts:47)
- [`ShellTool`](tools/builtin/shell.ts:41)
- [`ListDirectoryTool`](tools/builtin/listDirectory.ts:35)
- [`GrepTool`](tools/builtin/grep.ts:44)
- [`GlobTool`](tools/builtin/glob.ts:41)
- [`WebSearchTool`](tools/builtin/webSearch.ts:27)
- [`WebFetchTool`](tools/builtin/webFetch.ts:29)
- [`TodosTool`](tools/builtin/todo.ts:24)
- [`MemoryTool`](tools/builtin/memory.ts:17)