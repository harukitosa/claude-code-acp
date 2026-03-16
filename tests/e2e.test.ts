import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable, Writable, PassThrough } from "node:stream";
import {
  ClientSideConnection,
  AgentSideConnection,
  ndJsonStream,
  type Client,
  type SessionNotification,
} from "@agentclientprotocol/sdk";
import { createClaudeCodeAgent } from "../src/agent.js";

// Mock child_process to prevent actual claude CLI calls
vi.mock("node:child_process", () => {
  const { EventEmitter } = require("node:events");

  return {
    spawn: vi.fn().mockImplementation((_cmd: string, args: string[]) => {
      const proc = new EventEmitter();
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.pid = 99999;
      proc.kill = vi.fn();

      const outputFormat = args.includes("stream-json")
        ? "stream-json"
        : "json";

      setTimeout(() => {
        if (outputFormat === "json") {
          proc.stdout.emit(
            "data",
            Buffer.from(
              JSON.stringify({
                result: "E2E test response from Claude",
                session_id: "e2e-session-uuid",
              })
            )
          );
        } else {
          // Stream json
          proc.stdout.emit(
            "data",
            Buffer.from(
              JSON.stringify({
                type: "content_block_delta",
                index: 0,
                delta: { type: "text_delta", text: "E2E streamed " },
              }) + "\n"
            )
          );
          proc.stdout.emit(
            "data",
            Buffer.from(
              JSON.stringify({
                type: "content_block_delta",
                index: 0,
                delta: { type: "text_delta", text: "response" },
              }) + "\n"
            )
          );
          proc.stdout.emit(
            "data",
            Buffer.from(
              JSON.stringify({
                type: "result",
                result: "E2E streamed response",
                session_id: "e2e-session-uuid",
              }) + "\n"
            )
          );
        }
        setTimeout(() => proc.emit("close", 0), 10);
      }, 10);

      return proc;
    }),
  };
});

/**
 * Creates a pair of connected streams for testing ACP client-agent communication.
 */
function createStreamPair() {
  const clientToAgent = new PassThrough();
  const agentToClient = new PassThrough();

  const agentStream = ndJsonStream(
    Writable.toWeb(agentToClient),
    Readable.toWeb(clientToAgent) as ReadableStream<Uint8Array>
  );
  const clientStream = ndJsonStream(
    Writable.toWeb(clientToAgent),
    Readable.toWeb(agentToClient) as ReadableStream<Uint8Array>
  );

  return { agentStream, clientStream };
}

describe("E2E: ACP Client ↔ Agent", () => {
  it("should complete full initialize → newSession → prompt flow", async () => {
    const { agentStream, clientStream } = createStreamPair();

    // Start agent
    new AgentSideConnection(
      (conn) => createClaudeCodeAgent(conn),
      agentStream
    );

    // Collect updates
    const updates: SessionNotification[] = [];

    // Start client
    const client: Client = {
      async sessionUpdate(params) {
        updates.push(params);
      },
      async requestPermission(params) {
        return {
          outcome: { outcome: "selected", optionId: "allow" },
        };
      },
    };

    const clientConn = new ClientSideConnection(
      () => client,
      clientStream
    );

    // Initialize
    const initResult = await clientConn.initialize({
      protocolVersion: 1,
      clientCapabilities: {},
      clientInfo: { name: "e2e-test", version: "1.0" },
    });

    expect(initResult.protocolVersion).toBe(1);
    expect(initResult.agentInfo?.name).toBe("claude-code-acp");

    // Create session
    const sessionResult = await clientConn.newSession({
      cwd: "/tmp/test-project",
      mcpServers: [],
    });

    expect(sessionResult.sessionId).toBeDefined();

    // Send prompt
    const promptResult = await clientConn.prompt({
      sessionId: sessionResult.sessionId,
      prompt: [{ type: "text", text: "Hello from E2E test" }],
    });

    expect(promptResult.stopReason).toBe("end_turn");

    // Should have received session updates
    expect(updates.length).toBeGreaterThan(0);
    expect(
      updates.some(
        (u) => u.update.sessionUpdate === "agent_message_chunk"
      )
    ).toBe(true);
  });

  it("should support multi-turn conversation", async () => {
    const { agentStream, clientStream } = createStreamPair();

    new AgentSideConnection(
      (conn) => createClaudeCodeAgent(conn),
      agentStream
    );

    const updates: SessionNotification[] = [];
    const client: Client = {
      async sessionUpdate(params) {
        updates.push(params);
      },
      async requestPermission() {
        return {
          outcome: { outcome: "selected", optionId: "allow" },
        };
      },
    };

    const clientConn = new ClientSideConnection(
      () => client,
      clientStream
    );

    await clientConn.initialize({
      protocolVersion: 1,
      clientCapabilities: {},
      clientInfo: { name: "e2e-test", version: "1.0" },
    });

    const session = await clientConn.newSession({
      cwd: "/tmp",
      mcpServers: [],
    });

    // First turn
    const r1 = await clientConn.prompt({
      sessionId: session.sessionId,
      prompt: [{ type: "text", text: "First message" }],
    });
    expect(r1.stopReason).toBe("end_turn");

    // Second turn (should use --resume internally)
    const r2 = await clientConn.prompt({
      sessionId: session.sessionId,
      prompt: [{ type: "text", text: "Second message" }],
    });
    expect(r2.stopReason).toBe("end_turn");
  });
});
