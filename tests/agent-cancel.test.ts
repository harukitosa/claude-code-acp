import { describe, it, expect, vi, beforeEach } from "vitest";
import { createClaudeCodeAgent } from "../src/agent.js";
import type { AgentSideConnection } from "@agentclientprotocol/sdk";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => "{}"),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock("../src/validation.js", () => ({
  validateCwd: vi.fn((cwd: string) => cwd),
  validateMcpCommand: vi.fn(),
  validateMcpArgs: vi.fn(),
}));

let cancelReject: ((err: Error) => void) | undefined;

vi.mock("../src/claude-runner.js", () => {
  const MockClaudeRunner = vi.fn().mockImplementation(function (this: any) {
    this.startSessionStreaming = vi.fn().mockImplementation(
      async (_cwd: string, _prompt: string, _onEvent: any) => {
        return new Promise((_resolve, reject) => {
          cancelReject = reject;
        });
      }
    );
    this.continueSessionStreaming = vi.fn().mockResolvedValue({
      text: "ok",
      sessionId: "uuid-1",
    });
    this.cancel = vi.fn().mockImplementation(function (this: any) {
      if (cancelReject) {
        cancelReject(new Error("Process killed"));
        cancelReject = undefined;
      }
    });
  });
  return { ClaudeRunner: MockClaudeRunner };
});

function createMockConnection(): AgentSideConnection {
  return {
    sessionUpdate: vi.fn().mockResolvedValue(undefined),
    requestPermission: vi.fn(),
    readTextFile: vi.fn(),
    writeTextFile: vi.fn(),
    createTerminal: vi.fn(),
    signal: new AbortController().signal,
    closed: new Promise(() => {}),
  } as unknown as AgentSideConnection;
}

describe("Agent cancel → cancelled stop reason", () => {
  let conn: AgentSideConnection;
  let agent: ReturnType<typeof createClaudeCodeAgent>;

  beforeEach(() => {
    vi.clearAllMocks();
    cancelReject = undefined;
    conn = createMockConnection();
    agent = createClaudeCodeAgent(conn);
  });

  it("should return cancelled stop reason when cancel is called during prompt", async () => {
    await agent.initialize({
      protocolVersion: 1,
      clientCapabilities: {},
      clientInfo: { name: "test", version: "1.0" },
    });
    const session = await agent.newSession({ cwd: "/tmp", mcpServers: [] });

    // Start prompt (will hang until cancel)
    const promptPromise = agent.prompt({
      sessionId: session.sessionId,
      prompt: [{ type: "text", text: "Hello" }],
    });

    // Cancel after a tick
    await new Promise((r) => setTimeout(r, 10));
    await agent.cancel({ sessionId: session.sessionId });

    const result = await promptPromise;
    expect(result.stopReason).toBe("cancelled");
  });
});
