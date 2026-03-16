# JetBrains IDE Setup

JetBrains IDEs (IntelliJ IDEA, WebStorm, PyCharm, etc.) support ACP agents through the AI Assistant plugin.

## Prerequisites

1. JetBrains IDE with AI Assistant plugin (2025.1+)
2. Claude Code CLI installed and logged in
3. claude-code-acp installed globally

```sh
npm install -g claude-code-acp
claude auth login
```

## Configuration

### Option 1: ACP Agent Registry (Recommended)

If claude-code-acp is registered in the [ACP Agent Registry](https://agentclientprotocol.com/registry), it will appear automatically in your IDE's agent list.

### Option 2: Manual Configuration

Add the agent to your IDE settings:

1. Open **Settings** > **Tools** > **AI Assistant** > **ACP Agents**
2. Click **Add Agent**
3. Configure:
   - **Name**: Claude Code
   - **Command**: `npx`
   - **Arguments**: `claude-code-acp`
   - **Working Directory**: (leave empty for project root)

Or edit the configuration file directly. Location varies by OS:

- **macOS**: `~/Library/Application Support/JetBrains/<product>/options/acp-agents.xml`
- **Linux**: `~/.config/JetBrains/<product>/options/acp-agents.xml`
- **Windows**: `%APPDATA%\JetBrains\<product>\options\acp-agents.xml`

## Environment Variables

To pass environment variables, set them in your shell profile or use a wrapper script:

```sh
#!/bin/sh
# ~/bin/claude-code-acp-wrapper.sh
export CLAUDE_ACP_MODEL=opus
export CLAUDE_ACP_ALLOWED_TOOLS="Bash,Read,Edit,Glob,Grep"
exec npx claude-code-acp
```

Then point the IDE configuration to this wrapper script instead.

## Troubleshooting

### Agent doesn't start

Check that the Claude CLI is accessible:

```sh
which claude
claude auth status
```

### Permission prompts block execution

In headless mode, Claude Code may block on tool permission prompts. Set allowed tools or skip permissions:

```sh
CLAUDE_ACP_SKIP_PERMISSIONS=true npx claude-code-acp
```

### View logs

Redirect stderr to a file for debugging:

```sh
LOG_LEVEL=debug npx claude-code-acp 2>/tmp/claude-acp.log
```
