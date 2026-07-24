import { spawn } from "node:child_process";

const nextBin = "node_modules/next/dist/bin/next";
const playwrightBin = "node_modules/playwright/cli.js";
const baseUrl = "http://127.0.0.1:3000";

const server = spawn(
  process.execPath,
  [nextBin, "start", "--hostname", "127.0.0.1", "--port", "3000"],
  { stdio: ["ignore", "pipe", "pipe"] }
);

let serverOutput = "";
server.stdout.on("data", (chunk) => {
  serverOutput += chunk;
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk;
});

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`Next.js test server exited early.\n${serverOutput}`);
    }
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Next.js test server did not become ready.\n${serverOutput}`);
}

function stopServer() {
  if (server.exitCode === null) server.kill();
}

try {
  await waitForServer();
  const tests = spawn(process.execPath, [playwrightBin, "test"], {
    stdio: "inherit",
    env: { ...process.env, PLAYWRIGHT_EXTERNAL_SERVER: "1" },
  });
  const exitCode = await new Promise((resolve) => tests.on("exit", resolve));
  process.exitCode = typeof exitCode === "number" ? exitCode : 1;
} finally {
  stopServer();
}
