# AquarLLM 🏛️

> A living **isometric pixel world** for AI agents.

Every working agent — a Claude Code session, a subagent, a Codex session, a Grok
session, or a private/local LLM — gets a **pixel-art character** in a shared
isometric town. What each agent is actually doing right now drives its avatar: the
character **walks across the tile grid** to a task-district — the **Library** for
reading code, the **Workshop** for editing, the **Terminal** for shell commands, the
**Gateway** for web search, the **Help Desk** when waiting on you, the **Stoa** when
idle — with a speech-bubble showing the current file or command. Subagents appear as
little companion characters.

## Status

🌱 **In active development.** See [`progress.md`](./progress.md) for the current state.

## How it works

```
 Claude Code session ─(async http hook)─┐
 Codex / Grok / local LLM ─(POST)────────┤→  Hermes (Bun server)  →ws→  Agora (browser)
 Eidolon simulator ─(POST)───────────────┘   ingest + world state        isometric town
```

- **Hermes** (`server/`) — Bun HTTP + WebSocket hub. Ingests events, owns world state,
  broadcasts snapshots.
- **Agora** (`client/`) — Vite + PixiJS isometric renderer. Characters pathfind across
  the grid to districts based on activity.
- **Iris** (`adapters/claude-code/`) — Claude Code hook config that streams a real
  session's activity to Hermes; also documents the generic ingest contract for other agents.
- **Logos** (`shared/`) — the canonical event schema shared by every component.
- **Eidolon** (`sim/`) — a simulator of phantom agents so the town is lively before any
  real agent is wired.

## Quick start

```bash
bun install
bun run server     # Hermes on :8787 (HTTP ingest + WS)
bun run client     # Agora dev server (Vite)
bun run sim        # Eidolon — phantom agents to watch
```

Then open the Vite URL and watch the town come alive. To stream a real Claude Code
session, follow `adapters/claude-code/README.md`.
