# Desktop launcher and GUI

DevRelay has a normal Windows launcher in the project root:

- `DevRelay.exe`: primary taskbar-friendly launcher.
- `DevRelay.cmd`: compatibility fallback for the same hidden startup bootstrap.

The main window and separate setup wizard use the same HTML/CSS/JavaScript interfaces inside Electron native windows. The controllers and provider flows are Node.js. Windows-specific integrations still use PowerShell where they depend on Windows APIs.

Windows is the supported release target. Linux GUI/runtime support is being implemented and is not yet a supported release target. For local Linux development, install the core npm dependencies, build, and run `npm run gui` from `internal/`.

## Startup sequence

`DevRelay.exe` starts `gui/Bootstrap-DevRelayGui.ps1` directly without a console window. The compatibility `DevRelay.cmd` path still hands off through `gui/launch.vbs`. The Electron window uses the `DevRelay.Desktop` AppUserModelID for taskbar grouping and pinning.

The bootstrap performs these steps in order:

1. Refuse a duplicate GUI launch.
2. Check for the latest published GitHub Release and safely fast-forward an eligible clean official checkout.
3. Load or migrate `.devrelay/setup.json`.
4. If connection setup is incomplete, run the separate `gui/setup/setup-wizard.mjs` window and wait for it to finish.
5. Start `gui/devrelay-gui.mjs` only after setup is complete.

A cancelled first-run wizard leaves setup incomplete and the normal GUI does not auto-start.

## Release updates

On Windows, the release updater checks only GitHub's latest published full Release. Ordinary branch pushes, standalone tags, drafts, and prereleases are not followed. Linux development checkouts currently use the source tree and do not have an automatic update path.

The checkout is modified only when `origin` is the official DevRelay repository, the worktree is clean, and the current commit can fast-forward to the release commit. Forks, dirty worktrees, source archives without `.git`, offline machines, and development checkouts ahead of a release are left untouched. `.devrelay` is outside Git and survives updates.

## Connection Setup

Connection selection is owned by the setup wizard, not by the main Settings panel. `.devrelay/setup.json` records the selected connection family/provider but contains no API keys.

The top-level choices are:

- **OpenAI Secure Tunnel** - the preferred private/outbound architecture. It is currently shown as Experimental because known upstream ChatGPT/tunnel-client reports can prevent connector creation or tool refresh even when the local tunnel is healthy. The wizard names issues #71, #57, and #41 and attempts a non-blocking OPEN/CLOSED status refresh from GitHub.
- **HTTPS** - DevRelay exposes its HTTP MCP endpoint through an HTTPS provider and enables DevRelay OAuth 2.1.

HTTPS offers:

- **Tailscale Funnel** - recommended HTTPS provider. No custom domain is required. Windows can launch the official installer with UAC. Linux users install the official package for their distribution first; sign-in remains the normal Tailscale browser flow on both platforms.
- **Cloudflare Named Tunnel** - stable public hostname. Requires a Cloudflare account and a domain already managed by Cloudflare. The wizard uses `cloudflared tunnel login`, tunnel creation, and DNS routing rather than automating the Cloudflare Dashboard.
- **Cloudflare Quick Tunnel** - no account/domain required. It is temporary: a new `trycloudflare.com` URL can be assigned after restart.

Provider operations happen only after the user presses the corresponding setup button. Merely opening the wizard does not sign in, install software, create a tunnel, or modify provider-side resources.

## Transaction and reset behavior

Reopening `Connection Setup...` while DevRelay is stopped starts the same separate wizard. DevRelay keeps the existing connection while a replacement is being prepared. Once preparation succeeds, the prepared connection is committed before the ChatGPT registration guide is shown; that final guide closes with **Close**.

Local OpenAI/Cloudflare connection files are backed up for the wizard session. Cancel/close before the prepared connection is committed restores those local files. Provider-side resources that the user explicitly creates during setup are not silently deleted.

Advanced Reset removes DevRelay's local connection credentials/configuration. It does not uninstall Tailscale and does not automatically delete remote Tailscale or Cloudflare resources.

## ChatGPT registration guidance

The final wizard page documents the registration path for the selected connection.

For OpenAI Secure Tunnel:

1. Enable ChatGPT Developer Mode.
2. Open Apps / Plugins and Create (+).
3. Choose a Tunnel connection and select the prepared tunnel.
4. Choose **No authentication** for the MCP server.
5. Create / Scan Tools. If ChatGPT-side creation or refresh fails while the local tunnel is healthy, check the displayed upstream issue numbers.

For HTTPS providers:

1. Enable ChatGPT Developer Mode.
2. Open Apps / Plugins and Create (+).
3. Enter the public DevRelay `/mcp` URL.
4. Choose **OAuth** authentication.
5. Create / Scan Tools, then approve the OAuth request in the blocking DevRelay approval dialog. The host attempts to show the main window and sends a desktop notification when a request arrives. Wayland may prevent programmatic focus changes.

## Main control GUI

The GUI is DevRelay's human-facing control and observation surface; MCP remains the machine-facing execution interface. The GUI makes remote access visible and owns setup, authorization, lifecycle, settings, and diagnostics without becoming a second execution API.

The main Settings panel no longer has a `Mode` selector. It shows the current Connection and a `Connection Setup...` button. Port, Auto start, Theme, device name, and aliases remain normal settings.

Connection Setup can only be opened while the runtime is stopped. The GUI controller reloads `setup.json` after the wizard exits and updates the displayed connection/endpoint.

The main controller listens only on `127.0.0.1:7318` and rejects state-changing requests from other browser origins. The setup controller similarly binds only to `127.0.0.1:7319` and applies the same Host/Origin boundary.

## Runtime ownership

The Windows runtime worker is `scripts/DevRelay-Launcher.ps1`; Linux uses `gui/linux-runtime.mjs`. Both read `.devrelay/setup.json` and supervise the selected connection:

- OpenAI Secure Tunnel: prepare/validate the saved tunnel-client profile and run it beside local DevRelay.
- Tailscale Funnel: start local DevRelay with HTTPS OAuth metadata and supervise a Funnel process.
- Cloudflare Named Tunnel: start local DevRelay and the saved Named Tunnel configuration.
- Cloudflare Quick Tunnel: obtain the temporary public URL first, set OAuth issuer/resource from that URL, then start local DevRelay.

The launcher is non-interactive. Missing connection credentials produce an error directing the user back to Connection Setup instead of hidden `Read-Host` prompts.

`-SetupOnly -NoTunnel` remains a provider-independent maintenance path used by the release updater to install npm dependencies/build after an update.

## Internal implementation

- `launcher/DevRelayLauncher.cs`: thin Windows EXE launcher with the DevRelay taskbar identity.
- `scripts/Build-DevRelayLauncher.ps1`: builds the root `DevRelay.exe`.
- `gui/Bootstrap-DevRelayGui.ps1`: release update, setup-state check, first-run wizard handoff, normal GUI launch.
- `gui/setup/setup-state.mjs`: setup schema, legacy migration, labels, persistence.
- `gui/setup/setup-wizard.mjs`: setup-only local controller on port 7319.
- `gui/setup/public/`: setup wizard web UI.
- `gui/devrelay-gui.mjs`: normal GUI controller and runtime owner.
- `gui/public/`: main log/settings UI.
- `gui/electron-host.cjs`: shared hardened Electron native window host for the main GUI and setup wizard.
- `gui/open-external.mjs`: opens validated web links through the platform's default browser.
- `gui/setup/provider-actions.mjs`: Node provider setup and CLI orchestration for Linux.
- `scripts/DevRelay-SetupActions.ps1`: Windows setup actions, including Windows-only installation and DPAPI operations.
- `scripts/DevRelay-ProviderTools.ps1`: provider executable download/discovery and DPAPI helpers.
- `gui/linux-runtime.mjs`: Node runtime supervisor for Linux.
- `scripts/DevRelay-Launcher.ps1`: Windows non-interactive runtime supervisor.
- `scripts/Update-DevRelayFromRelease.ps1`: safe release-only updater.

Mutable state remains under `internal/.devrelay/` and is excluded from Git.
