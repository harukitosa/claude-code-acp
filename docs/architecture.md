# Architecture

## Overview

claude-code-acp is a bridge between ACP (Agent Client Protocol) clients and the Claude Code CLI. It translates ACP's JSON-RPC messages into Claude Code subprocess invocations and streams results back.

```
┌──────────────┐    stdio (JSON-RPC)    ┌──────────────────┐    subprocess    ┌────────────┐
│  ACP Client  │ ◄───────────────────► │  claude-code-acp  │ ◄────────────► │ claude CLI  │
│ (Zed, JB,..) │                        │                    │                │ (Pro/Max)   │
└──────────────┘                        └──────────────────┘                └────────────┘
```

## Components

### `src/index.ts` — Entry Point

Sets up the stdio transport using `ndJsonStream` from the ACP SDK and creates an `AgentSideConnection`. Handles process lifecycle (SIGINT, SIGTERM).

### `src/agent.ts` — ACP Method Handlers

Implements the `Agent` interface from `@agentclientprotocol/sdk`:

- **`initialize`** — Returns protocol version, agent info, and capabilities
- **`newSession`** — Creates a new session, stores cwd and MCP server config
- **`prompt`** — Extracts text from content blocks, runs Claude Code, streams results via `session/update` notifications
- **`cancel`** — Kills the running Claude Code subprocess
- **`authenticate`** — No-op (authentication is handled by Claude Code login)

### `src/claude-runner.ts` — Claude Code Subprocess Manager

Manages spawning and communicating with the `claude` CLI:

- **`startSession`** / **`startSessionStreaming`** — First prompt in a session (no `--resume`)
- **`continueSession`** / **`continueSessionStreaming`** — Subsequent prompts (uses `--resume <uuid>`)
- **`startSessionWithMcp`** — First prompt with MCP server config (writes temp `--mcp-config` file)
- **`cancel`** — Sends SIGTERM to running process

All methods strip `ANTHROPIC_API_KEY` from the environment to ensure subscription billing.

### `src/session-store.ts` — Session Mapping

Maps ACP session IDs to Claude Code session UUIDs. Stores:

- Working directory (`cwd`)
- Claude Code session UUID (set after first prompt)
- MCP server configurations
- Creation timestamp

### `src/config.ts` — Configuration

Reads environment variables into a typed `AgentConfig` object. See [configuration.md](configuration.md).

### `src/logger.ts` — Structured Logger

Writes structured log messages to stderr (ACP requires stdout for protocol messages). Supports log levels via `LOG_LEVEL` environment variable.

## Data Flow

### Session Lifecycle

```
Client                          Bridge                         Claude CLI
  │                               │                               │
  │── initialize ────────────────►│                               │
  │◄─ { protocolVersion, ... } ──│                               │
  │                               │                               │
  │── session/new ───────────────►│                               │
  │   { cwd: "/project" }        │── store session ──►           │
  │◄─ { sessionId: "abc" } ──────│                               │
  │                               │                               │
  │── session/prompt ────────────►│                               │
  │   { text: "explain auth" }   │── claude -p "..." ──────────►│
  │                               │   --output-format stream-json │
  │                               │                               │
  │◄─ session/update ────────────│◄─ {"type":"content_block_... │
  │   (agent_message_chunk)       │      delta","text":"..."}     │
  │◄─ session/update ────────────│◄─ {"type":"content_block_... │
  │   (agent_message_chunk)       │                               │
  │◄─ session/update ────────────│◄─ {"type":"tool_call",...}   │
  │   (tool_call)                 │                               │
  │                               │◄─ exit 0 ────────────────────│
  │◄─ { stopReason: "end_turn" }─│                               │
  │                               │                               │
  │── session/prompt ────────────►│                               │
  │   { text: "now refactor" }   │── claude -p "..." ──────────►│
  │                               │   --resume <uuid>             │
  │                               │   --output-format stream-json │
  │   ...                         │   ...                         │
```

### Streaming

The bridge parses Claude Code's NDJSON (`--output-format stream-json`) line by line:

1. `content_block_delta` with `text_delta` → `session/update` with `agent_message_chunk`
2. `assistant` message with `tool_use` content → `session/update` with `tool_call`
3. `result` event → extract final text and session UUID

Partial lines are buffered until a complete newline-terminated JSON line is received.

### MCP Server Passthrough

When `session/new` includes `mcpServers`, the bridge:

1. Converts the ACP MCP server format to Claude Code's format
2. Writes a temporary `mcp.json` config file
3. Passes `--mcp-config /tmp/.../mcp.json` to the Claude CLI
4. Cleans up temp files on process exit
