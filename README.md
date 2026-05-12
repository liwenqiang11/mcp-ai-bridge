# MCP AI Bridge

Local MCP adapter for asking browser-based AI providers through a local HTTP bridge.

This project is intentionally small: it exposes MCP tools to Claude Code and forwards requests to a locally running browser bridge at `127.0.0.1`. It does not reverse-engineer provider APIs, store prompts, store answers, or handle login credentials.

## Important Boundaries

- This adapter does not add a third-party relay server, but prompts and context are still sent to the selected AI website through the browser bridge.
- This adapter cannot promise zero account risk. Use each provider within its terms and normal usage limits.
- Do not send private keys, API tokens, patient data, unpublished business data, or other sensitive material unless you have reviewed and approved it.
- By default, obvious secrets are blocked locally. Set `MCP_AI_ALLOW_SENSITIVE=1` only when you intentionally want to send such content.

## Requirements

- Node.js 18.17 or newer
- npm / npx
- A compatible local browser bridge that accepts:

```json
{
  "provider": "deepseek",
  "prompt": "question text"
}
```

at:

```text
http://127.0.0.1:3333/api/ask
```

and returns:

```json
{
  "success": true,
  "response": "provider answer text"
}
```

## Install

```bash
npm install
```

## Start the browser bridge

```bash
npm run start-bridge
```

For this headless Linux environment, use:

```bash
HTTP_PROXY=http://proxy.example.local:7890 HTTPS_PROXY=http://proxy.example.local:7890 \
http_proxy=http://proxy.example.local:7890 https_proxy=http://proxy.example.local:7890 \
npm run start-bridge-headless
```

`npm run start-bridge` also falls back to headless mode automatically when neither `DISPLAY` nor `WAYLAND_DISPLAY` is present. Use an SSH session with X11 forwarding if you need a visible browser for login.

For reproducibility, pin the upstream package version:

```bash
BROWSER_AI_BRIDGE_PACKAGE=browser-ai-bridge@<version> npm run start-bridge
```

The default package spec is pinned to `browser-ai-bridge@1.0.0`, which was the npm latest version verified on 2026-05-11.

On Linux without system Chrome, this project can use a Playwright-managed Chromium binary through `bin/chromium`. Install it with:

```bash
npx playwright@1.42.1 install chromium
```

`npm run start-bridge` prepends the project `bin/` directory to `PATH`, allowing `browser-ai-bridge` to discover that local Chromium wrapper.

The start script also sets `NO_PROXY=127.0.0.1,localhost` for the child process so Chrome DevTools traffic on `127.0.0.1:9222` does not go through an HTTP proxy.

## Configure Claude Code

From the project that should use this MCP server:

```bash
node /absolute/path/to/mcp-ai-bridge/setup.js
```

If `.mcp.json` already exists, the script prints the entry and does not overwrite the file.

The generated config uses the absolute Node.js path from `process.execPath`, which is more reliable when Node.js is installed through nvm and non-interactive shells do not automatically expose `node`.

## Tools

- `ask_deepseek`
- `ask_chatgpt`
- `ask_gemini`
- `ask_copilot`
- `ask_copilot365`
- `ask_grok`
- `reset_ai_session`

Each tool accepts:

```json
{
  "question": "required question",
  "context": "optional background"
}
```

Provider ask tools create one browser AI session per provider inside the current MCP server process and reuse that `sessionId` for later calls. In normal Claude Code stdio usage, that means one Claude Code window/task maps to one DeepSeek/ChatGPT/etc. browser conversation. Starting a new Claude Code window usually starts a fresh MCP process, so it creates a fresh browser AI session.

Use `reset_ai_session` when you want the current Claude Code window to start a new provider conversation:

```json
{
  "provider": "deepseek"
}
```

Use `"all"` to clear all cached provider sessions in the current MCP process. Session IDs are kept only in memory and are not written to disk.

## Environment Variables

| Variable | Default | Purpose |
|---|---:|---|
| `MCP_AI_BRIDGE_URL` | `http://127.0.0.1:3333/api/ask` | Local browser bridge endpoint |
| `MCP_AI_BRIDGE_TOKEN` | empty | Optional token sent as `x-local-bridge-token` |
| `MCP_AI_TIMEOUT_MS` | `180000` | Request timeout |
| `MCP_AI_MAX_PROMPT_CHARS` | `20000` | Maximum combined context and question length |
| `MCP_AI_ALLOW_SENSITIVE` | unset | Set to `1` to bypass local secret-pattern blocking |
| `BROWSER_AI_BRIDGE_PACKAGE` | `browser-ai-bridge@1.0.0` | Package spec used by `npm run start-bridge` |

Provider IDs can be overridden if the local browser bridge uses different names:

```bash
MCP_AI_PROVIDER_COPILOT365=copilot_365 npm run start
```

`setup.js` does not write `MCP_AI_BRIDGE_TOKEN` into `.mcp.json`. If you enable token checking in the browser bridge, pass the token through your shell or OS environment instead of storing it in the project config.

## Local Mock Check

In one terminal:

```bash
npm run mock-bridge
```

In another:

```bash
npm run start
```

Then connect an MCP client and call `ask_deepseek`.

## Security Notes

- No prompt or answer logging is implemented in this adapter.
- The optional token only protects the adapter-to-local-bridge hop if the browser bridge supports checking `x-local-bridge-token`.
- Localhost is not a complete trust boundary. Other local processes may still attempt to call open local ports.
- CI should mock the browser bridge instead of visiting real AI websites.
