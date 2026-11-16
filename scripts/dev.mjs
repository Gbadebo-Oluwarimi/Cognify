import { spawn } from "node:child_process";

for (const file of [".env.local", ".env"]) {
  try { process.loadEnvFile?.(file); } catch { /* Environment variables may be injected by the shell. */ }
}

const children = [
  spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev"], { stdio: "inherit", env: process.env }),
  spawn(process.execPath, ["scripts/material-worker.mjs"], { stdio: "inherit", env: process.env }),
];
let stopping = false;

function stop(signal = "SIGTERM", exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill(signal);
  setTimeout(() => process.exit(exitCode), 250).unref();
}

for (const child of children) {
  child.on("error", error => { console.error("Cognify development process failed to start:", error.message); stop("SIGTERM", 1); });
  child.on("exit", code => { if (!stopping) stop("SIGTERM", code || 0); });
}
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
