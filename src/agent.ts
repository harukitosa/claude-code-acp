import {
  PROTOCOL_VERSION,
  RequestError,
  type Agent,
  type AgentSideConnection,
  type InitializeRequest,
  type InitializeResponse,
  type NewSessionRequest,
  type NewSessionResponse,
  type AuthenticateRequest,
  type AuthenticateResponse,
  type PromptRequest,
  type PromptResponse,
  type CancelNotification,
} from "@agentclientprotocol/sdk";
import { SessionStore } from "./session-store.js";
import { ClaudeRunner, type StreamEvent } from "./claude-runner.js";
import { logger } from "./logger.js";
import {
  validateCwd,
  validateMcpCommand,
  validateMcpArgs,
} from "./validation.js";

function generateSessionId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function createClaudeCodeAgent(
  connection: AgentSideConnection
): Agent {
  const store = new SessionStore();
  const runner = new ClaudeRunner();

  return {
    async initialize(
      _params: InitializeRequest
    ): Promise<InitializeResponse> {
      logger.info("Initialize request received");
      return {
        protocolVersion: PROTOCOL_VERSION,
        agentInfo: {
          name: "claude-code-acp",
          title: "Claude Code ACP Bridge",
          version: "0.1.0",
        },
        agentCapabilities: {
          loadSession: false,
          promptCapabilities: {
            image: false,
            audio: false,
            embeddedContext: false,
          },
          mcpCapabilities: {
            http: false,
            sse: false,
          },
          sessionCapabilities: {},
        },
        authMethods: [],
      };
    },

    async newSession(
      params: NewSessionRequest
    ): Promise<NewSessionResponse> {
      // Validate cwd
      let resolvedCwd: string;
      try {
        resolvedCwd = validateCwd(params.cwd);
      } catch (err) {
        throw RequestError.invalidParams(
          `Invalid cwd: ${err instanceof Error ? err.message : String(err)}`
        );
      }

      const sessionId = generateSessionId();
      // Convert and validate ACP MCP server format
      const mcpServers = (params.mcpServers ?? [])
        .filter((s: any) => s.transport?.type === "stdio")
        .map((s: any) => {
          const command = s.transport.command;
          const args = s.transport.args ?? [];
          try {
            validateMcpCommand(command);
            validateMcpArgs(args);
          } catch (err) {
            throw RequestError.invalidParams(
              `Invalid MCP server config: ${err instanceof Error ? err.message : String(err)}`
            );
          }
          return {
            name: s.name ?? s.id ?? "unknown",
            transport: {
              type: "stdio" as const,
              command,
              args,
              env: s.transport.env,
            },
          };
        });
      store.create(sessionId, resolvedCwd, mcpServers);
      logger.info(
        `Session created: ${sessionId} (cwd: ${resolvedCwd}, mcpServers: ${mcpServers.length})`
      );
      return { sessionId };
    },

    async authenticate(
      _params: AuthenticateRequest
    ): Promise<AuthenticateResponse> {
      return {};
    },

    async prompt(params: PromptRequest): Promise<PromptResponse> {
      const { sessionId, prompt } = params;

      if (!store.has(sessionId)) {
        throw RequestError.resourceNotFound(
          `Session ${sessionId} not found`
        );
      }

      // Extract text from content blocks
      const text = prompt
        .filter((block): block is { type: "text"; text: string } =>
          block.type === "text"
        )
        .map((block) => block.text)
        .join("\n");

      if (!text.trim()) {
        throw RequestError.invalidParams("Empty prompt text");
      }

      const claudeSessionId = store.getClaudeSessionId(sessionId);
      const cwd = store.getCwd(sessionId)!;
      let toolCallCounter = 0;

      logger.info(`Prompt for session ${sessionId}: ${text.length} chars`);
      logger.debug(
        `Prompt content: ${text.slice(0, 100)}${text.length > 100 ? "..." : ""}`
      );

      const permissionPromises: Promise<void>[] = [];

      const onEvent = (event: StreamEvent) => {
        if (event.type === "text_delta" && event.text) {
          connection.sessionUpdate({
            sessionId,
            update: {
              sessionUpdate: "agent_message_chunk",
              content: { type: "text", text: event.text },
            },
          });
        } else if (event.type === "tool_use" && event.toolName) {
          const toolCallId = `call_${++toolCallCounter}`;
          logger.debug(`Tool call: ${event.toolName}`);
          connection.sessionUpdate({
            sessionId,
            update: {
              sessionUpdate: "tool_call",
              toolCallId,
              title: event.toolName,
              kind: "execute",
              status: "completed",
              rawInput: event.toolInput ?? {},
            },
          });
        } else if (event.type === "permission_request" && event.toolName) {
          const toolCallId = `call_${++toolCallCounter}`;
          const toolName = event.toolName;
          const toolInput = event.toolInput ?? {};
          logger.info(`Permission request: ${toolName}`);

          // Send pending tool_call status
          connection.sessionUpdate({
            sessionId,
            update: {
              sessionUpdate: "tool_call",
              toolCallId,
              title: toolName,
              kind: "execute",
              status: "pending",
              rawInput: toolInput,
            },
          });

          // Request permission from client (track promise for awaiting)
          const permPromise = connection
            .requestPermission({
              sessionId,
              toolCall: {
                toolCallId,
                title: toolName,
                kind: "execute",
                status: "pending",
                rawInput: toolInput,
              },
              options: [
                { optionId: "allow_once", kind: "allow_once", label: "Allow once" },
                { optionId: "allow_always", kind: "allow_always", label: "Allow always" },
                { optionId: "reject_once", kind: "reject_once", label: "Reject once" },
                { optionId: "reject_always", kind: "reject_always", label: "Reject always" },
              ],
            })
            .then((response) => {
              const outcome = response.outcome;
              const isApproved =
                outcome.type === "selected" &&
                (outcome.optionId === "allow_once" ||
                  outcome.optionId === "allow_always");

              connection.sessionUpdate({
                sessionId,
                update: {
                  sessionUpdate: "tool_call",
                  toolCallId,
                  title: toolName,
                  kind: "execute",
                  status: isApproved ? "completed" : "failed",
                  rawInput: toolInput,
                },
              });
            })
            .catch((err) => {
              logger.error(
                `Permission request failed: ${err instanceof Error ? err.message : String(err)}`
              );
              connection.sessionUpdate({
                sessionId,
                update: {
                  sessionUpdate: "tool_call",
                  toolCallId,
                  title: toolName,
                  kind: "execute",
                  status: "failed",
                  rawInput: toolInput,
                },
              });
            });

          permissionPromises.push(permPromise);
        }
      };

      try {
        let result;
        if (claudeSessionId) {
          try {
            result = await runner.continueSessionStreaming(
              claudeSessionId,
              text,
              onEvent,
              sessionId
            );
          } catch (resumeErr) {
            // Resume failed (expired session, etc.) — fall back to new session
            logger.warn(
              `Resume failed for ${claudeSessionId}, starting fresh: ${resumeErr instanceof Error ? resumeErr.message : String(resumeErr)}`
            );
            store.clearPersistedSession(cwd);
            result = await runner.startSessionStreaming(
              cwd,
              text,
              onEvent,
              sessionId
            );
            store.setClaudeSessionId(sessionId, result.sessionId);
          }
        } else {
          const mcpServers = store.getMcpServers(sessionId);
          if (mcpServers.length > 0) {
            result = await runner.startSessionWithMcp(
              cwd,
              text,
              mcpServers,
              onEvent,
              sessionId
            );
          } else {
            result = await runner.startSessionStreaming(
              cwd,
              text,
              onEvent,
              sessionId
            );
          }
          store.setClaudeSessionId(sessionId, result.sessionId);
        }

        // Wait for all pending permission requests to resolve
        await Promise.all(permissionPromises);

        logger.info(`Prompt completed for session ${sessionId}`);
        return { stopReason: "end_turn" };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : String(err);
        logger.error(`Prompt failed for session ${sessionId}: ${message}`);

        // Send error as agent message so client sees it
        await connection.sessionUpdate({
          sessionId,
          update: {
            sessionUpdate: "agent_message_chunk",
            content: {
              type: "text",
              text: `Error: ${message}`,
            },
          },
        });

        return { stopReason: "end_turn" };
      }
    },

    async cancel(params: CancelNotification): Promise<void> {
      logger.info(`Cancel request for session ${params.sessionId}`);
      runner.cancel(params.sessionId);
    },
  };
}
