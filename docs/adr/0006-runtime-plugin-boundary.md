# ADR 0006: Separate the supervised runtime from the Codex plugin control plane

- Status: accepted
- Date: 2026-07-17

## Context

Codex plugins can bundle skills, lifecycle hooks, and stdio MCP servers. A plugin-provided MCP
server is hosted by a Codex process, but it is not a machine-wide singleton and its lifetime ends
with that host. The gateway must keep exactly one Telegram long-polling consumer alive across Codex
Desktop, CLI, and Scheduled task lifecycles.

The original repository was simultaneously the plugin root, daemon installation, configuration
directory, and development checkout. Its MCP health tool inspected SQLite but could report success
when the daemon was stopped. The hook, MCP producer, and daemon also shared an implicit database
contract with no producer or protocol version.

## Decision

Treat the project as one versioned product with two deployable units:

- the Codex plugin is the control plane: a fast local `Stop` hook, a small stdio MCP server, and
  focused skills;
- the supervised runtime is the data plane: the single network sender, Codex app-server client,
  durable dispatcher, router, and IM adapters.

The plugin never starts Telegram polling. The runtime is supervised by the operating system. The
repository build creates separate minimal plugin and runtime artifacts while preserving the root
plugin layout for local marketplace development.

Every durable ingress record carries a producer, producer version, and protocol version. The
runtime rejects unsupported protocol versions without reading Codex or sending network traffic.
Runtime health is based on an atomic owner-only heartbeat plus process liveness, not database access
alone. Daemon startup also acquires an owner-only single-instance lock.

The application lifecycle owns ordered startup, dispatcher draining, graceful shutdown, heartbeat,
database closure, and lock release. CLI service management creates a supervised launchd unit on
macOS; foreground execution remains available for development.

## Consequences

- Multiple Codex hosts may safely load the plugin without creating multiple Telegram pollers.
- A stopped or stale daemon produces `degraded` health instead of a false `ok` result.
- Plugin and runtime releases can be diagnosed and evolved through an explicit ingress protocol.
- Plugin installation cannot silently install a system service; local service setup remains an
  explicit user-authorized CLI operation.
- The source repository remains a modular monolith. Package splitting is deferred until independent
  publishing requires it.
