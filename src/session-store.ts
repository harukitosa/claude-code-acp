import type { McpServerConfig } from "./claude-runner.js";

interface SessionData {
  cwd: string;
  claudeSessionId?: string;
  mcpServers: McpServerConfig[];
  createdAt: Date;
}

export class SessionStore {
  private sessions = new Map<string, SessionData>();

  create(
    sessionId: string,
    cwd: string,
    mcpServers: McpServerConfig[] = []
  ): void {
    if (this.sessions.has(sessionId)) {
      throw new Error(`Session ${sessionId} already exists`);
    }
    this.sessions.set(sessionId, {
      cwd,
      mcpServers,
      createdAt: new Date(),
    });
  }

  getMcpServers(sessionId: string): McpServerConfig[] {
    return this.sessions.get(sessionId)?.mcpServers ?? [];
  }

  getCwd(sessionId: string): string | undefined {
    return this.sessions.get(sessionId)?.cwd;
  }

  setClaudeSessionId(sessionId: string, claudeId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    session.claudeSessionId = claudeId;
  }

  getClaudeSessionId(sessionId: string): string | undefined {
    return this.sessions.get(sessionId)?.claudeSessionId;
  }

  delete(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }
}
