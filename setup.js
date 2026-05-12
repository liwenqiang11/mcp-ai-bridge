#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const projectDir = path.dirname(__filename);
const serverPath = path.join(projectDir, "mcp-ai-bridge.js");

const targetConfigPath = resolveTargetConfigPath();
const env = {
  MCP_AI_BRIDGE_URL: process.env.MCP_AI_BRIDGE_URL || "http://127.0.0.1:3333/api/ask"
};

const configEntry = {
  mcpServers: {
    "ai-bridge": {
      command: process.execPath,
      args: [serverPath],
      env
    }
  }
};

if (fs.existsSync(targetConfigPath)) {
  const existing = fs.readFileSync(targetConfigPath, "utf8");
  console.log(`${targetConfigPath} already exists. It was not modified.`);
  console.log("Merge the following entry manually if needed:\n");
  console.log(JSON.stringify(configEntry, null, 2));

  if (!existing.includes("ai-bridge")) {
    process.exitCode = 2;
  }
} else {
  fs.writeFileSync(targetConfigPath, `${JSON.stringify(configEntry, null, 2)}\n`, { mode: 0o600 });
  console.log(`Created ${targetConfigPath}`);
}

function resolveTargetConfigPath() {
  const explicit = process.env.MCP_AI_CONFIG_PATH;
  if (explicit) {
    return path.resolve(explicit);
  }

  return path.join(process.cwd(), ".mcp.json");
}

export function getDefaultClaudeConfigHints() {
  return {
    home: os.homedir(),
    currentDirectoryConfig: path.join(process.cwd(), ".mcp.json")
  };
}
