# AquarLLM — progress

A live **isometric pixel world** visualizing every running AI agent (Claude Code,
subagents, Codex, Grok, local LLMs). Each agent is a pixel character that walks a tile
grid to task-districts based on what it's doing. Full design:
`~/.claude/plans/enchanted-jingling-hartmanis.md`.

## Components (Greek-themed)

| Name | Folder | Role |
|---|---|---|
| **Logos** | `shared/` | canonical `AgentEvent` schema + activity→district maps + WS message types |
| **Hermes** | `server/` | Bun HTTP ingest + world reducer + WebSocket broadcast |
| **Agora** | `client/` | Vite + PixiJS isometric renderer (grid, characters, pathfinding) |
| **Eidolon** | `sim/` | simulator posting phantom agent events |
| **Iris** | `adapters/claude-code/` | Claude Code hook config + generic ingest contract |

## Phases

- [x] **0. Repo seed** — git init, remote `origin` (L3G/AquarLLM), README, .gitignore.
- [x] **1. Scaffold + Logos** — bun workspace, `shared/logos.ts`, README, this file.
- [x] **2. Hermes** — `/ingest` + `/ingest/claude-hook`, world reducer, WS broadcast. Verified via curl + WS.
- [x] **3. Eidolon** — believable simulated event stream. Verified (varied kinds/districts/subagents).
- [x] **4. Agora** — iso tilemap, billboard characters, easystar A* nav, bubbles, camera. Verified via headless screenshot.
- [x] **5. Iris** — hooks.settings.json + iris.sh + docs. Verified full hook lifecycle (incl. subagents) via Hermes.
- [~] **6. Polish** — DONE: kind palettes, subagent companions, error flash, idle states, project in legend, dispersed-on-connect spawn.
  DEFERRED (follow-ups): Kenney CC0 art pass (still placeholder Graphics), camera-follow / click-to-focus, theme re-skin.

## v1.1 — dynamic project-neighborhood town

The world is no longer a fixed 9-district grid. Each distinct **project (folder)** gets
its own plot, allocated on a spiral that grows outward from centre; a plot fades in when
the first agent works there and fades out ~8s after the last leaves — so the town
**grows and shrinks** with activity. Within a plot, agents stand at an activity-specific
spot (a loose 3×3), so you read *project* + *what they're doing* together. Plot colour is
hashed from the project name; the signpost shows a live agent count (`·N`). Camera
**auto-fits** the whole town as it grows/shrinks (press **F** to re-engage fit after
manual pan/zoom). All client-side: `client/src/map.ts` (the `Town` class) + targeting in
`main.ts`; `iso.ts` grid widened to 50. Server unchanged (already sends `project`).
Real Claude characters are now labelled by their **folder** (`normalize.ts`).

## v1.2 — sleeping instances

Open-but-idle instances now persist (Hermes reap extended to 6h via `REAP_AFTER_MS`;
`SessionEnd` removes them on close) and **sleep in a bed** with Zzz when idle
(`character.ts`), so the town reflects everything you have open, not just what's
actively working. Caveat: an already-running instance first appears on its *next* event
after the hooks loaded — interact with it once and it then stays (sleeping) until closed.
A zero-touch presence sidecar (detect open sessions and pre-seed them asleep) is a
possible follow-up.

## v1.3 — Hypnos zero-touch presence

`adapters/presence/hypnos.ts` (run: `bun run presence`) makes **every open instance
appear with no interaction**: it lists running `claude` processes, gets each one's cwd
via `lsof`, and recovers its `session_id` from the newest transcript in
`~/.claude/projects/<sanitised-cwd>/`. It heartbeats Hermes' new `/ingest/presence`
endpoint (`world.presence`), which creates a *sleeping* avatar for unknown sessions and
keeps known ones alive **without overriding** their hook-driven activity. Keyed on the
real `session_id`, the sleeper and the live (hook) avatar are the same character — no
duplicates; when the process exits, the avatar is removed. macOS-only (`ps`/`lsof`),
read-only. Camera now snaps out to always frame the whole town.

## Status: working v1 ✅

All components run together: `bun run server` + `bun run client` + `bun run presence`
(+ `bun run sim` for demo phantoms).
Headless Chrome screenshot confirmed the town renders with live agents in their
districts. Real Claude sessions stream in once `adapters/claude-code/hooks.settings.json`
is merged into `~/.claude/settings.json` (Hermes must be running).

## Key decisions

- **Runtime:** Bun 1.2 (server + sim run TS directly), Node 24 also present.
- **Client:** Vite + TS + **PixiJS v8**, **easystarjs** for A* on the tile grid.
- **Avatars:** billboarded (camera-facing) pixel sprites on an iso floor — avoids
  8-direction iso animation. Walk = position-lerp along path + bob.
- **Authority:** Hermes owns *intent* (which agent, which district, bubble); Agora owns
  *motion* (pathfinding + animation). Server broadcasts full snapshots; client diffs by id.
- **Ports:** Hermes HTTP+WS on **:8787**. Agora on Vite default (:5173).
- **Theme:** default classical *polis* skin (open to re-skin; art-only).

## Open choices (defaults taken; revisit any time)

1. World theme skin (default: polis). 2. Whether the human gets an avatar (default: no).
3. Renderer (default: PixiJS).

## Notes for future agents

- `shared` is the source of truth; server/client/sim import `@aquarllm/shared`.
- Keep the wire protocol tiny — push intent, not per-frame positions.
- Obsidian project notes live under `Projects/AquarLLM/` in the vault.
