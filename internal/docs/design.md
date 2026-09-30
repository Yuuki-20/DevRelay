# Design decisions and non-goals

## Thin remote CLI, not remote IDE

DevRelay exposes generic process primitives instead of dozens of domain tools. Git, ripgrep, npm, Python, Docker, browser automation CLIs, and similar capabilities remain ordinary commands.

The intent is to bring the MCP client to the development environment, not to recreate the development environment inside the MCP server. Existing tools remain the source of capability; DevRelay provides the execution path.

## Minimum tool surface

DevRelay intentionally keeps its MCP surface small. The goal is not to minimize the tool count for its own sake, but to expose the smallest set of generic primitives that can compose into the required workflows.

The current six-tool surface is expected to remain sufficient unless a genuinely new primitive is identified. One-shot execution uses `exec`. Long-running and interactive work uses `process_start`, `process_read`, `process_write`, and `process_stop`; `process_list` provides discovery. PTY support and image return extend those existing primitives instead of creating separate domain tools.

A new MCP tool should represent a capability that cannot be expressed cleanly through the existing process interface. A shorter or more convenient wrapper around Git, filesystems, package managers, Docker, search, or another existing CLI is not sufficient justification.

## PTY only where pipes are insufficient

Pipe-based children remain the default because they are simpler and cover most compilers, scripts, dev servers, and line-oriented programs.

`process_start(terminal: true)` switches that one session to PTY/ConPTY for terminal-owning applications such as Codex CLI and TUIs. Multiple PTY and pipe sessions may coexist. `node-pty` is the only native process dependency added for this exception.

## Images are transport output, not a filesystem API

DevRelay does not add image browsing or file-management tools. A command can create or locate an image, then `exec.images` or `process_read.images` returns that file as MCP image content. This fills the one gap where stdout alone cannot convey pixels to the MCP client.

## Managed MCP sessions are not persistent

DevRelay does not attempt to recover or reattach MCP-managed process sessions after its own restart. Making those sessions durable would turn the project into a persistent process supervisor and require recovery semantics that are intentionally out of scope.

This does not mean DevRelay is stateless. Machine-local settings, setup state, credentials, logs, diagnostics, window state, and launcher recovery metadata are persisted under `.devrelay` where needed for human control, security, and postmortem diagnosis.

## GUI is the human control and observation surface

The Windows launcher GUI exists for the human operator. It makes remote command access visible and provides explicit controls for setup, authorization, lifecycle, settings, and diagnostics.

The MCP/process interface is the machine-facing execution path; the GUI is the human-facing control and observation surface. DevRelay keeps those responsibilities separate. The GUI is not the execution API and is not a remote-desktop interface.

DevRelay intentionally does not expose mouse, keyboard, window-focus, screenshot, or arbitrary desktop-control MCP tools. Browser automation and screenshot generation should use existing CLIs where practical.

## No agent loop

DevRelay executes requested operations but does not decide what work to perform. The MCP client supplies reasoning and orchestration; DevRelay remains the hands.

## Dependency budget

Node standard-library facilities are preferred. The MCP SDK and Zod handle protocol/schema work; `node-pty` is accepted specifically for real PTY/ConPTY sessions. Database, HTTP-framework, CLI-framework, and general GUI-automation dependencies remain out of scope.
