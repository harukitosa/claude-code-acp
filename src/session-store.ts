import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { McpServerConfig } from "./claude-runner.js";
import { logger } from "./logger.js";

const STORE_DIR = join(homedir(), ".claude-code-acp");
const STORE_FILE = join(STORE_DIR, "sessions.json");

export interface SessionInfo {
  sessionId: string;
  cwd: string;
  title?: string;
  updatedAt?: string;
}

interface SessionData {
  cwd: string;
  claudeSessionId?: string;
  mcpServers: McpServerConfig[];
  createdAt: string;
  mode?: string;
  title?: string;
  updatedAt: string;
  configOverrides: Record<string, unknown>;
}

/** Persisted mapping: persistKey → Claude Code session UUID */
interface PersistedSessions {
  [key: string]: string;
}

/**
 * Returns a stable key for persisting sessions.
 * Uses ACPX_SESSION_NAME (unique per thread/spawn) when available,
 * falls back to cwd (shared across threads with same directory).
 */
function getPersistKey(cwd: string): string {
  const sessionName = process.env.ACPX_SESSION_NAME;
  if (sessionName) {
    return `session:${sessionName}`;
  }
  return `cwd:${cwd}`;
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
    const persistKey = getPersistKey(cwd);
    const persisted = this.loadPersisted();
    const claudeSessionId = persisted[persistKey];

    const now = new Date().toISOString();
    this.sessions.set(sessionId, {
      cwd,
      mcpServers,
      claudeSessionId,
      createdAt: now,
      updatedAt: now,
      configOverrides: {},
    });

    if (claudeSessionId) {
      logger.info(
        `Restored Claude Code session ${claudeSessionId} for ${persistKey}`
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

    // Persist to disk using stable key
    const persistKey = getPersistKey(session.cwd);
    this.savePersisted(persistKey, claudeId);
  }

  getClaudeSessionId(sessionId: string): string | undefined {
    return this.sessions.get(sessionId)?.claudeSessionId;
  }

  getMode(sessionId: string): string | undefined {
    return this.sessions.get(sessionId)?.mode;
  }

  setMode(sessionId: string, mode: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    session.mode = mode;
    session.updatedAt = new Date().toISOString();
  }

  getTitle(sessionId: string): string | undefined {
    return this.sessions.get(sessionId)?.title;
  }

  setTitle(sessionId: string, title: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    session.title = title;
    session.updatedAt = new Date().toISOString();
  }

  getUpdatedAt(sessionId: string): string | undefined {
    return this.sessions.get(sessionId)?.updatedAt;
  }

  touch(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    session.updatedAt = new Date().toISOString();
  }

  getConfigOverrides(sessionId: string): Record<string, unknown> {
    return this.sessions.get(sessionId)?.configOverrides ?? {};
  }

  setConfigOverride(sessionId: string, key: string, value: unknown): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    session.configOverrides[key] = value;
    session.updatedAt = new Date().toISOString();
  }

  listAll(cwdFilter?: string): SessionInfo[] {
    const result: SessionInfo[] = [];
    for (const [sessionId, data] of this.sessions) {
      if (cwdFilter && data.cwd !== cwdFilter) continue;
      result.push({
        sessionId,
        cwd: data.cwd,
        title: data.title,
        updatedAt: data.updatedAt,
      });
    }
    return result;
  }

  delete(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /** Clear the persisted Claude Code session for the current persist key. */
  clearPersistedSession(cwd: string): void {
    const persistKey = getPersistKey(cwd);
    const persisted = this.loadPersisted();
    delete persisted[persistKey];
    this.writePersisted(persisted);
    logger.info(`Cleared persisted session for ${persistKey}`);
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

  private savePersisted(key: string, claudeSessionId: string): void {
    const persisted = this.loadPersisted();
    persisted[key] = claudeSessionId;
    this.writePersisted(persisted);
    logger.debug(
      `Persisted Claude Code session ${claudeSessionId} for ${key}`
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
