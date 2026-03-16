# ACP Protocol Reference

claude-code-acp communicates over **stdio** using **newline-delimited JSON-RPC 2.0**, as specified by the [Agent Client Protocol](https://agentclientprotocol.com/).

## Transport

- **Input**: stdin (client → agent)
- **Output**: stdout (agent → client)
- **Logs**: stderr (not part of the protocol)
- **Encoding**: UTF-8
- **Delimiter**: newline (`\n`) — no embedded newlines in messages

## Message Flow

### 1. Initialize

```jsonc
// Client → Agent
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1,"clientCapabilities":{},"clientInfo":{"name":"my-client","version":"1.0"}}}

// Agent → Client
{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":1,"agentInfo":{"name":"claude-code-acp","title":"Claude Code ACP Bridge","version":"0.1.0"},"agentCapabilities":{"loadSession":false,"promptCapabilities":{"image":false,"audio":false,"embeddedContext":false},"mcpCapabilities":{"http":false,"sse":false},"sessionCapabilities":{}},"authMethods":[]}}
```

### 2. Create Session

```jsonc
// Client → Agent
{"jsonrpc":"2.0","id":2,"method":"session/new","params":{"cwd":"/Users/you/project","mcpServers":[]}}

// Agent → Client
{"jsonrpc":"2.0","id":2,"result":{"sessionId":"a1b2c3d4..."}}
```

### 3. Send Prompt

```jsonc
// Client → Agent
{"jsonrpc":"2.0","id":3,"method":"session/prompt","params":{"sessionId":"a1b2c3d4...","prompt":[{"type":"text","text":"Explain the authentication module"}]}}
```

While processing, the agent sends streaming notifications:

```jsonc
// Agent → Client (notification, no id)
{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"a1b2c3d4...","update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"The authentication module..."}}}}

// Agent → Client (tool call notification)
{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"a1b2c3d4...","update":{"sessionUpdate":"tool_call","toolCallId":"call_1","title":"Read","kind":"execute","status":"completed","rawInput":{"file_path":"/src/auth.ts"}}}}
```

When done, the prompt response is returned:

```jsonc
// Agent → Client
{"jsonrpc":"2.0","id":3,"result":{"stopReason":"end_turn"}}
```

### 4. Cancel (Optional)

```jsonc
// Client → Agent (notification, no id)
{"jsonrpc":"2.0","method":"session/cancel","params":{"sessionId":"a1b2c3d4..."}}
```

The agent kills the running Claude Code process and the pending `session/prompt` returns with `stopReason: "cancelled"`.

## Session Update Types

| `sessionUpdate` | Description |
|---|---|
| `agent_message_chunk` | Text content from Claude's response |
| `tool_call` | A tool invocation (Read, Bash, Edit, etc.) |

## Error Responses

```jsonc
// Session not found
{"jsonrpc":"2.0","id":3,"error":{"code":-32002,"message":"Session abc123 not found"}}

// Empty prompt
{"jsonrpc":"2.0","id":3,"error":{"code":-32602,"message":"Empty prompt text"}}
```

Standard JSON-RPC error codes are used:
- `-32602` — Invalid params
- `-32002` — Resource not found

If Claude Code itself fails (CLI error, crash), the error is sent as an `agent_message_chunk` with `Error: ...` text, and `stopReason` is still `"end_turn"`. This ensures the client always gets a clean response.

## Testing the Protocol Manually

You can test the protocol by piping JSON-RPC messages directly:

```sh
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1,"clientCapabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | node dist/index.js
```

Or interactively:

```sh
node dist/index.js 2>/dev/null
# Then type JSON-RPC messages, one per line
```
