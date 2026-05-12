# Changelog

## 0.1.0 - 2026-05-11

- Added initial local MCP adapter with six provider tools.
- Added prompt length limit, timeout handling, optional local bridge token, and basic secret-pattern blocking.
- Added setup script that avoids overwriting existing `.mcp.json`.
- Added cross-platform bridge start scripts and a local mock bridge for testing.
- Added process-local browser AI session reuse so one Claude Code window maps to one provider conversation, plus `reset_ai_session`.
