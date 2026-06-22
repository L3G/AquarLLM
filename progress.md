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
| **Agora** | `client/` | Vite + canvas "Living City" renderer (`city.ts`); 5 worlds, citizens, HUD |
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
via `lsof`, and recovers session_ids from the project dir's transcripts. Multiple
instances can share a folder, so per folder it presences the **N newest transcripts**
where N = live *terminal* `claude` processes there (VS Code native-binary helpers
collapse to one session) — so e.g. 5 instances open on one repo each get an avatar.
Agents jitter within their plot so co-located sleepers don't stack. It heartbeats
Hermes' new `/ingest/presence`
endpoint (`world.presence`), which creates a *sleeping* avatar for unknown sessions and
keeps known ones alive **without overriding** their hook-driven activity. Keyed on the
real `session_id`, the sleeper and the live (hook) avatar are the same character — no
duplicates; when the process exits, the avatar is removed. macOS-only (`ps`/`lsof`),
read-only. Camera now snaps out to always frame the whole town.

## v2 — The Living City (Claude Design)

Agora's renderer was **replaced** with the Claude Design "Living City" — a high-fidelity
procedural pixel-art isometric city (kept as raw 2D canvas per the design handoff, not
PixiJS; PixiJS + easystar deps removed). The engine lives in `client/src/city.ts`
(`LivingCity` class, ported verbatim from the design's `Component`), with the auto-sim
swapped for the real feed via `syncAgents()`: each folder → a colour-coded **block** that
grows/fades with `life`, each agent → a pixel **citizen** that walks to an activity
workspace (desk/terminal/bookshelf/map-table/whiteboard/help-desk/bed), talks (real
file/command in the bubble), and sleeps in a bed when idle. Connected land + streets,
per-world roofs/signatures, an on-canvas HUD, and 5 re-skinnable worlds (Harbor / Cyber /
Orbital / Isles / Silicon — switch via the top-left buttons). Camera auto-fits; trackpad
pan/pinch + `+/-`/`F` carried over. Identity is stable (block by folder, citizen by
agentId) so walk/animation state persists across snapshots.

Bugfix during port: clamp frame `dt` to ≥0 (`Math.max(0, …)`) — a negative dt drove the
`life` easing negative so nothing drew. `client/src/{main.ts,index.html}` rewired to the
canvas; old PixiJS modules (`iso/map/character/pathfind/ui`) deleted.

## v2.1 — activity feed + legend

Hermes keeps a ring-buffered **activity log** (`world.ts` logBuf; `record()` in `index.ts`
appends a `LogEntry` on each meaningful action — activity or detail change — and pushes a
`{type:"log"}` WS message; full history is sent on connect). Agora shows it in a left
**ACTIVITY** panel (`client/src/activitylog.ts`) — timestamped, faction-dotted, colour-coded
lines (real file/command in `detail`) — with a **legend** footer mapping each activity to
its colour + workspace and each agent kind to its colour. Toggle with the header button or
**L**; the city reserves a left gutter (`city.setLeftGutter`) so it re-centres between the
feed and the right HUD. New `LogEntry`/`LogMessage` types in `shared/logos.ts`.

## v2.2 — Living City design refresh (Claude Design v2 handoff)

Re-ported `client/src/city.ts` to the updated design: buildings **go dormant** (dimmed,
never deleted) when a folder's instances all close, and reappear when work returns;
persistent **git-yard / build-yard** civic blocks downtown with **street-routed
commuting** (`gridPath` + front-corner waypoints, drawn in a separate world-space pass);
**uniquely-dressed citizens** (random head/hair/skin/shirt/hat — faction is only the foot
dot); **smaller 0.66 footprints** so paved lanes show, occupied cells paved + park/beach
cells, **beach + foam ring** on island worlds; per-room **material floor + rug + corner
prop** (`decorKind`), **doorways** cut into walls, project-tinted roofs (no windows/
chimneys). Real-data wiring keeps stable per-agent cosmetics (by agentId), maps idle
folders to `goDormant()` (kept, not removed), and lets the ambient commute yield to the
real activity when it returns. dt clamp + left-gutter + trackpad controls retained.

## v3 — desktop app (Electron, cross-platform)

`app/` packages everything into a menu-bar/tray Electron app so non-devs can run it.
One **embedded Node server** (`app/src/server.ts`, a port of Hermes using `http` + `ws`,
reusing `server/world.ts` + `normalize.ts`) serves the built city AND ingests events on
`:8787`. **Hypnos** is re-ported to cross-platform Node (`app/src/hypnos.ts`: macOS
`ps`/`lsof`, Linux `/proc/<pid>/cwd`, Windows → hooks-only). The **hooks installer**
(`app/src/hooks.ts`) merges cross-platform `type:"http"` hooks into `~/.claude/
settings.json` (recognises + replaces the older curl hooks; non-destructive, backed up).
`app/src/main.ts` is the Electron main: single-instance, runs server+hypnos in-process,
tray menu (live count / open window / hooks toggle / quit), window loads the city, hooks
auto-installed on first run. `app/build.mjs` bundles main+standalone via esbuild and
generates the tray/app PNG icons (hand-rolled PNG encoder, no image deps). electron-
builder config builds mac/win/linux. The client's WS URL is now same-origin (works in
both Vite dev and the app). Run: `bun run app`; package: `bun run app:dist`.

Verified: embedded Node server serves the city + presence (headless screenshot); the
dev Electron run and the packaged `AquarLLM.app` both boot, serve `:8787`, detect open
instances, and render. Build artifacts (`app/release/`, `app/dist/`, `app/assets/`) are
gitignored.

## v3.1 — Grok support

The Grok CLI has a Claude-compatible hooks system with **global, always-trusted** files
(`~/.grok/hooks/*.json`) and `type:"http"` support, plus a `~/.grok/active_sessions.json`
presence file. So:
- **Grok hooks** (`server/normalize-grok.ts` + `/ingest/grok-hook` on both servers): grok
  POSTs its event envelope (`hookEventName`/`sessionId`/`cwd`/`toolName`/`toolInput`),
  normalized to canonical events (grok tool names → activities). The app installs
  `~/.grok/hooks/aquarllm.json` automatically when `~/.grok` exists (tray toggle).
- **Grok presence** (Hypnos): reads `~/.grok/active_sessions.json` so open-but-idle grok
  sessions appear asleep — works on every platform (just a file read). `world.presence`
  now takes an `AgentKind`.
- Dev reference: `adapters/grok/` (hooks.json + README).

Verified: grok-hook endpoint maps a session to `LiberLM → running: cargo test`; presence
shows the open `peitho` grok session idle.

## v3.2 — performance

The v2 scene is draw-heavy and felt laggy in the app. Fixes (`client/src/city.ts` +
`app/src/main.ts`): cap the render loop to **30fps** (ambient scene; halves cost),
**cache `computeLand`** (beach/park structure) so it isn't rebuilt every frame, make the
loop **crash-resilient** (schedule the next frame first; a caught error no longer stops
the loop — that stop/watchdog-restart cycle read as stutter), and set Electron
`backgroundThrottling: false` so the menu-bar window stays smooth when unfocused.

Then for the **many-agents** case (still laggy with lots running): cache the **static
background** (water gradient / glow / grid / water-pool) to an offscreen canvas and blit
it each frame, drawing only the cheap animated overlay (waves/boats/gulls/twinkle) live
(`ensureStaticBg`/`drawStaticBg`/`drawAnimatedBg`); **coalesce server snapshot broadcasts
+ batch log events** to ~12.5Hz (`app/src/server.ts`) so a burst of activity doesn't
flood the renderer; and **batch activity-feed DOM** inserts via a DocumentFragment.
Measured: 9 agents went from ~47% → and **56 agents now run at ~11%** renderer CPU.

## Status: working v3 ✅ — desktop app

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
