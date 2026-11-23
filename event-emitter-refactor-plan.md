# Event Emitter Refactor Plan

## Goal

Replace the callback-threading architecture with Node.js `EventEmitter` on `Agent`,
make `LLMClient` a pure async function that returns structured results, and restructure
the renderer so each layer hides its own complexity behind a clean abstraction.

The end result should read top-to-bottom without needing to trace callbacks through
four layers. Every file should have one clear job.

## Guiding Principle

Each layer owns its complexity and exposes only what the caller needs:

- **`LLMClient`** — talk to OpenAI, return a result. No callbacks, no events, no leaking internals.
- **`Agent`** — run the agentic loop, emit named events. No callback parameter anywhere.
- **`compaction.ts`** — compress context, return `[summary, usage]`. Uses `LLMClient` directly.
- **`index.ts`** — subscribe to agent events, delegate to renderer. No switch blocks, no unpacking.
- **`AgentEventRenderer`** — owns the wiring between agent events and UI. `index.ts` doesn't know the details.
- **`ui/tool-renderers/`** — each tool owns its own display logic in its own file.

---

## New Files This Plan Creates

| New File | Purpose |
|---|---|
| `ui/tool-renderers/index.ts` | Exports `ToolRendererRegistry` and registers all tool renderers |
| `ui/tool-renderers/types.ts` | `ToolContentRenderer` interface — the contract every renderer must satisfy |
| `ui/tool-renderers/read-file.tsx` | `ReadFileContent` + its own async `prepare()` (syntax highlight) |
| `ui/tool-renderers/write-file.tsx` | `WriteFileContent` renderer |
| `ui/tool-renderers/shell.tsx` | `ShellContent` renderer |
| `ui/tool-renderers/grep.tsx` | `GrepContent` renderer |
| `ui/tool-renderers/glob.tsx` | `GlobContent` renderer |
| `ui/tool-renderers/list-dir.tsx` | `ListDirContent` renderer |
| `ui/tool-renderers/todos.tsx` | `TodosContent` renderer |
| `ui/tool-renderers/memory.tsx` | `MemoryContent` renderer |
| `ui/tool-renderers/web-search.tsx` | `WebSearchContent` renderer |
| `ui/tool-renderers/subagent.tsx` | `SubagentContent` renderer |
| `ui/tool-renderers/generic.tsx` | `GenericContent` renderer — fallback for unknown/MCP tools |
| `ui/agent-event-renderer.ts` | `AgentEventRenderer` class — wires `agent.on()` to render calls |

---

## Sub-Tasks

---

### Sub-Task 1 — Make `LLMClient` return a structured result

**Status:** [x] done

**Intent**

`LLMClient.chatCompletion()` currently accepts an `onEvent` callback and fires raw
`StreamEvent` objects at it. Every caller (the agent, the compactor) must write glue
code that re-assembles those events into a usable value. The method should return a
typed result directly. The streaming internals remain private and unchanged — they
just accumulate into a result object instead of firing callbacks.

**Expected Outcomes**

- `LLMResult` type added to `client/response.ts`:
  `{ text: string, toolCalls: ToolCall[], usage: TokenUsage | null, finishReason: string | undefined }`
- `chatCompletion(messages, tools?, stream?)` returns `Promise<LLMResult>` — no `onEvent` param
- `streamResponse` and `nonStreamResponse` are private, return `LLMResult`
- `StreamEvent` / `StreamEventType` remain defined in `client/response.ts` but are
  now internal implementation details — nothing outside `LLMClient` imports them
- `context/compaction.ts` `compress()` destructures `{ text, usage }` from the return
  value instead of using an event-collecting callback

**Todo List**

1. Add `LLMResult` type to `client/response.ts`
2. Rewrite `streamResponse` to accumulate into a local `LLMResult` and return it
3. Rewrite `nonStreamResponse` the same way
4. Change `chatCompletion` signature: remove `onEvent`, return `Promise<LLMResult>`
5. Update `compaction.ts` `compress()` to use the return value — remove the anonymous callback

**Relevant Context**

- `client/LLMClient.ts` — `streamResponse` (line 35), `nonStreamResponse` (line 133), `chatCompletion` (line 182)
- `client/response.ts` — add `LLMResult` here
- `context/compaction.ts` — `compress()` (line 87), the anonymous callback (lines 106–120)

---

### Sub-Task 2 — Make `Agent` extend `EventEmitter`, remove `dispatchEvent` threading

**Status:** [x] done

**Intent**

`agent.run()` accepts a `dispatchEvent` callback that is threaded as a parameter through
every private method: `agenticLoop → streamLLMResponse → executeToolCalls → maybeCompressContext`.
Every method signature carries infrastructure that has nothing to do with its actual job.

`Agent` should extend Node.js `EventEmitter`. Every `dispatchEvent(event)` call becomes
`this.emit(event.type, event)`. No callback parameter exists anywhere. `run()` becomes
`run(message: string): Promise<void>`.

The translation closure inside `streamLLMResponse` (the anonymous function passed to
`chatCompletion` that converts `StreamEvent` → `AgentEvent`) is extracted into a
private `handleLLMResult(result: LLMResult)` method now that `chatCompletion` returns
a value instead of emitting events.

**Expected Outcomes**

- `Agent extends EventEmitter`
- `run(message: string): Promise<void>` — no callback parameter
- `agenticLoop`, `streamLLMResponse`, `executeToolCalls`, `maybeCompressContext` have
  no `dispatchEvent` parameter
- All `dispatchEvent(event)` / `await dispatchEvent(event)` replaced with `this.emit(event.type, event)`
- A private `handleLLMResult(result: LLMResult)` method replaces the translation closure —
  it emits `text_delta` events and returns `{ responseText, pendingToolCalls }`
- `Agent` exports typed `on/once` overloads so listener types are inferred correctly
- `index.ts` is updated to subscribe with `agent.on(AgentEventType.X, handler)` before
  calling `agent.run(message)` — no callback passed to `run`

**Todo List**

1. Add `extends EventEmitter` to `Agent`, call `super()` in constructor, import `EventEmitter` from `node:events`
2. Add typed `on/once/emit` overloads to `Agent` covering every `AgentEventType` key
3. Remove `dispatchEvent` parameter from `run`, `agenticLoop`, `streamLLMResponse`,
   `executeToolCalls`, `maybeCompressContext`
4. Replace every `dispatchEvent(event)` with `this.emit(event.type, event)`
5. Extract the translation closure from `streamLLMResponse` into a private
   `handleLLMResult(result: LLMResult): { responseText: string, pendingToolCalls: ToolCall[] }` method
6. Update `index.ts` to use `agent.on(...)` subscriptions, then `await agent.run(message)`

**Relevant Context**

- `agent/agent.ts` — full file
- `agent/events.ts` — `AgentEventType` enum and `AgentEvent` union — event names and payloads stay identical
- `index.ts` — `runPrompt` (line 26), the `switch` block (lines 29–78) being replaced
- Sub-task 1 must be complete first

---

### Sub-Task 3 — Update `SubagentTool` to use `agent.on()` subscriptions

**Status:** [x] done

**Intent**

`SubagentTool.execute()` calls `agent.run(prompt, callback)` with an inline switch-case block.
After sub-task 2, `agent.run()` takes no callback. `SubagentTool` must subscribe to the events
it cares about before calling `run`.

The `if (Date.now() > deadline)` timeout guard inside the old callback is removed — it relied on
being called synchronously inside the callback and is unreliable anyway. The existing `maxTurns`
config already limits runaway subagents, and it is already set via `this.definition.maxTurns ?? 20`.

**Expected Outcomes**

- `agent.run(prompt)` called with no callback
- `agent.on(AgentEventType.TOOL_CALL_START, ...)`, `agent.on(AgentEventType.TEXT_COMPLETE, ...)`,
  `agent.on(AgentEventType.AGENT_END, ...)`, `agent.on(AgentEventType.AGENT_ERROR, ...)` wired
  before the `run()` call
- `toolCalls`, `finalResponse`, `terminateReason`, `errorMessage` populated correctly
  from the new listeners — same values as before
- The `if (Date.now() > deadline)` guard is removed

**Todo List**

1. Remove the callback argument from `agent.run(prompt, callback)` in `SubagentTool.execute()`
2. Wire `agent.on(...)` for `TOOL_CALL_START`, `TEXT_COMPLETE`, `AGENT_END`, `AGENT_ERROR`
3. Remove the `if (Date.now() > deadline)` deadline guard
4. Verify `terminateReason`, `finalResponse`, `errorMessage`, `toolCalls` are still correct

**Relevant Context**

- `tools/subagents.ts` — `SubagentTool.execute()` (line 54), the `agent.run()` call (line 100)
- Sub-task 2 must be complete first

---

### Sub-Task 4 — Split `tool-complete-panel.tsx` into per-tool renderer files

**Status:** [x] done

**Intent**

`ui/tool-complete-panel.tsx` is 979 lines. It contains ten distinct tool content components,
a parser function, a registry-shaped `if/else` chain in `ToolCallCompletePanel`, and async
pre-processing logic that belongs elsewhere. There is no cohesion — the only reason they share
a file is that they were all added in sequence.

Each tool content component moves to its own file under `ui/tool-renderers/`. A
`ToolContentRenderer` interface defines the contract: `prepare()` (async, returns extra props)
and `render()` (returns a React node). A `ToolRendererRegistry` in `ui/tool-renderers/index.ts`
maps tool names to their renderer — the `if/else` chain in `ToolCallCompletePanel` is replaced
with a single registry lookup.

The `read_file` syntax-highlight pre-processing (currently living in `renderer.tsx`
`renderToolCallComplete`) moves into the `ReadFileContent` renderer's own `prepare()` method —
the generic dispatcher no longer needs to know about it.

MCP tools (prefixed `serverName__`) fall through to `GenericContent` automatically —
no special case, no crash.

**Expected Outcomes**

- `ui/tool-renderers/types.ts` defines `ToolContentRenderer` interface
- One file per tool under `ui/tool-renderers/` (see new files table above)
- `ui/tool-renderers/index.ts` creates and exports a populated `ToolRendererRegistry`
  instance with all tools registered, including a `subagent_` prefix handler
- `ui/tool-complete-panel.tsx` shrinks to ~50 lines: imports the registry,
  does one lookup, calls `prepare()` + `render()` — no tool-specific logic remains
- The `extractReadFileCode` export moves into `ui/tool-renderers/read-file.tsx`
- The `read_file` syntax-highlight block moves from `renderer.tsx` into the
  `ReadFileContent` renderer's `prepare()` method
- All existing visual output is identical — no UI changes

**Todo List**

1. Create `ui/tool-renderers/types.ts` with the `ToolContentRenderer` interface
2. Create one file per tool, copying the relevant component from `tool-complete-panel.tsx`,
   wrapping it in a `ToolContentRenderer` implementation
3. Move `extractReadFileCode` + syntax-highlight `prepare()` logic into `ui/tool-renderers/read-file.tsx`
4. Create `ui/tool-renderers/generic.tsx` for the fallback
5. Create `ui/tool-renderers/index.ts` — instantiate `ToolRendererRegistry`, register all renderers,
   export the singleton
6. Rewrite `ToolCallCompletePanel` in `ui/tool-complete-panel.tsx` to use the registry:
   lookup → `await renderer.prepare(props)` → `renderer.render(props, prepared)`
7. Remove the syntax-highlight block from `renderer.tsx` `renderToolCallComplete`
   (it now lives in `read-file.tsx` `prepare()`)
8. Delete all the old content components from `tool-complete-panel.tsx`

**Relevant Context**

- `ui/tool-complete-panel.tsx` — all content components (lines 37–835), `ToolCallCompletePanel` (line 856)
- `ui/renderer.tsx` — `renderToolCallComplete` syntax-highlight block (lines 176–183)
- `ui/highlight.ts` — `highlightCode` function used by `read_file` renderer

---

### Sub-Task 5 — Create `AgentEventRenderer`, clean up `renderer.tsx` and `index.ts`

**Status:** [x] done

**Intent**

`index.ts` currently has an 11-argument `renderToolCallComplete` call and a `switch(event.type)`
block with 6 cases. After sub-tasks 2 and 4, the renderer can accept event objects directly and
all the wiring can be encapsulated in one class.

`AgentEventRenderer` takes ownership of subscribing to all agent events and dispatching to the
right render function. `index.ts` becomes: create agent, create renderer, attach, run — nothing else.

`createAssistantRenderer` is converted to a proper `AssistantRenderer` class so it has a named
type and a clear lifecycle instead of being an anonymous object literal.

**Expected Outcomes**

- `renderToolCallStart(event: ToolCallStartEvent, cwd: string)` — 2 args instead of 5
- `renderToolCallComplete(event: ToolCallCompleteEvent, cwd: string)` — 2 args instead of 11;
  no more tool-specific logic inside (moved to sub-task 4)
- `createAssistantRenderer` factory → `AssistantRenderer` class with `write(delta)`, `end()`,
  `waitUntilExit()` — same stdout implementation, proper named type
- `ui/agent-event-renderer.ts` contains `AgentEventRenderer` class:
  - constructor accepts `cwd: string`
  - `attach(agent: Agent): void` — wires all `agent.on(...)` subscriptions internally
- `index.ts` `runPrompt` becomes ~5 lines:
  ```ts
  const renderer = new AgentEventRenderer(config.cwd);
  renderer.attach(agent);
  await agent.run(prompt);
  ```
- No behavioural changes — same events, same visual output

**Todo List**

1. Change `renderToolCallStart` signature to `(event: ToolCallStartEvent, cwd: string)`
2. Change `renderToolCallComplete` signature to `(event: ToolCallCompleteEvent, cwd: string)`
   — internal prop spreading replaces manual unpacking
3. Convert `createAssistantRenderer` factory into `AssistantRenderer` class
4. Create `ui/agent-event-renderer.ts` with `AgentEventRenderer` class and `attach(agent)` method
5. Update `index.ts` `runPrompt` to use `AgentEventRenderer`
6. Remove the `switch(event.type)` block from `index.ts`

**Relevant Context**

- `ui/renderer.tsx` — `renderToolCallStart` (line 141), `renderToolCallComplete` (line 161),
  `createAssistantRenderer` (line 120)
- `ui/agent-event-renderer.ts` — new file
- `index.ts` — `runPrompt` (line 26)
- `agent/events.ts` — `ToolCallStartEvent`, `ToolCallCompleteEvent` types
- Sub-tasks 2 and 4 must be complete first

---

## What Does Not Change

These are explicitly out of scope — they work correctly and are not coupled to the
callback or renderer systems:

| File | Reason untouched |
|---|---|
| `context/manager.ts` | Pure data structure, no events |
| `tools/registry.ts` | Synchronous dispatch, unaffected |
| `tools/base.ts` | Value objects only |
| All builtin tools (`tools/builtin/`) | `execute()` returns `ToolResult`, nothing changes |
| `tools/mcp/` | Registers into `ToolRegistry`, unaffected |
| `agent/events.ts` | Event types stay identical — only how they are emitted changes |
| `agent/session.ts` | Lifecycle management, no event involvement |
| `tools/discovery.ts` | Filesystem scanning, unaffected |
| `ui/theme.ts` | Pure styling constants |
| `ui/tool-panel.tsx` | `ToolCallPanel` (start state panel) — untouched |
| `ui/highlight.ts` | Imported by the new `read-file.tsx` renderer, not changed |

---

## Execution Order

```
Sub-Task 1   LLMClient returns LLMResult — no callbacks
    ↓
Sub-Task 2   Agent extends EventEmitter — no dispatchEvent param anywhere
    ↓
Sub-Task 3   SubagentTool uses agent.on — follows new Agent API
    ↓
Sub-Task 4   Split tool-complete-panel into ui/tool-renderers/ — one file per tool
    ↓
Sub-Task 5   AgentEventRenderer + clean index.ts — consumes everything above
```
