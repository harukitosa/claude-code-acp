#!/usr/bin/env node
process.env.CLAUDE_ACP_SKIP_PERMISSIONS = process.env.CLAUDE_ACP_SKIP_PERMISSIONS ?? "true";
import("../dist/index.js");
