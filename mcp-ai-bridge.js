#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const DEFAULT_BRIDGE_BASE_URL = "http://127.0.0.1:3333";
const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_MAX_CHARS = 200_000;

const PROVIDERS = {
  deepseek: {
    toolName: "ask_deepseek",
    title: "Ask DeepSeek",
    description: "Ask the local browser AI bridge to send a prompt to DeepSeek.",
    provider: process.env.MCP_AI_PROVIDER_DEEPSEEK || "deepseek"
  },
  chatgpt: {
    toolName: "ask_chatgpt",
    title: "Ask ChatGPT",
    description: "Ask the local browser AI bridge to send a prompt to ChatGPT.",
    provider: process.env.MCP_AI_PROVIDER_CHATGPT || "chatgpt"
  },
  gemini: {
    toolName: "ask_gemini",
    title: "Ask Gemini",
    description: "Ask the local browser AI bridge to send a prompt to Gemini.",
    provider: process.env.MCP_AI_PROVIDER_GEMINI || "gemini"
  },
  copilot: {
    toolName: "ask_copilot",
    title: "Ask Copilot",
    description: "Ask the local browser AI bridge to send a prompt to Microsoft Copilot.",
    provider: process.env.MCP_AI_PROVIDER_COPILOT || "copilot"
  },
  copilot365: {
    toolName: "ask_copilot365",
    title: "Ask Microsoft 365 Copilot",
    description: "Ask the local browser AI bridge to send a prompt to Microsoft 365 Copilot.",
    provider: process.env.MCP_AI_PROVIDER_COPILOT365 || "copilot365"
  },
  grok: {
    toolName: "ask_grok",
    title: "Ask Grok",
    description: "Ask the local browser AI bridge to send a prompt to Grok.",
    provider: process.env.MCP_AI_PROVIDER_GROK || "grok"
  }
};

const bridgeAskUrl = process.env.MCP_AI_BRIDGE_URL || `${readBridgeBaseUrl()}/api/ask`;
const bridgeBaseUrl = readBridgeBaseUrl(bridgeAskUrl);
const bridgeToken = process.env.MCP_AI_BRIDGE_TOKEN || "";
const requestTimeoutMs = readPositiveInt(process.env.MCP_AI_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
const maxPromptChars = readPositiveInt(process.env.MCP_AI_MAX_PROMPT_CHARS, DEFAULT_MAX_CHARS);
const allowSensitive = process.env.MCP_AI_ALLOW_SENSITIVE === "1";
const providerSessions = new Map();

const inputSchema = {
  question: z.string().min(1).describe("Question to ask the selected AI provider."),
  context: z.string().optional().describe("Optional background context, such as code or command output.")
};

const resetSchema = {
  provider: z
    .enum(["deepseek", "chatgpt", "gemini", "copilot", "copilot365", "grok", "all"])
    .default("all")
    .describe("Provider session to reset for this Claude Code window.")
};

const server = new McpServer({
  name: "mcp-ai-bridge",
  version: "0.1.0"
});

for (const providerConfig of Object.values(PROVIDERS)) {
  server.registerTool(
    providerConfig.toolName,
    {
      title: providerConfig.title,
      description: providerConfig.description,
      inputSchema
    },
    async ({ question, context }) => askProvider(providerConfig, question, context)
  );
}

server.registerTool(
  "reset_ai_session",
  {
    title: "Reset AI Browser Session",
    description:
      "Reset the cached browser AI session for this Claude Code window. Use this when starting a new task.",
    inputSchema: resetSchema
  },
  async ({ provider = "all" }) => resetAiSession(provider)
);

await server.connect(new StdioServerTransport());

async function askProvider(providerConfig, question, context) {
  const prompt = buildPrompt(question, context);
  const validationError = validatePrompt(prompt);

  if (validationError) {
    return textResult(validationError);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    let sessionId = await getOrCreateSessionId(providerConfig, controller.signal);
    let response = await fetch(bridgeAskUrl, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify({
        sessionId,
        prompt,
        skipConstraint: true,
        normalizeToolCalls: false
      }),
      signal: controller.signal
    });

    if (response.status === 404 || response.status === 410) {
      providerSessions.delete(providerConfig.provider);
      sessionId = await getOrCreateSessionId(providerConfig, controller.signal);
      response = await fetch(bridgeAskUrl, {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify({
          sessionId,
          prompt,
          skipConstraint: true,
          normalizeToolCalls: false
        }),
        signal: controller.signal
      });
    }

    if (!response.ok) {
      return textResult(formatBridgeError(response.status, await safeReadText(response)));
    }

    const payload = await response.json().catch(() => null);
    const answer = payload?.response || payload?.answer || payload?.data?.response;

    if (typeof answer !== "string" || answer.trim().length === 0) {
      return textResult(
        "The local browser AI bridge returned an empty or invalid answer. Check provider login state and bridge logs."
      );
    }

    return textResult(answer.trim());
  } catch (error) {
    if (error?.name === "AbortError") {
      return textResult(`The request to ${providerConfig.title} timed out after ${requestTimeoutMs} ms.`);
    }

    return textResult(
      [
        "Could not reach the local browser AI bridge.",
        `Bridge URL: ${bridgeAskUrl}`,
        `Reason: ${error?.message || String(error)}`
      ].join("\n")
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function getOrCreateSessionId(providerConfig, signal) {
  const cached = providerSessions.get(providerConfig.provider);

  if (cached?.sessionId) {
    return cached.sessionId;
  }

  const response = await fetch(`${bridgeBaseUrl}/api/sessions`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({
      provider: providerConfig.provider
    }),
    signal
  });

  if (!response.ok) {
    throw new Error(formatBridgeError(response.status, await safeReadText(response)));
  }

  const payload = await response.json().catch(() => null);
  const sessionId = payload?.sessionId || payload?.data?.sessionId;

  if (typeof sessionId !== "string" || sessionId.trim().length === 0) {
    throw new Error("The local browser AI bridge did not return a valid sessionId.");
  }

  providerSessions.set(providerConfig.provider, {
    providerKey: providerConfig.provider,
    toolName: providerConfig.toolName,
    sessionId,
    createdAt: new Date().toISOString()
  });

  return sessionId;
}

async function resetAiSession(provider) {
  const targets =
    provider === "all"
      ? [...providerSessions.keys()]
      : [PROVIDERS[provider]?.provider || provider].filter(Boolean);

  const closed = [];
  const failed = [];

  for (const providerKey of targets) {
    const cached = providerSessions.get(providerKey);

    if (!cached?.sessionId) {
      continue;
    }

    providerSessions.delete(providerKey);

    try {
      const response = await fetch(`${bridgeBaseUrl}/api/sessions/${cached.sessionId}`, {
        method: "DELETE",
        headers: buildHeaders()
      });

      if (!response.ok && response.status !== 404) {
        failed.push(`${providerKey}: HTTP ${response.status}`);
      } else {
        closed.push(providerKey);
      }
    } catch (error) {
      failed.push(`${providerKey}: ${error?.message || String(error)}`);
    }
  }

  if (closed.length === 0 && failed.length === 0) {
    return textResult(`No cached AI sessions to reset for provider=${provider}.`);
  }

  return textResult(
    [
      closed.length ? `Reset cached sessions: ${closed.join(", ")}.` : "",
      failed.length ? `Failed to close some bridge sessions: ${failed.join("; ")}.` : "",
      "The next ask_* call in this Claude Code window will create a fresh browser AI session."
    ]
      .filter(Boolean)
      .join("\n")
  );
}

function buildPrompt(question, context) {
  const cleanQuestion = question.trim();
  const cleanContext = typeof context === "string" ? context.trim() : "";

  if (!cleanContext) {
    return cleanQuestion;
  }

  return [
    "Use the following context to answer the question.",
    "",
    "<context>",
    cleanContext,
    "</context>",
    "",
    "<question>",
    cleanQuestion,
    "</question>"
  ].join("\n");
}

function validatePrompt(prompt) {
  if (prompt.length > maxPromptChars) {
    return `Prompt is ${prompt.length} characters, exceeding MCP_AI_MAX_PROMPT_CHARS=${maxPromptChars}.`;
  }

  if (!allowSensitive) {
    const finding = findSensitivePattern(prompt);
    if (finding) {
      return [
        `Prompt blocked by local safety policy: detected ${finding}.`,
        "Review the content manually or set MCP_AI_ALLOW_SENSITIVE=1 if you intentionally want to send it."
      ].join(" ");
    }
  }

  return "";
}

function findSensitivePattern(text) {
  const checks = [
    ["private key material", /-----BEGIN (?:RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/i],
    ["GitHub token", /gh[pousr]_[A-Za-z0-9_]{20,}/],
    ["OpenAI-style API key", /sk-[A-Za-z0-9_-]{20,}/],
    ["AWS access key", /AKIA[0-9A-Z]{16}/],
    ["generic bearer token", /bearer\s+[A-Za-z0-9._~+/=-]{24,}/i]
  ];

  for (const [label, pattern] of checks) {
    if (pattern.test(text)) {
      return label;
    }
  }

  return "";
}

function buildHeaders() {
  const headers = {
    "content-type": "application/json"
  };

  if (bridgeToken) {
    headers["x-local-bridge-token"] = bridgeToken;
  }

  return headers;
}

function textResult(text) {
  return {
    content: [
      {
        type: "text",
        text
      }
    ]
  };
}

function formatBridgeError(status, body) {
  const hints = {
    401: "The local bridge rejected the token. Check MCP_AI_BRIDGE_TOKEN.",
    403: "The local bridge denied the request.",
    404: "The bridge endpoint was not found. Check MCP_AI_BRIDGE_URL.",
    408: "The provider request timed out inside the local bridge.",
    429: "The provider or bridge is rate limiting requests.",
    500: "The local bridge had an internal error.",
    502: "The provider page or upstream browser automation failed.",
    503: "The provider may be unavailable or not logged in."
  };

  return [
    `Local browser AI bridge returned HTTP ${status}.`,
    hints[status] || "Check whether the bridge is running and the provider is logged in.",
    body ? `Response body: ${body}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

async function safeReadText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function readPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readBridgeBaseUrl(askUrl = process.env.MCP_AI_BRIDGE_URL) {
  if (!askUrl) {
    return process.env.MCP_AI_BRIDGE_BASE_URL || DEFAULT_BRIDGE_BASE_URL;
  }

  try {
    const url = new URL(askUrl);
    return `${url.protocol}//${url.host}`;
  } catch {
    return process.env.MCP_AI_BRIDGE_BASE_URL || DEFAULT_BRIDGE_BASE_URL;
  }
}
