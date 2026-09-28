import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const sourceInternalRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("Windows launcher accepts successful native commands that write to stderr", { skip: process.platform !== "win32" }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "devrelay-launcher-stderr-"));
  try {
    const internalRoot = path.join(root, "internal");
    const scriptsDir = path.join(internalRoot, "scripts");
    const binDir = path.join(root, "bin");
    await mkdir(scriptsDir, { recursive: true });
    await mkdir(path.join(internalRoot, "src"), { recursive: true });
    await mkdir(path.join(internalRoot, "dist", "src"), { recursive: true });
    await mkdir(binDir, { recursive: true });

    await copyFile(path.join(sourceInternalRoot, "scripts", "DevRelay-Launcher.ps1"), path.join(scriptsDir, "DevRelay-Launcher.ps1"));
    await copyFile(path.join(sourceInternalRoot, "scripts", "DevRelay-ProviderTools.ps1"), path.join(scriptsDir, "DevRelay-ProviderTools.ps1"));
    await writeFile(path.join(internalRoot, "package.json"), "{}\n", "utf8");
    await writeFile(path.join(internalRoot, "package-lock.json"), "{\"lockfileVersion\":3}\n", "utf8");
    await writeFile(path.join(internalRoot, "tsconfig.json"), "{}\n", "utf8");
    await writeFile(path.join(internalRoot, "dist", "src", "main.js"), "// current build\n", "utf8");

    await copyFile(process.execPath, path.join(binDir, "node.exe"));
    await writeFile(path.join(binDir, "npm.cmd"), "@echo off\r\n>&2 echo npm notice regression-stderr\r\nexit /b 0\r\n", "utf8");

    const pathValue = `${binDir};${process.env.PATH ?? ""}`;
    const { stdout, stderr } = await execFileAsync("powershell.exe", [
      "-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass",
      "-File", path.join(scriptsDir, "DevRelay-Launcher.ps1"),
      "-SetupOnly", "-NoTunnel"
    ], {
      cwd: internalRoot,
      env: { ...process.env, PATH: pathValue, Path: pathValue },
      timeout: 20_000,
      windowsHide: true
    });

    const output = `${stdout}${stderr}`;
    assert.match(output, /npm notice regression-stderr/);
    assert.match(output, /Local DevRelay build\/setup is complete/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
