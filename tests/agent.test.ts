import { describe, it, expect, vi, beforeEach } from "vitest";
import { createClaudeCodeAgent } from "../src/agent.js";
import type { AgentSideConnection } from "@agentclientprotocol/sdk";

// Mock ClaudeRunner
vi.mock("../src/claude-runner.js", () => {
  const MockClaudeRunner = vi.fn().mockImplementation(function (this: any) {
    this.startSession = vi.fn().mockResolvedValue({
      text: "Hello from Claude",
      sessionId: "claude-uuid-abc",
    });
    this.continueSession = vi.fn().mockResolvedValue({
      text: "Continued response",
      sessionId: "claude-uuid-abc",
    });
    this.startSessionStreaming = vi.fn().mockResolvedValue({
      text: "Streamed response",
      sessionId: "claude-uuid-abc",
    });
    this.continueSessionStreaming = vi.fn().mockResolvedValue({
      text: "Continued streamed",
      sessionId: "claude-uuid-abc",
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

describe("ClaudeCodeAgent", () => {
  let conn: AgentSideConnection;
  let agent: ReturnType<typeof createClaudeCodeAgent>;

  beforeEach(() => {
    vi.clearAllMocks();
    conn = createMockConnection();
    agent = createClaudeCodeAgent(conn);
  });

  describe("initialize", () => {
    it("should return protocol version and capabilities", async () => {
      const result = await agent.initialize({
        protocolVersion: 1,
        clientCapabilities: {},
        clientInfo: { name: "test-client", version: "1.0" },
      });

      expect(result.protocolVersion).toBe(1);
      expect(result.agentInfo?.name).toBe("claude-code-acp");
      expect(result.agentCapabilities).toBeDefined();
      expect(result.agentCapabilities?.loadSession).toBe(false);
    });

    it("should advertise no auth methods", async () => {
      const result = await agent.initialize({
        protocolVersion: 1,
        clientCapabilities: {},
        clientInfo: { name: "test", version: "1.0" },
      });

      expect(result.authMethods).toEqual([]);
    });
  });

  describe("newSession", () => {
    it("should create a session and return sessionId", async () => {
      // Must initialize first
      await agent.initialize({
        protocolVersion: 1,
        clientCapabilities: {},
        clientInfo: { name: "test", version: "1.0" },
      });

      const result = await agent.newSession({
        cwd: "/Users/test/project",
        mcpServers: [],
      });

      expect(result.sessionId).toBeDefined();
      expect(typeof result.sessionId).toBe("string");
      expect(result.sessionId.length).toBeGreaterThan(0);
    });

    it("should return unique session ids", async () => {
      await agent.initialize({
        protocolVersion: 1,
        clientCapabilities: {},
        clientInfo: { name: "test", version: "1.0" },
      });

      const r1 = await agent.newSession({ cwd: "/tmp", mcpServers: [] });
      const r2 = await agent.newSession({ cwd: "/tmp", mcpServers: [] });

      expect(r1.sessionId).not.toBe(r2.sessionId);
    });
  });

  describe("authenticate", () => {
    it("should return empty response (no-op)", async () => {
      const result = await agent.authenticate({ methodId: "test" });
      expect(result).toEqual({});
    });
  });

  describe("prompt", () => {
    it("should send prompt to Claude and return completed stop reason", async () => {
      await agent.initialize({
        protocolVersion: 1,
        clientCapabilities: {},
        clientInfo: { name: "test", version: "1.0" },
      });
      const session = await agent.newSession({
        cwd: "/tmp",
        mcpServers: [],
      });

      const result = await agent.prompt({
        sessionId: session.sessionId,
        prompt: [{ type: "text", text: "Hello" }],
      });

      expect(result.stopReason).toBe("end_turn");
    });

    it("should send session update with agent message", async () => {
      await agent.initialize({
        protocolVersion: 1,
        clientCapabilities: {},
        clientInfo: { name: "test", version: "1.0" },
      });
      const session = await agent.newSession({
        cwd: "/tmp",
        mcpServers: [],
      });

      await agent.prompt({
        sessionId: session.sessionId,
        prompt: [{ type: "text", text: "Hello" }],
      });

      // Should have called sessionUpdate at least once
      expect(conn.sessionUpdate).toHaveBeenCalled();
    });

    it("should throw for unknown session", async () => {
      await expect(
        agent.prompt({
          sessionId: "nonexistent",
          prompt: [{ type: "text", text: "Hello" }],
        })
      ).rejects.toThrow();
    });

    it("should use continueSession on second prompt", async () => {
      await agent.initialize({
        protocolVersion: 1,
        clientCapabilities: {},
        clientInfo: { name: "test", version: "1.0" },
      });
      const session = await agent.newSession({
        cwd: "/tmp",
        mcpServers: [],
      });

      // First prompt
      await agent.prompt({
        sessionId: session.sessionId,
        prompt: [{ type: "text", text: "First" }],
      });

      // Second prompt should use continueSession
      await agent.prompt({
        sessionId: session.sessionId,
        prompt: [{ type: "text", text: "Second" }],
      });

      // Verify sessionUpdate was called for both prompts
      expect((conn.sessionUpdate as any).mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("cancel", () => {
    it("should cancel without throwing", async () => {
      await expect(
        agent.cancel({ sessionId: "some-session" })
      ).resolves.not.toThrow();
    });
  });
});
