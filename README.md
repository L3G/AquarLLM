# AquarLLM 🏛️

> Your AI coding agents as a **living isometric pixel city**.

Every working agent — a Claude Code session, a subagent, a Codex / Grok / local LLM —
becomes a **uniquely-dressed pixel citizen** in a shared city. Each repo/folder is a
**building**; what an agent is doing right now sends its citizen to a workspace (desk,
terminal, bookshelf, map table, whiteboard, help desk, bed) with a speech bubble of the
current file or command. Idle instances sleep; closed folders go **dormant** (never
vanish); citizens **commute** to shared git/build yards along the streets. Five
re-skinnable worlds, a live **activity feed**, and a **legend** round it out.

## Easiest way: the desktop app

A menu-bar / tray app that runs everything (server + presence + the city window) and
auto-installs the Claude Code hooks. Cross-platform (macOS / Windows / Linux).

```bash
bun install
bun run app          # build + launch the Electron app
bun run app:dist     # build a distributable (.dmg/.zip on mac, etc.) → app/release/
```

Launch it and a 🏛️ icon appears in your menu bar — open the city window, and any Claude
Code instance you run shows up as a citizen. Auto-detection of idle/open instances works
on macOS & Linux; Windows falls back to hook-driven presence. (An unsigned local build
may need right-click → Open the first time.)

## How it works

```
 Claude Code session ─(http hook)──┐
 Codex / Grok / local LLM ─(POST)──┤→  server (ingest + world state) ─ws→  the city
 Hypnos presence ─────────────────┘   (Bun standalone, or embedded in the app)
```

- **Agora** (`client/`) — the canvas "Living City" renderer (`src/city.ts`), fed live
  over a WebSocket; plus the activity feed + legend.
- **Hermes** (`server/`) — Bun HTTP + WebSocket hub: `/ingest`, `/ingest/claude-hook`,
  `/ingest/presence`, `/ws`. The desktop app embeds an equivalent **Node** server
  (`app/src/server.ts`) so it needs no Bun at runtime.
- **Hypnos** — zero-touch presence: detects open Claude Code instances and shows them
  asleep. Bun (`adapters/presence/`) for dev; cross-platform Node (`app/src/hypnos.ts`)
  in the app.
- **Iris** (`adapters/claude-code/`) — Claude Code hook config; the app installs
  equivalent `http` hooks automatically. Other agents POST canonical events to `/ingest`.
- **Logos** (`shared/`) — the canonical event + log schema shared by everything.
- **Eidolon** (`sim/`) — phantom-agent simulator for demos.

## Dev workflow (without the app)

```bash
bun install
bun run server     # Hermes on :8787
bun run client     # Agora dev server (Vite :5173)
bun run presence   # Hypnos — your open instances appear asleep
bun run sim        # optional: phantom agents
```

Open the Vite URL. To stream real Claude sessions in dev, merge
`adapters/claude-code/hooks.settings.json` into `~/.claude/settings.json`.

See [`progress.md`](./progress.md) for the full build history.
