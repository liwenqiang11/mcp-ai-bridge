#!/usr/bin/env node

import http from "node:http";

const host = process.env.MOCK_BRIDGE_HOST || "127.0.0.1";
const port = Number.parseInt(process.env.MOCK_BRIDGE_PORT || "3333", 10);
const requiredToken = process.env.MCP_AI_BRIDGE_TOKEN || "";
const sessions = new Map();
let nextSessionNumber = 1;

const server = http.createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/api/ping") {
    sendJson(response, 200, {
      status: "ready",
      browser: "connected",
      sessions: sessions.size
    });
    return;
  }

  if (requiredToken && request.headers["x-local-bridge-token"] !== requiredToken) {
    sendJson(response, 401, { error: "invalid_token" });
    return;
  }

  if (request.method === "GET" && request.url === "/api/sessions") {
    sendJson(response, 200, [...sessions.values()]);
    return;
  }

  if (request.method === "POST" && request.url === "/api/sessions") {
    const body = await readRequestBody(request);
    const payload = parseJson(body);

    if (!payload?.provider) {
      sendJson(response, 400, { error: "missing_provider" });
      return;
    }

    const sessionId = `${payload.provider}-${nextSessionNumber++}`;
    sessions.set(sessionId, {
      id: sessionId,
      providerId: payload.provider,
      messages: 0
    });
    sendJson(response, 200, { success: true, sessionId });
    return;
  }

  if (request.method === "DELETE" && request.url?.startsWith("/api/sessions/")) {
    const sessionId = decodeURIComponent(request.url.slice("/api/sessions/".length));
    const existed = sessions.delete(sessionId);
    sendJson(response, existed ? 200 : 404, { success: existed });
    return;
  }

  if (request.method !== "POST" || request.url !== "/api/ask") {
    sendJson(response, 404, { error: "not_found" });
    return;
  }

  const body = await readRequestBody(request);
  const payload = parseJson(body);
  if (!payload) {
    sendJson(response, 400, { error: "invalid_json" });
    return;
  }

  const session = sessions.get(payload.sessionId);
  if (!session) {
    sendJson(response, 404, { error: "unknown_session" });
    return;
  }
  session.messages += 1;

  sendJson(response, 200, {
    success: true,
    response: `[mock:${session.providerId}:${payload.sessionId}:message-${session.messages}] ${String(payload.prompt || "").slice(0, 160)}`
  });
});

server.listen(port, host, () => {
  console.error(`Mock browser AI bridge listening on http://${host}:${port}/api/ask`);
});

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let data = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      data += chunk;
    });
    request.on("end", () => resolve(data));
    request.on("error", reject);
  });
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(`${JSON.stringify(payload)}\n`);
}

function parseJson(body) {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}
