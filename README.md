# Codex IM Gateway

> Keep an eye on Codex Desktop from Telegram, get notified when a turn finishes,
> and continue the exact same conversation from your phone.

[![CI](https://github.com/qiyuey/codex-im-gateway/actions/workflows/ci.yml/badge.svg)](https://github.com/qiyuey/codex-im-gateway/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/Node.js-26%2B-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-11%2B-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Codex IM Gateway is a local-first Codex plugin that connects Codex Desktop and
Scheduled tasks to instant-messaging platforms. The first adapter targets
Telegram; Slack, Discord, Feishu, and generic webhooks are planned.

The project is currently **pre-alpha**. The Telegram workflow is usable, but the
installation still runs from a source checkout.

## ✨ Why Codex IM Gateway

### Follow Desktop tasks from anywhere

- Receive a Telegram notification when a Codex Desktop or Scheduled turn
  completes, fails, or becomes blocked.
- Browse recent Codex threads from allowed workspaces with `/threads`.
- Switch to a thread with `/use` and continue it without opening the desktop app.

### Resume the right conversation

- Replies are routed through a durable Telegram-message-to-Codex-thread binding.
- A reply never silently falls back to an unrelated active thread.
- Multiple tasks and workspaces remain isolated from one another.

### Local-first and durable

- The daemon opens no public listener; Telegram uses long polling.
- A local SQLite inbox provides retryable, idempotent completion delivery.
- The bundled `Stop` hook only writes a local event and never performs network
  delivery inline.
- Private-chat allowlists, workspace allowlists, and a persistent kill switch
  limit remote execution.

## 📦 Install from source

### Requirements

- Node.js 26 or later
- pnpm 11 or later
- An installed and authenticated Codex Desktop/CLI compatible with the checked-in
  protocol snapshot
- A Telegram bot created with [BotFather](https://t.me/BotFather)

### Build and configure

```bash
git clone https://github.com/qiyuey/codex-im-gateway.git
cd codex-im-gateway
pnpm install --frozen-lockfile
pnpm check
cp .env.example .env
```

Edit `.env` locally and set:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_ALLOWED_USER_ID`
- `TELEGRAM_ALLOWED_CHAT_ID`
- `CODEX_IM_GATEWAY_ALLOWED_WORKSPACES`

Never commit `.env`. Multiple workspace roots use the operating system path
delimiter (`:` on macOS/Linux and `;` on Windows).

Install the checkout as a local Codex plugin, then review and trust its bundled
`Stop` hook once in Codex. Start a new Codex task so the hook, skill, and MCP
server are loaded. See the [operations guide](docs/operations.md) for the full
deployment workflow.

Start the foreground daemon:

```bash
pnpm start
```

## 💬 Telegram commands

| Command | Action |
| --- | --- |
| `/threads` | List recent threads in allowed workspaces |
| `/use <id-prefix>` | Select one unambiguous thread |
| `/current` | Show the selected thread |
| `/new` | Create a thread in the first allowed workspace |
| `/detach` | Clear the current context binding |
| `/stop` | Interrupt the active turn and cancel queued follow-ups |

Plain messages use the active thread. Replies always use the binding of the
replied-to Telegram message. The daemon registers these commands in Telegram's
menu at startup.

## 🧰 Operations

```bash
node dist/cli.js health
node dist/cli.js app-server-health
node dist/cli.js events --state queued
node dist/cli.js events --state dead_letter
node dist/cli.js recover
node dist/cli.js disable
node dist/cli.js enable
```

`disable` is the emergency kill switch for inbound IM execution. Runtime state
is stored by default in `~/.local/share/codex-im-gateway/gateway.sqlite`.

## 🏗️ How it works

1. Codex invokes the plugin's turn-scoped `Stop` hook.
2. The hook durably enqueues a local completion event.
3. The daemon delivers the result to Telegram and stores the message binding.
4. A Telegram reply resumes the bound Codex thread through `codex app-server`.

Codex remains the source of truth for threads and turns. Internal Codex SQLite
files and transcript formats are not treated as APIs.

## 🧪 Development

```bash
pnpm install
pnpm check
pnpm build
```

`pnpm check` runs formatting, type checking, unit tests, the production build,
distribution smoke tests, and plugin validation. The checked-in app-server
bindings were generated from `codex-cli 0.145.0-alpha.4`; regenerate them
intentionally with `pnpm protocol:generate` when upgrading the protocol.

## ❓ FAQ

**Does it stream live token-by-token progress to Telegram?**  
Not yet. The first release lists threads, sends turn-completion notifications,
and lets you continue the exact conversation.

**Can another Telegram user control my Codex tasks?**  
Not with the intended configuration. The adapter accepts only the configured
private user and chat, rejects forwarded contexts, and checks workspace roots.

**Does removing the gateway delete Codex conversations?**  
No. Codex owns the threads; the gateway stores only queue, delivery, and binding
state.

## 📚 Documentation

- [Implementation plan](PLAN.md)
- [Architecture](docs/architecture.md)
- [Operations](docs/operations.md)
- [Threat model](docs/threat-model.md)
- [Plugin packaging ADR](docs/adr/0001-codex-plugin-packaging.md)
- [Security policy](SECURITY.md)

## 📞 Support & feedback

- [Report a bug](https://github.com/qiyuey/codex-im-gateway/issues/new?template=bug_report.yml)
- [Request a feature](https://github.com/qiyuey/codex-im-gateway/issues/new?template=feature_request.yml)

## 🤝 Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening
a pull request.

## 📄 License

MIT License — see [LICENSE](LICENSE).
