# Development guide

## Commands

```powershell
npm install
npm run check
npm run build
npm test
```

Tests use Node's built-in `node:test`; there is no separate test framework. TypeScript is compiled before tests run.

## Layout

```text
src/main.ts             CLI and lifecycle
src/http-server.ts      Streamable HTTP adapter
src/mcp-server.ts       MCP tool schemas and handlers
src/diagnostics.ts      MCP request diagnostics and heartbeat
src/process-manager.ts  child-process lifecycle and registry
src/output-buffer.ts    rolling cursor-based output storage
src/version.ts          package-version loader
src/types.ts            shared process types
test/                   Node test runner tests
docs/                   design and usage documentation
```

## Dependency policy

Runtime dependencies should remain minimal. Prefer Node.js standard-library APIs whenever they provide the required behavior. Protocol behavior should stay delegated to the official MCP SDK instead of being reimplemented locally.

A new dependency should provide a capability that would otherwise require substantial platform-specific code or protocol code. Convenience-only packages such as CLI parsers, logging frameworks, utility libraries, and test frameworks are intentionally avoided.

## Restarting the visible GUI

When DevRelay changes itself while the Windows GUI is running, hand restart off to a detached helper instead of trying to stop the current MCP process tree in-place:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\scripts\Restart-DevRelayGui.ps1
```

The script returns after scheduling the restart. It then closes the current GUI host outside the DevRelay process tree, waits for the controller to exit, and starts the normal no-argument GUI launcher again. Use `-DryRun` to validate discovery without restarting.

## Adding a tool

Before adding an MCP tool, check whether the same operation can be expressed reliably as a command through `exec` or `process_start`. The MCP surface should remain as small as practical: prefer composing generic process primitives over adding convenience or domain-specific wrappers.

A first-class tool is justified only when it provides a genuinely new primitive that command composition cannot represent cleanly, or when it materially improves model/tool semantics without duplicating a normal CLI. Tool-count growth has an ongoing schema, selection, compatibility, testing, and documentation cost.

## Tests

The suite covers process primitives, transports, encoding behavior, diagnostics, launcher/setup behavior, updater behavior, and security-sensitive regressions. MCP schema registration is additionally smoke-tested with the official MCP Inspector CLI.

Changes to process, transport, encoding, launcher, updater, or security-sensitive behavior should include a focused regression test when practical.

## Release checklist

1. Update the version in `package.json` and `package-lock.json`, then update `CHANGELOG.md`.
2. Run `npm run check` and `npm test` from `internal/`.
3. Run the stdio Inspector `tools/list` smoke test and the HTTP Inspector smoke test.
4. Rebuild `DevRelay.exe` and verify its FileVersion/ProductVersion match the package version.
5. Run `scripts/DevRelay-Launcher.ps1 -SetupOnly -NoTunnel` against the release checkout.
6. Run `git diff --check` / `git diff --cached --check` before commit and release.
7. Publish only a full GitHub Release for the intended update channel, attach the rebuilt `DevRelay.exe`, and attach its SHA-256 checksum.

Runtime/CLI version reporting reads the package version automatically.
