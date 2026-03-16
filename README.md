# claude-code-acp

[Agent Client Protocol (ACP)](https://agentclientprotocol.com/) bridge for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI.

Use Claude Code with your **Pro / Max subscription** from any ACP-compatible client — Zed, JetBrains IDEs, and more.

```
ACP Client (Zed, JetBrains, ...)
  ↕  stdio  (JSON-RPC 2.0)
claude-code-acp
  ↕  subprocess
claude CLI  (logged in with Pro/Max)
```

## Why?

Claude's paid plans (Pro / Max) and the Claude API are **separate products**. API access requires a Console account and API key. However, Claude Code CLI can run under your subscription — no API key needed.

This project wraps Claude Code CLI as an ACP Agent, so ACP-compatible editors can talk to it directly using your existing subscription.

## Prerequisites

- **Node.js** >= 20
- **Claude Code CLI** installed and authenticated

```sh
# Install Claude Code if you haven't
npm install -g @anthropic-ai/claude-code

# Log in with your Pro/Max account
claude auth login
```

> **Important:** Do NOT set `ANTHROPIC_API_KEY` in your environment. If it's present, Claude Code will use API billing instead of your subscription.

## Installation

```sh
npm install -g claude-code-acp
```

Or run directly:

```sh
npx claude-code-acp
```

## Quick Start

### Zed

Add to your Zed settings (`settings.json`):

```json
{
  "agent": {
    "profiles": {
      "claude-code": {
        "provider": "acp",
        "binary": {
          "path": "npx",
          "args": ["claude-code-acp"]
        }
      }
    }
  }
}
```

### JetBrains IDEs

See [docs/jetbrains.md](docs/jetbrains.md) for JetBrains setup instructions.

### Manual / Custom Client

The agent communicates over **stdio** using newline-delimited JSON-RPC 2.0. Spawn the process and speak ACP:

```sh
node /path/to/claude-code-acp/dist/index.js
```

See [docs/protocol.md](docs/protocol.md) for the full message flow.

## Configuration

All configuration is done via environment variables:

| Variable | Description | Default |
|---|---|---|
| `CLAUDE_ACP_MODEL` | Model to use (`sonnet`, `opus`, or full ID) | (Claude Code default) |
| `CLAUDE_ACP_ALLOWED_TOOLS` | Comma-separated list of allowed tools | (none) |
| `CLAUDE_ACP_MAX_TURNS` | Max agentic turns per prompt | (unlimited) |
| `CLAUDE_ACP_TIMEOUT` | Timeout in milliseconds | `300000` (5 min) |
| `CLAUDE_ACP_SKIP_PERMISSIONS` | Skip all permission prompts (`true`/`false`) | `false` |
| `LOG_LEVEL` | Log verbosity (`debug`, `info`, `warn`, `error`) | `info` |

Example:

```sh
CLAUDE_ACP_MODEL=opus CLAUDE_ACP_ALLOWED_TOOLS="Bash,Read,Edit" npx claude-code-acp
```

See [docs/configuration.md](docs/configuration.md) for details.

## How It Works

1. An ACP client spawns `claude-code-acp` as a subprocess
2. The client sends `initialize`, then `session/new` to create a session
3. For each user message, the client sends `session/prompt`
4. Internally, the bridge runs `claude -p --output-format stream-json --verbose` and streams results back as `session/update` notifications
5. Session continuity is maintained by mapping ACP session IDs to Claude Code session UUIDs via `--resume`

See [docs/architecture.md](docs/architecture.md) for a deeper look.

## Supported ACP Features

| Feature | Status |
|---|---|
| `initialize` | Supported |
| `session/new` | Supported |
| `session/prompt` | Supported (streaming) |
| `session/cancel` | Supported |
| `authenticate` | No-op (auth is via Claude Code login) |
| `session/update` — text chunks | Supported |
| `session/update` — tool calls | Supported |
| MCP server passthrough | Supported (stdio transport) |
| `session/load` | Not yet |
| `session/list` | Not yet |
| Image / audio prompts | Not yet |

## Use with acpx / OpenClaw

You can use this bridge as a custom agent target for [acpx](https://www.npmjs.com/package/acpx), which enables integration with [OpenClaw](https://github.com/openclaw/openclaw) and other ACP orchestrators.

Add to `~/.acpx/config.json`:

```json
{
  "agents": {
    "claude": {
      "command": "node /path/to/claude-code-acp/dist/index.js"
    }
  }
}
```

Then use it via acpx:

```sh
acpx claude exec "summarize this repo"
acpx claude "fix the failing tests"
```

For OpenClaw gateway integration, enable the acpx plugin and set `acp.defaultAgent` to `claude`. See [docs/openclaw.md](docs/openclaw.md) for the full setup guide.

## Development

```sh
git clone https://github.com/harukitosa/claude-code-acp.git
cd claude-code-acp
npm install
npm test          # Run all tests (57 tests)
npm run build     # Build to dist/
npm run test:watch # Watch mode
```

See [docs/development.md](docs/development.md) for contribution guidelines.

## License

MIT
