# Max Turns Plan

## Overview

Implement enforcement of `config.maxTurns` in the agentic loop. A **turn** is counted each time the LLM responds with one or more tool calls (a tool-executing round-trip). Pure text responses do not count. When `session.turnCount` reaches `config.maxTurns`, the loop stops and a new `AGENT_MAX_TURNS` event is emitted before returning. `Session` already owns `turnCount` and `incrementTurn()` — those are used as-is.

---

## Sub-Tasks

### 1. Add `AGENT_MAX_TURNS` event type and factory to `events.ts`

**Intent**: Introduce the new event variant so the rest of the codebase can produce and consume it in a type-safe way.

**Expected Outcomes**:
- `AgentEventType.AGENT_MAX_TURNS = "agent_max_turns"` enum value exists.
- `AgentMaxTurnsEvent` type is defined with fields `type` and `turns: number`.
- `AgentMaxTurnsEvent` is added to the `AgentEvent` union.
- `agentMaxTurns(turns: number): AgentMaxTurnsEvent` factory is exported.

**Todo List**:
1. Add `AGENT_MAX_TURNS = "agent_max_turns"` to the `AgentEventType` enum.
2. Define `AgentMaxTurnsEvent` type with `type: AgentEventType.AGENT_MAX_TURNS` and `turns: number`.
3. Add `AgentMaxTurnsEvent` to the `AgentEvent` union.
4. Export factory `agentMaxTurns(turns: number): AgentMaxTurnsEvent`.

**Relevant Context**:
- [`agent/events.ts`](agent/events.ts) — all event types and factories live here; follow the existing pattern exactly (enum value → type → union → factory).

**Status**: `[x] done`

---

### 2. Add `hasReachedMaxTurns()` helper to `Session`

**Intent**: Encapsulate the turn-limit check inside `Session`, which already owns `turnCount` and `config.maxTurns`. Keeps the agent loop clean.

**Expected Outcomes**:
- `Session` exposes a `hasReachedMaxTurns(): boolean` method that returns `this.turnCount >= this.config.maxTurns`.
- No turn-counting logic leaks into `Agent`.

**Todo List**:
1. Add `hasReachedMaxTurns(): boolean` to [`agent/session.ts`](agent/session.ts) that returns `this.turnCount >= this.config.maxTurns`.

**Relevant Context**:
- [`agent/session.ts`](agent/session.ts) — `turnCount`, `incrementTurn()`, and `config.maxTurns` are all already present here.

**Status**: `[x] done`

---

### 3. Wire recursion and max-turns enforcement into `agenticLoop`

**Intent**: `agenticLoop` currently exits after one round-trip — it never recurses. This sub-task adds the recursive call (so multi-turn tool use actually works) and guards it with the max-turns check.

**Expected Outcomes**:
- After all tool results are added to the context, if `pendingToolCalls.length > 0`:
  1. `session.incrementTurn()` is called.
  2. If `session.hasReachedMaxTurns()` is true, emit `agentMaxTurns(session.turnCount)` and return — do not recurse.
  3. Otherwise, recurse: `await this.agenticLoop(onEvent)`.
- Pure text responses (no tool calls) exit without incrementing or checking.
- Import `agentMaxTurns` from `./events.js`.

**Todo List**:
1. Import `agentMaxTurns` in [`agent/agent.ts`](agent/agent.ts).
2. After the `for (const toolResult of toolResultMessages)` block, add:
   - `this.session.incrementTurn()`
   - `if (this.session.hasReachedMaxTurns()) { await onEvent(agentMaxTurns(this.session.turnCount)); return; }`
   - `await this.agenticLoop(onEvent);`

**Relevant Context**:
- [`agent/agent.ts`](agent/agent.ts:138) — tool results are committed to context at line 138–143; the recursive call goes immediately after.
- [`agent/session.ts`](agent/session.ts:32) — `incrementTurn()` already updates `updatedAt`.

**Status**: `[x] done`

---

### 4. Handle `AGENT_MAX_TURNS` in the CLI renderer

**Intent**: Surface the max-turns event to the user so they see a clear message rather than a silent stop.

**Expected Outcomes**:
- When `AGENT_MAX_TURNS` is received in `processMessage`, the current renderer is finished and `renderError` is called with a message like `"Agent stopped: reached max turns (N)"`.
- `finalResponse` is left as whatever was last set so the return value is not silently null.

**Todo List**:
1. In [`index.ts`](index.ts:125) `processMessage`, add an `else if` branch for `AgentEventType.AGENT_MAX_TURNS`.
2. Inside the branch: `await finishRenderer()`, then set `errorMessage` to `\`Agent stopped: reached max turns (${event.turns})\``.

**Relevant Context**:
- [`index.ts`](index.ts:125) — `AGENT_ERROR` branch at line 125 is the exact model to follow.
- `AgentMaxTurnsEvent` carries `turns: number` for use in the message.

**Status**: `[x] done`
