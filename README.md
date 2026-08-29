# AquarLLM 🏛️

> Your AI coding agents as a **living isometric pixel town**.

Every working agent — a Claude Code session, a subagent, a Codex / Grok / local LLM —
becomes a **uniquely-dressed pixel citizen**. Each **git repo is a village**: its houses
are the repo's top-level folders, and the village's *size* is its history (commits, age,
contributors, files) — a scratch folder is a Hamlet, a monorepo a Metropolis. Agents
wander the village they're working in, carrying a speech bubble of the current file or
command; idle instances sleep, closed folders go **dormant** (never vanish). Roads link
the villages, resident NPCs live in them, and **trade caravans** haul surplus between
them. Hover anything for a plaque telling you what it is.

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
 Codex / Grok / local LLM ─(POST)──┤→  server (ingest + world state) ─ws→  the town
 Hypnos presence ─────────────────┘   (Bun standalone, or embedded in the app)
```

- **Agora** (`client/`) — the canvas renderer (`src/city.ts`), fed live over a WebSocket;
  plus the activity feed + legend.
- **Hermes** (`server/`) — Bun HTTP + WebSocket hub: `/ingest`, `/ingest/claude-hook`,
  `/ingest/presence`, `/ws`. The desktop app embeds an equivalent **Node** server
  (`app/src/server.ts`) so it needs no Bun at runtime.
- **Clio** (`server/clio.ts`) — the muse of history: an async, cached git inspector. Maps
  each agent's `cwd` to its repo and measures commits / age / contributors / files / top-level
  folders, which is what sizes a village and names its houses. Never blocks the hook path.
- **Hypnos** — zero-touch presence: detects open Claude Code instances and shows them
  asleep. Bun (`adapters/presence/`) for dev; cross-platform Node (`app/src/hypnos.ts`)
  in the app.
- **Iris** (`adapters/claude-code/`) — Claude Code hook config; the app installs
  equivalent `http` hooks automatically. Other agents POST canonical events to `/ingest`.
- **Logos** (`shared/`) — the canonical event + log schema shared by everything.
- **Eidolon** (`sim/`) — phantom-agent simulator for demos.

## What you'll see

- **Villages = repos.** A palisade border and a banner naming the repo, its tier
  (Hamlet → Metropolis), agent count and git stats. Houses are the repo's real top-level
  folders — hover one to read `app/ — part of AquarLLM · Town`.
- **Citizens = agents.** One villager per live agent, with an activity glyph and speech
  bubble. Lit windows and chimney smoke mean the repo has agents actually working.
- **Ploutos, the economy.** Activity mints resources into the village stockpile —
  read→lore, edit→timber, run→iron, search→spice, think/commit→grain. Surplus villages
  send **trade caravans** to villages in deficit.
- **Time of day.** Day / Dusk / Night re-light the world (sky, stars, moon, lantern glow).

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

> Note: a `city.ts` change needs a **full page reload** — Vite HMR does not re-instantiate
> the running renderer, so an open tab can show stale rendering.

See [`progress.md`](./progress.md) for the full build history.
