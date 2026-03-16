import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { McpServerConfig } from "./claude-runner.js";
import { logger } from "./logger.js";

const STORE_DIR = join(homedir(), ".claude-code-acp");
const STORE_FILE = join(STORE_DIR, "sessions.json");

interface SessionData {
  cwd: string;
  claudeSessionId?: string;
  mcpServers: McpServerConfig[];
  createdAt: string;
}

/** Persisted mapping: cwd → Claude Code session UUID */
interface PersistedSessions {
  [cwd: string]: string; // cwd → claudeSessionId
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

    // Restore Claude Code session ID from disk if available
    const persisted = this.loadPersisted();
    const claudeSessionId = persisted[cwd];

    this.sessions.set(sessionId, {
      cwd,
      mcpServers,
      claudeSessionId,
      createdAt: new Date().toISOString(),
    });

    if (claudeSessionId) {
      logger.info(
        `Restored Claude Code session ${claudeSessionId} for cwd ${cwd}`
      );
    }
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

    // Persist to disk
    this.savePersisted(session.cwd, claudeId);
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

  /** Clear the persisted Claude Code session for a given cwd. */
  clearPersistedSession(cwd: string): void {
    const persisted = this.loadPersisted();
    delete persisted[cwd];
    this.writePersisted(persisted);
    logger.info(`Cleared persisted session for cwd ${cwd}`);
  }

  private loadPersisted(): PersistedSessions {
    try {
      if (existsSync(STORE_FILE)) {
        const data = readFileSync(STORE_FILE, "utf-8");
        return JSON.parse(data);
      }
    } catch {
      logger.warn(`Failed to load persisted sessions from ${STORE_FILE}`);
    }
    return {};
  }

  private savePersisted(cwd: string, claudeSessionId: string): void {
    const persisted = this.loadPersisted();
    persisted[cwd] = claudeSessionId;
    this.writePersisted(persisted);
    logger.debug(
      `Persisted Claude Code session ${claudeSessionId} for cwd ${cwd}`
    );
  }

  private writePersisted(data: PersistedSessions): void {
    try {
      if (!existsSync(STORE_DIR)) {
        mkdirSync(STORE_DIR, { recursive: true });
      }
      writeFileSync(STORE_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
      logger.error(
        `Failed to write persisted sessions: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}
