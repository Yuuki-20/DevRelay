import { spawn } from "node:child_process";

function launch(file, args, spawnImpl) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(file, args, { detached: process.platform !== "win32", stdio: "ignore", windowsHide: true });
    child.once("error", reject);
    child.once("spawn", () => { child.unref(); resolve(); });
  });
}

export async function openExternalUrl(value, { platform = process.platform, spawnImpl = spawn } = {}) {
  const url = new URL(value);
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("Only HTTP and HTTPS links can be opened externally.");
  if (platform === "win32") return await launch("rundll32.exe", ["url.dll,FileProtocolHandler", url.href], spawnImpl);
  if (platform === "darwin") return await launch("open", [url.href], spawnImpl);
  try {
    return await launch("xdg-open", [url.href], spawnImpl);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return await launch("gio", ["open", url.href], spawnImpl);
  }
}
