const { app, BrowserWindow, Notification, shell } = require("electron");
const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const path = require("node:path");

function readOption(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const targetUrl = readOption("--devrelay-url");
const mode = readOption("--devrelay-mode", "main");
const statePath = readOption("--devrelay-window-state");
const userDataPath = readOption("--devrelay-user-data");
const title = readOption("--devrelay-title", "DevRelay");
const origin = targetUrl ? new URL(targetUrl).origin : "";
const initialWidth = Number(readOption("--devrelay-width", "900"));
const initialHeight = Number(readOption("--devrelay-height", "700"));
const minimumWidth = Number(readOption("--devrelay-min-width", "480"));
const minimumHeight = Number(readOption("--devrelay-min-height", "480"));
const iconPath = path.join(__dirname, "..", "assets", "devrelay-icon.png");
let mainWindow;
let notifiedOAuthId = null;
let closing = false;
let allowClose = false;
let sizeSaveTimer = null;

if (userDataPath) {
  fsSync.mkdirSync(userDataPath, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") fsSync.chmodSync(userDataPath, 0o700);
  app.setPath("userData", userDataPath);
}
app.setName("DevRelay");
if (process.platform === "win32") app.setAppUserModelId("DevRelay.Desktop");

function validDimension(value, minimum, fallback) {
  return Number.isFinite(value) && value >= minimum && value <= 10000 ? Math.round(value) : fallback;
}

async function post(pathname, body = {}) {
  if (!origin) return;
  try {
    await fetch(`${origin}${pathname}`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000)
    });
  } catch { /* controller may already be shutting down */ }
}

async function restoreSize() {
  try {
    const saved = JSON.parse(await fs.readFile(statePath, "utf8"));
    return {
      width: validDimension(Number(saved.width), minimumWidth, initialWidth),
      height: validDimension(Number(saved.height), minimumHeight, initialHeight)
    };
  } catch {
    return { width: initialWidth, height: initialHeight };
  }
}

async function saveSize() {
  if (!statePath || !mainWindow || mainWindow.isDestroyed()) return;
  try {
    const bounds = mainWindow.getBounds();
    await fs.mkdir(path.dirname(statePath), { recursive: true });
    await fs.writeFile(statePath, `${JSON.stringify({ width: bounds.width, height: bounds.height }, null, 2)}\n`, "utf8");
  } catch { /* window-state persistence is best effort */ }
}

function scheduleSizeSave() {
  if (sizeSaveTimer) clearTimeout(sizeSaveTimer);
  sizeSaveTimer = setTimeout(() => { sizeSaveTimer = null; void saveSize(); }, 250);
  sizeSaveTimer.unref();
}

function revealForOAuth(pending) {
  const request = pending?.[0];
  if (!request || request.id === notifiedOAuthId) return;
  notifiedOAuthId = request.id;
  mainWindow?.show();
  mainWindow?.focus();
  if (Notification.isSupported()) {
    const notification = new Notification({
      title: "DevRelay access request",
      body: `${request.clientName || "An application"} is waiting for approval.`
    });
    notification.on("click", () => { mainWindow?.show(); mainWindow?.focus(); });
    notification.show();
  }
}

async function pollOAuth() {
  if (mode !== "main" || !mainWindow || mainWindow.isDestroyed()) return;
  try {
    const response = await fetch(`${origin}/api/state`, {
      cache: "no-store",
      headers: { "x-devrelay-gui-host": "electron" },
      signal: AbortSignal.timeout(1500)
    });
    if (!response.ok) return;
    const state = await response.json();
    const pending = state.oauthPending ?? [];
    if (!pending.length) notifiedOAuthId = null;
    else revealForOAuth(pending);
  } catch { /* controller remains the source of truth */ }
}

async function createWindow() {
  if (!targetUrl || !origin || !["http:", "https:"].includes(new URL(targetUrl).protocol)) {
    throw new Error("A valid DevRelay controller URL is required.");
  }
  const size = await restoreSize();
  mainWindow = new BrowserWindow({
    title,
    icon: iconPath,
    width: size.width,
    height: size.height,
    minWidth: minimumWidth,
    minHeight: minimumHeight,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "https:") void shell.openExternal(parsed.href);
    } catch { /* reject malformed destinations */ }
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    try {
      if (new URL(url).origin !== origin) event.preventDefault();
    } catch { event.preventDefault(); }
  });
  mainWindow.on("resize", scheduleSizeSave);
  mainWindow.on("close", (event) => {
    if (allowClose) return;
    event.preventDefault();
    if (closing) return;
    closing = true;
    if (sizeSaveTimer) { clearTimeout(sizeSaveTimer); sizeSaveTimer = null; }
    void saveSize().then(async () => {
      if (mode === "setup") await post("/api/window-close");
      else await post("/api/stop", { reason: "window closed" });
      allowClose = true;
      mainWindow?.close();
    });
  });
  mainWindow.on("closed", () => { mainWindow = null; });
  await mainWindow.loadURL(targetUrl);
  if (mode === "main") await post("/api/window-ready");
  setInterval(() => { void pollOAuth(); }, 1000).unref();
}

app.whenReady().then(createWindow).catch((error) => {
  console.error(`[DevRelay GUI] ${error.message}`);
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});

app.on("window-all-closed", () => app.quit());
