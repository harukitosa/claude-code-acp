import { describe, it, expect, vi, beforeEach } from "vitest";
import { createClaudeCodeAgent } from "../src/agent.js";
import type { AgentSideConnection } from "@agentclientprotocol/sdk";
import type { StreamEvent } from "../src/claude-runner.js";

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

// Mock that emits thinking and usage events
vi.mock("../src/claude-runner.js", () => {
  const MockClaudeRunner = vi.fn().mockImplementation(function (this: any) {
    this.startSessionStreaming = vi.fn().mockImplementation(
      async (_cwd: string, _prompt: string, onEvent: (e: StreamEvent) => void) => {
        onEvent({ type: "thinking", text: "Let me think about this..." } as any);
        onEvent({ type: "text_delta", text: "Here is the answer." });
        onEvent({
          type: "result",
          text: "Here is the answer.",
          sessionId: "uuid-stream",
          usage: {
            input_tokens: 100,
            output_tokens: 50,
          },
          totalTokens: 150,
        } as any);
        return { text: "Here is the answer.", sessionId: "uuid-stream" };
      }
    );
    this.continueSessionStreaming = vi.fn().mockResolvedValue({
      text: "ok", sessionId: "uuid-stream",
    });
    this.cancel = vi.fn();
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

describe("Agent streaming updates", () => {
  let conn: AgentSideConnection;
  let agent: ReturnType<typeof createClaudeCodeAgent>;

  beforeEach(() => {
    vi.clearAllMocks();
    conn = createMockConnection();
    agent = createClaudeCodeAgent(conn);
  });

  it("should send agent_thought_chunk for thinking events", async () => {
    await agent.initialize({
      protocolVersion: 1,
      clientCapabilities: {},
      clientInfo: { name: "test", version: "1.0" },
    });
    const session = await agent.newSession({ cwd: "/tmp", mcpServers: [] });

    await agent.prompt({
      sessionId: session.sessionId,
      prompt: [{ type: "text", text: "think about this" }],
    });

    const calls = (conn.sessionUpdate as any).mock.calls;
    const updates = calls.map((c: any) => c[0].update);

    const thoughtChunks = updates.filter(
      (u: any) => u.sessionUpdate === "agent_thought_chunk"
    );
    expect(thoughtChunks.length).toBeGreaterThanOrEqual(1);
    expect(thoughtChunks[0].content.type).toBe("text");
    expect(thoughtChunks[0].content.text).toBe("Let me think about this...");
  });

  it("should send session_info_update after prompt completes", async () => {
    await agent.initialize({
      protocolVersion: 1,
      clientCapabilities: {},
      clientInfo: { name: "test", version: "1.0" },
    });
    const session = await agent.newSession({ cwd: "/tmp", mcpServers: [] });

    await agent.prompt({
      sessionId: session.sessionId,
      prompt: [{ type: "text", text: "hello" }],
    });

    const calls = (conn.sessionUpdate as any).mock.calls;
    const updates = calls.map((c: any) => c[0].update);

    const infoUpdates = updates.filter(
      (u: any) => u.sessionUpdate === "session_info_update"
    );
    expect(infoUpdates.length).toBeGreaterThanOrEqual(1);
    expect(infoUpdates[0].updatedAt).toBeDefined();
  });
});
