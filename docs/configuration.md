# Configuration

claude-code-acp is configured entirely through environment variables. No config files are needed.

## Environment Variables

### `CLAUDE_ACP_MODEL`

Select which Claude model to use.

```sh
CLAUDE_ACP_MODEL=opus npx claude-code-acp
```

Accepted values:
- `sonnet` — Claude Sonnet (faster, cheaper)
- `opus` — Claude Opus (most capable)
- Full model ID like `claude-sonnet-4-6`

If not set, Claude Code uses its default model.

### `CLAUDE_ACP_ALLOWED_TOOLS`

Comma-separated list of tools that Claude Code can execute without permission prompts.

```sh
CLAUDE_ACP_ALLOWED_TOOLS="Bash,Read,Edit,Glob,Grep" npx claude-code-acp
```

Supports prefix matching (e.g., `"Bash(git diff *)"` allows only git diff commands).

If not set, Claude Code will follow its default permission behavior — which may block on tool calls in headless mode. Consider combining with `CLAUDE_ACP_SKIP_PERMISSIONS` for automated setups.

### `CLAUDE_ACP_MAX_TURNS`

Maximum number of agentic turns per prompt. Claude Code exits with an error when the limit is reached.

```sh
CLAUDE_ACP_MAX_TURNS=10 npx claude-code-acp
```

Useful for limiting cost and preventing runaway loops.

### `CLAUDE_ACP_TIMEOUT`

Timeout in milliseconds for each Claude Code invocation.

```sh
CLAUDE_ACP_TIMEOUT=60000 npx claude-code-acp  # 1 minute
```

Default: `300000` (5 minutes).

### `CLAUDE_ACP_SKIP_PERMISSIONS`

Skip all permission prompts. **Use with caution** — this allows Claude Code to execute any tool without confirmation.

```sh
CLAUDE_ACP_SKIP_PERMISSIONS=true npx claude-code-acp
```

Default: `false`.

This passes `--dangerously-skip-permissions` to the Claude CLI. Only use this in trusted environments.

### `LOG_LEVEL`

Controls log verbosity. Logs are written to stderr.

```sh
LOG_LEVEL=debug npx claude-code-acp
```

Levels (from most to least verbose):
- `debug` — All messages including CLI arguments and stream events
- `info` — Session lifecycle, prompt processing (default)
- `warn` — Warnings only
- `error` — Errors only

## Authentication

Authentication is handled by Claude Code itself. Before running claude-code-acp, log in:

```sh
claude auth login
```

You can verify your login status:

```sh
claude auth status
```

### Important: Do NOT set `ANTHROPIC_API_KEY`

If the `ANTHROPIC_API_KEY` environment variable is present, Claude Code will use API billing instead of your Pro/Max subscription. The bridge explicitly strips this variable from the Claude CLI's environment, but it's best to not have it set at all.

```sh
# Bad — will use API billing
ANTHROPIC_API_KEY=sk-... npx claude-code-acp

# Good — uses subscription
npx claude-code-acp
```

## Example Configurations

### Conservative (read-only)

```sh
CLAUDE_ACP_MODEL=sonnet \
CLAUDE_ACP_ALLOWED_TOOLS="Read,Glob,Grep" \
CLAUDE_ACP_MAX_TURNS=5 \
npx claude-code-acp
```

### Full access (trusted environment)

```sh
CLAUDE_ACP_MODEL=opus \
CLAUDE_ACP_SKIP_PERMISSIONS=true \
npx claude-code-acp
```

### Debugging

```sh
LOG_LEVEL=debug npx claude-code-acp 2>claude-acp.log
```
