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
  type LoadSessionRequest,
  type LoadSessionResponse,
  type ListSessionsRequest,
  type ListSessionsResponse,
  type SetSessionModeRequest,
  type SetSessionModeResponse,
  type SetSessionConfigOptionRequest,
  type SetSessionConfigOptionResponse,
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

const AVAILABLE_MODES = [
  { id: "code", name: "Code", description: "Write and edit code" },
  { id: "ask", name: "Ask", description: "Ask questions without making changes" },
  { id: "architect", name: "Architect", description: "Plan and design architecture" },
];

const DEFAULT_MODE = "code";

function buildModeState(currentModeId: string) {
  return {
    availableModes: AVAILABLE_MODES,
    currentModeId,
  };
}

function buildConfigOptions(store: SessionStore, sessionId: string) {
  const overrides = store.getConfigOverrides(sessionId);
  return [
    {
      id: "thought_level",
      name: "Thinking Level",
      type: "select" as const,
      category: "thought_level",
      description: "Control the depth of reasoning",
      currentValue: (overrides.thought_level as string) ?? "medium",
      options: [
        { value: "low", name: "Low" },
        { value: "medium", name: "Medium" },
        { value: "high", name: "High" },
        { value: "max", name: "Max" },
      ],
    },
  ];
}

export function createClaudeCodeAgent(
  connection: AgentSideConnection
): Agent {
  const store = new SessionStore();
  const runner = new ClaudeRunner();
  const cancelledSessions = new Set<string>();

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
          sessionCapabilities: {
            list: {},
          },
        },
        authMethods: [],
      };
    },

    async newSession(
      params: NewSessionRequest
    ): Promise<NewSessionResponse> {
      logger.debug(`newSession params: ${JSON.stringify(params)}`);
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
      return {
        sessionId,
        modes: buildModeState(DEFAULT_MODE),
        configOptions: buildConfigOptions(store, sessionId),
      } as NewSessionResponse;
    },

    async loadSession(
      params: LoadSessionRequest
    ): Promise<LoadSessionResponse> {
      const { sessionId } = params;

      if (!store.has(sessionId)) {
        throw RequestError.resourceNotFound(
          `Session ${sessionId} not found`
        );
      }

      const currentMode = store.getMode(sessionId) ?? DEFAULT_MODE;
      logger.info(`Load session: ${sessionId}`);

      return {
        modes: buildModeState(currentMode),
        configOptions: buildConfigOptions(store, sessionId),
      } as LoadSessionResponse;
    },

    async listSessions(
      params: ListSessionsRequest
    ): Promise<ListSessionsResponse> {
      const sessions = store.listAll(params.cwd ?? undefined);
      return { sessions };
    },

    async setSessionMode(
      params: SetSessionModeRequest
    ): Promise<SetSessionModeResponse> {
      const { sessionId, modeId } = params;

      if (!store.has(sessionId)) {
        throw RequestError.resourceNotFound(
          `Session ${sessionId} not found`
        );
      }

      store.setMode(sessionId, modeId);
      logger.info(`Session ${sessionId} mode set to ${modeId}`);

      // Send current_mode_update notification
      await connection.sessionUpdate({
        sessionId,
        update: {
          sessionUpdate: "current_mode_update",
          currentModeId: modeId,
        } as any,
      });

      return {};
    },

    async setSessionConfigOption(
      params: SetSessionConfigOptionRequest
    ): Promise<SetSessionConfigOptionResponse> {
      const { sessionId, configId } = params as any;

      if (!store.has(sessionId)) {
        throw RequestError.resourceNotFound(
          `Session ${sessionId} not found`
        );
      }

      const value = (params as any).value;
      store.setConfigOverride(sessionId, configId, value);
      logger.info(`Session ${sessionId} config ${configId} set to ${value}`);

      // Send config_option_update notification
      const configOptions = buildConfigOptions(store, sessionId);
      await connection.sessionUpdate({
        sessionId,
        update: {
          sessionUpdate: "config_option_update",
          configOptions,
        } as any,
      });

      return { configOptions } as SetSessionConfigOptionResponse;
    },

    async authenticate(
      _params: AuthenticateRequest
    ): Promise<AuthenticateResponse> {
      return {};
    },

    async prompt(params: PromptRequest): Promise<PromptResponse> {
      logger.debug(`prompt params keys: ${JSON.stringify(Object.keys(params))}`);
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
        if ((event as any).type === "thinking" && (event as any).text) {
          connection.sessionUpdate({
            sessionId,
            update: {
              sessionUpdate: "agent_thought_chunk",
              content: { type: "text", text: (event as any).text },
            } as any,
          });
        } else if (event.type === "text_delta" && event.text) {
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
                { optionId: "allow_once", kind: "allow_once", name: "Allow once" },
                { optionId: "allow_always", kind: "allow_always", name: "Allow always" },
                { optionId: "reject_once", kind: "reject_once", name: "Reject once" },
                { optionId: "reject_always", kind: "reject_always", name: "Reject always" },
              ],
            })
            .then((response) => {
              const outcome = response.outcome as any;
              const isSelected =
                outcome.outcome === "selected" || outcome.type === "selected";
              const optionId = outcome.optionId;
              const isApproved =
                isSelected &&
                (optionId === "allow_once" ||
                  optionId === "allow_always");

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

        // Check if this session was cancelled while running
        if (cancelledSessions.has(sessionId)) {
          cancelledSessions.delete(sessionId);
          logger.info(`Prompt cancelled for session ${sessionId}`);
          return { stopReason: "cancelled" };
        }

        // Send session_info_update with updatedAt
        store.touch(sessionId);
        await connection.sessionUpdate({
          sessionId,
          update: {
            sessionUpdate: "session_info_update",
            updatedAt: store.getUpdatedAt(sessionId),
          } as any,
        });

        logger.info(`Prompt completed for session ${sessionId}`);
        return { stopReason: "end_turn" };
      } catch (err) {
        // Check if cancelled
        if (cancelledSessions.has(sessionId)) {
          cancelledSessions.delete(sessionId);
          logger.info(`Prompt cancelled for session ${sessionId}`);
          return { stopReason: "cancelled" };
        }

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
      cancelledSessions.add(params.sessionId);
      runner.cancel(params.sessionId);
    },
  };
}
