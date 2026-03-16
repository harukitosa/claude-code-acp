# Development Guide

## Setup

```sh
git clone https://github.com/harukitosa/claude-code-acp.git
cd claude-code-acp
npm install
```

## Commands

| Command | Description |
|---|---|
| `npm test` | Run all tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run build` | Build to `dist/` |
| `npm run dev` | Build in watch mode |

## Project Structure

```
src/
├── index.ts          # Entry point, stdio setup, exports
├── agent.ts          # ACP Agent implementation (method handlers)
├── claude-runner.ts  # Claude Code CLI subprocess management
├── session-store.ts  # Session ID mapping and metadata
├── config.ts         # Environment variable configuration
└── logger.ts         # Structured stderr logger
```

## Testing

Tests use [Vitest](https://vitest.dev/) and follow a TDD approach.

### Test Categories

**Unit tests** — Test individual components in isolation with mocked dependencies:
- `session-store.test.ts` — SessionStore CRUD operations
- `claude-runner.test.ts` — CLI invocation and output parsing
- `claude-runner-config.test.ts` — Config flag generation
- `config.test.ts` — Environment variable parsing
- `logger.test.ts` — Log output and level filtering

**Integration tests** — Test component interactions with mocked Claude CLI:
- `agent.test.ts` — ACP method handler logic
- `agent-tool-call.test.ts` — Tool call notification forwarding
- `agent-errors.test.ts` — Error handling and recovery
- `streaming.test.ts` — NDJSON stream parsing
- `mcp-passthrough.test.ts` — MCP server config passthrough

**E2E tests** — Full ACP client-agent communication over in-memory streams:
- `e2e.test.ts` — Initialize → newSession → prompt flow, multi-turn

### Running Specific Tests

```sh
# Single file
npx vitest run tests/agent.test.ts

# Pattern match
npx vitest run -t "streaming"
```

### Writing Tests

The Claude CLI is always mocked in tests via `vi.mock("node:child_process")`. Tests never invoke the real `claude` binary.

Mock helper pattern:

```ts
function createMockProcess(output: string, exitCode = 0): ChildProcess {
  const proc = new EventEmitter() as ChildProcess & EventEmitter;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.pid = 12345;
  proc.kill = vi.fn();

  setTimeout(() => {
    proc.stdout.emit("data", Buffer.from(output));
    setTimeout(() => proc.emit("close", exitCode), 5);
  }, 5);

  return proc;
}
```

## Architecture

See [architecture.md](architecture.md) for a detailed component breakdown.

## Building

```sh
npm run build
```

This uses [tsup](https://tsup.egoist.dev/) to produce:
- `dist/index.js` — ESM bundle
- `dist/index.d.ts` — TypeScript declarations
- `dist/index.js.map` — Source map

## Publishing

```sh
npm run build
npm publish
```

The `files` field in `package.json` ensures only `dist/` and `bin/` are included in the package.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Write tests first (TDD)
4. Implement the feature
5. Ensure all tests pass (`npm test`)
6. Ensure build succeeds (`npm run build`)
7. Submit a pull request
