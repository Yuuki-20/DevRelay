import { rm, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runProviderAction } from "./provider-actions.mjs";

const setupDir = path.dirname(fileURLToPath(import.meta.url));
const internalRoot = path.resolve(setupDir, "../..");
const [action, portText = "7317", inputPath = ""] = process.argv.slice(2);
let input = {};

try {
  if (!action) throw new Error("Setup action is required.");
  if (inputPath) {
    try { input = JSON.parse(await readFile(inputPath, "utf8")); }
    finally { await rm(inputPath, { force: true }); }
  }
  const result = await runProviderAction(action, input, {
    port: Number(portText), internalRoot,
    onOutput: (chunk) => process.stdout.write(chunk)
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
