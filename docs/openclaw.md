# OpenClaw Integration

Use `claude-code-acp` as an ACP backend for [OpenClaw](https://github.com/openclaw/openclaw), enabling Claude Code with your Pro/Max subscription from Discord, Telegram, and other OpenClaw channels.

## Setup

### 1. Build claude-code-acp

```sh
cd /path/to/claude-code-acp
npm install
npm run build
```

### 2. Configure acpx to use claude-code-acp

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

### 3. Install and enable the acpx plugin in OpenClaw

```sh
openclaw plugins install acpx
openclaw config set plugins.entries.acpx.enabled true
openclaw config set plugins.entries.acpx.config.expectedVersion any
openclaw config set plugins.entries.acpx.config.permissionMode approve-all
openclaw config set plugins.entries.acpx.config.nonInteractivePermissions deny
```

### 4. Enable ACP in OpenClaw

```sh
openclaw config set acp.enabled true
openclaw config set acp.backend acpx
openclaw config set acp.defaultAgent claude
openclaw config set acp.allowedAgents '["claude"]'
```

### 5. Enable thread bindings (for Discord)

```sh
openclaw config set channels.discord.threadBindings.spawnAcpSessions true
```

### 6. Restart the gateway

Restart the OpenClaw gateway to load the new configuration.

## Usage

From Discord (or any OpenClaw channel):

```
/acp spawn claude
```

This creates a thread-bound ACP session. Send messages in the thread to interact with Claude Code.

### Commands

| Command | Description |
|---|---|
| `/acp spawn claude` | Start a new Claude Code session |
| `/acp status` | Check session status |
| `/acp cancel` | Cancel the current turn |
| `/acp close` | End the session |
| `/acp model <id>` | Change model (e.g. `opus`, `sonnet`) |

## How it works

```
Discord message
  -> OpenClaw Gateway
    -> acpx plugin
      -> claude-code-acp (ACP server over stdio)
        -> claude -p --output-format stream-json --verbose
          -> Claude API (via Pro/Max subscription)
```

The key difference from the default acpx `claude` target: the default uses `@anthropic-ai/claude-agent-sdk` which requires an API key. This bridge uses the Claude Code CLI directly, which authenticates via your Pro/Max subscription.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `ACP_SESSION_INIT_FAILED: acpx exited with code 1` | acpx not finding claude-code-acp | Check `~/.acpx/config.json` agent command path |
| `acpx runtime backend ready` but no response | Claude Code CLI not authenticated | Run `claude auth login` |
| Session hangs indefinitely | Missing `--verbose` flag for stream-json | Rebuild claude-code-acp (`npm run build`) |
| `plugin service failed: command must be a non-empty string` | Empty `command` in acpx plugin config | Remove `command` key from `plugins.entries.acpx.config` |
