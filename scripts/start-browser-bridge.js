#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const packageSpec =
  process.env.BROWSER_AI_BRIDGE_PACKAGE ||
  process.env.npm_package_config_browserAiBridgePackage ||
  "browser-ai-bridge@1.0.0";
const __filename = fileURLToPath(import.meta.url);
const projectDir = path.resolve(path.dirname(__filename), "..");
const localBinDir = path.join(projectDir, "bin");
const pathSeparator = process.platform === "win32" ? ";" : ":";
const env = {
  ...process.env,
  PATH: `${localBinDir}${pathSeparator}${process.env.PATH || ""}`
};
const hasDisplay = Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
if (process.argv.includes("--headless") || !hasDisplay) {
  env.HEADLESS = "true";
}
normalizeProxyEnv(env);
env.NO_PROXY = mergeNoProxy(process.env.NO_PROXY || process.env.no_proxy || "");
env.no_proxy = env.NO_PROXY;

console.error(`Starting ${packageSpec}`);
console.error("For reproducibility, set BROWSER_AI_BRIDGE_PACKAGE=browser-ai-bridge@<pinned-version>.");
if (env.HEADLESS === "true" && !hasDisplay) {
  console.error("No DISPLAY/WAYLAND_DISPLAY detected; starting browser-ai-bridge in headless mode.");
}

const child = spawn("npx", ["--yes", packageSpec], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  }
  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error(`Failed to start ${packageSpec}: ${error.message}`);
  process.exit(1);
});

function mergeNoProxy(current) {
  const required = ["127.0.0.1", "localhost"];
  const parts = current
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  for (const item of required) {
    if (!parts.includes(item)) {
      parts.push(item);
    }
  }

  return parts.join(",");
}

function normalizeProxyEnv(targetEnv) {
  const httpProxy = targetEnv.HTTP_PROXY || targetEnv.http_proxy || "";
  const httpsProxy = targetEnv.HTTPS_PROXY || targetEnv.https_proxy || "";

  if (httpProxy) {
    targetEnv.HTTP_PROXY = httpProxy;
    targetEnv.http_proxy = httpProxy;
  }

  if (httpsProxy) {
    targetEnv.HTTPS_PROXY = httpsProxy;
    targetEnv.https_proxy = httpsProxy;
  }
}
