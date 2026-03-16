export interface AgentConfig {
  allowedTools: string[];
  model: string | undefined;
  maxTurns: number | undefined;
  timeout: number;
  dangerouslySkipPermissions: boolean;
}

export function loadConfig(): AgentConfig {
  return {
    allowedTools: process.env.CLAUDE_ACP_ALLOWED_TOOLS
      ? process.env.CLAUDE_ACP_ALLOWED_TOOLS.split(",").map((t) =>
          t.trim()
        )
      : [],
    model: process.env.CLAUDE_ACP_MODEL || undefined,
    maxTurns: process.env.CLAUDE_ACP_MAX_TURNS
      ? parseInt(process.env.CLAUDE_ACP_MAX_TURNS, 10)
      : undefined,
    timeout: process.env.CLAUDE_ACP_TIMEOUT
      ? parseInt(process.env.CLAUDE_ACP_TIMEOUT, 10)
      : 300000, // 5 minutes default
    dangerouslySkipPermissions:
      process.env.CLAUDE_ACP_SKIP_PERMISSIONS !== "false",
  };
}
