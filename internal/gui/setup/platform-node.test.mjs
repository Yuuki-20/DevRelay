import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { electronSpawnEnvironment } from "../electron-environment.mjs";
import { openExternalUrl } from "../open-external.mjs";
import { killProcessTree, queryLinuxProcesses, trackedProcessMatches } from "../session-recovery.mjs";
import { runProviderAction } from "./provider-actions.mjs";

test("Electron window launches do not inherit Node-only Electron mode", () => {
  const env = electronSpawnEnvironment({ ELECTRON_RUN_AS_NODE: "1", DISPLAY: ":0", PATH: "/usr/bin" });
  assert.equal(env.ELECTRON_RUN_AS_NODE, undefined);
  assert.equal(env.DISPLAY, ":0");
  assert.equal(env.PATH, "/usr/bin");
});

test("external links use the desktop default handler and reject non-web protocols", async () => {
  const calls = [];
  const fakeSpawn = (file, args) => {
    calls.push({ file, args });
    const child = new EventEmitter();
    child.unref = () => {};
    queueMicrotask(() => child.emit("spawn"));
    return child;
  };
  await openExternalUrl("https://example.test/path", { platform: "linux", spawnImpl: fakeSpawn });
  assert.deepEqual(calls, [{ file: "xdg-open", args: ["https://example.test/path"] }]);
  await assert.rejects(
    openExternalUrl("javascript:alert(1)", { platform: "linux", spawnImpl: fakeSpawn }),
    /Only HTTP and HTTPS/
  );
  assert.equal(calls.length, 1);
});

test("Linux process recovery reads process identity from procfs", async () => {
  const procRoot = await mkdtemp(path.join(os.tmpdir(), "devrelay-procfs-"));
  try {
    const pid = 4242;
    const processDir = path.join(procRoot, String(pid));
    await mkdir(processDir);
    await writeFile(path.join(procRoot, "uptime"), "120.00 0.00\n");
    const fields = ["R", "41", ...Array(17).fill("0"), "9000"];
    await writeFile(path.join(processDir, "stat"), `${pid} (node runtime) ${fields.join(" ")}\n`);
    await writeFile(path.join(processDir, "cmdline"), Buffer.from(["/usr/bin/node", "/tmp/devrelay/linux-runtime.mjs", "7317"].join("\0")));
    await symlink("/usr/bin/node", path.join(processDir, "exe"));

    const [actual] = await queryLinuxProcesses({ procRoot });
    assert.equal(actual.processId, pid);
    assert.equal(actual.parentProcessId, 41);
    assert.equal(actual.name, "node runtime");
    assert.equal(actual.executablePath, "/usr/bin/node");
    assert.match(actual.commandLine, /linux-runtime\.mjs 7317$/);
    assert.ok(Number.isFinite(Date.parse(actual.creationDate)));

    const record = {
      role: "launcher", pid, parentPid: 41,
      startedAt: actual.creationDate,
      executableName: "node runtime",
      executablePath: "/usr/bin/node",
      commandIncludes: ["/tmp/devrelay/linux-runtime.mjs", "7317"]
    };
    assert.equal(trackedProcessMatches(record, actual, { internalRoot: "/tmp/devrelay/internal" }), true);
    assert.equal(trackedProcessMatches(record, { ...actual, commandLine: "/usr/bin/node unrelated.mjs 7317" }, { internalRoot: "/tmp/devrelay/internal" }), false);
  } finally { await rm(procRoot, { recursive: true, force: true }); }
});

test("Linux process recovery terminates the verified process tree", { skip: process.platform !== "linux" }, async () => {
  const script = `const { spawn } = require("node:child_process"); const child = spawn("sleep", ["60"], { stdio: "ignore" }); process.stdout.write(String(child.pid) + "\\n"); setInterval(() => {}, 10000);`;
  const child = spawn(process.execPath, ["-e", script], { stdio: ["ignore", "pipe", "ignore"] });
  let announcedChildPid = "";
  let announceChild;
  const announced = new Promise((resolve) => { announceChild = resolve; });
  const closed = new Promise((resolve, reject) => {
    child.once("close", (code, signal) => resolve({ code, signal }));
    child.once("error", reject);
  });
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { announcedChildPid += chunk; if (announcedChildPid.trim()) announceChild(); });
  await Promise.race([
    announced,
    new Promise((_, reject) => setTimeout(() => reject(new Error("test process did not start")), 2000))
  ]);
  const result = await killProcessTree(child.pid);
  assert.equal(result.ok, true);
  const exit = await Promise.race([
    closed,
    new Promise((_, reject) => setTimeout(() => reject(new Error("test process tree did not stop")), 2000))
  ]);
  assert.ok(["SIGTERM", "SIGKILL"].includes(exit.signal));
  assert.notEqual(announcedChildPid.trim(), "");
});

test("Linux Cloudflare setup validates the hostname before invoking provider commands", { skip: process.platform !== "linux" }, async () => {
  const internalRoot = await mkdtemp(path.join(os.tmpdir(), "devrelay-provider-test-"));
  try {
    await assert.rejects(
      runProviderAction("ConfigureCloudflareNamed", { hostname: "example.test;touch /tmp/pwned", tunnelName: "devrelay" }, { internalRoot }),
      /Enter a valid full hostname/
    );
    await assert.rejects(
      runProviderAction("ConfigureCloudflareNamed", { hostname: "devrelay.example.com", tunnelName: "devrelay" }, { internalRoot }),
      /example hostname is a placeholder/
    );
    assert.deepEqual(await readFile(path.join(internalRoot, ".devrelay", "launcher.json")).then(() => "present", () => "missing"), "missing");
  } finally { await rm(internalRoot, { recursive: true, force: true }); }
});
