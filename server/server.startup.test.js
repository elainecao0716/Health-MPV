import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Starts the real server.js as a separate process. OPENAI_API_KEY is blanked, so no request could
// ever reach OpenAI, and the usage file points at a throwaway folder.
const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
let tmp;

const runServer = (env, { waitFor, timeoutMs = 8000 } = {}) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, ["server.js"], {
      cwd: SERVER_DIR,
      env: { ...process.env, OPENAI_API_KEY: "", PORT: "0", USAGE_FILE: path.join(tmp, "usage.json"), ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const done = (exitCode) => {
      clearTimeout(timer);
      resolve({ exitCode, output });
    };
    const onData = (chunk) => {
      output += chunk;
      if (waitFor && output.includes(waitFor)) {
        child.kill();
        done("running");
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", (code) => done(code));
    const timer = setTimeout(() => {
      child.kill();
      done("timeout");
    }, timeoutMs);
  });

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "startup-"));
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("production safety lock", () => {
  it("refuses to start in production while only the development usage file exists", async () => {
    const { exitCode, output } = await runServer({ NODE_ENV: "production" });
    expect(exitCode).toBe(1);
    expect(output).toMatch(/no_persistent_usage_store/);
    expect(output).toMatch(/development only/);
    expect(output).not.toMatch(/backend running/);
  });
});

describe("development startup", () => {
  it("starts, but warns and blocks AI when the usage file is missing", async () => {
    const { exitCode, output } = await runServer({ NODE_ENV: "development" }, { waitFor: "backend running" });
    expect(exitCode).toBe("running");
    expect(output).toMatch(/usage tracking is unavailable \(missing\)/);
    expect(output).toMatch(/npm run usage:init/);
  });
});
