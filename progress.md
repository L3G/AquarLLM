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

## v3.3 — townsfolk (ambient NPCs)

The city felt empty when few agents were running. Added **ambient NPCs** (`client/src/city.ts`)
that live in the *commons* — the park infill + beach ring — while the real coding agents
work inside their named buildings. They're purely client-side and decoupled from the feed:
**no name tag, no faction dot, no activity glyph, never counted in the HUD/feed**, so they
read clearly as background townspeople, not agents. Each ambles between random walkable
tiles and, on arrival, does a little leisure **task** — stroll, gaze (at the sea), rest,
fish (beach only), or chat — with the occasional friendly speech bubble ("the sea…",
"any fish?", "hello!"). Reuse the existing pixel-person sprite + `speech()`; drawn slightly
smaller (0.9×) and added to the same depth-sorted list so they occlude correctly with
buildings. Count **scales with open land** (`round(walkable * 0.5)`, clamped 3–18) and the
walkable set is cached against the land signature. Cost is negligible — 10 agents + NPCs
measured **5.7%** renderer CPU. Key methods: `ensureNPCs`/`spawnNPC`/`npcPickTarget`/
`updateNPCs`/`drawNPC` + `worldToCell`/`npcWalkable`.

## v3.4 — multi-story buildings, parks & things to do

Richened the world (`client/src/city.ts`):
- **Multi-story buildings.** Each project gets a stable `floors` count (1–3 by name hash);
  walls rise `fh * floors` with **lit window grids per floor** (`faceWindows`, bilinear-mapped
  onto each visible wall face, some dark/flickering) and per-floor divider lines. Door height
  is now fixed to one storey. Civic yards stay single-storey.
- **A green park belt.** The auto-layout packed towns solid, so parks (and their props) almost
  never had a place. `computeLand` now makes **every empty cell touching the cluster** parkland —
  a grass belt wraps the town (and fills interior holes), beach beyond.
- **Points of interest.** `computeLand` assigns stable POIs to commons tiles (`drawPOI`): parks
  get trees, lamps, **benches, fountains** (animated jets), **flower gardens, statues, cafés**;
  the beach gets **umbrellas, sandcastles, cafés**.
- **Stuff to do.** NPCs now bias toward POI tiles (~50%) and, on arrival, perform the matching
  task with themed speech: bench→rest, fountain→"make a wish", café→"one coffee", garden→tend,
  statue→admire, umbrella→relax (plus the existing stroll/gaze/fish/chat). `npcDestTask` maps
  POI→task; POI tiles cached alongside the walkable set.

Cost stayed cheap: 10 agents + parks + NPCs + POIs measured **~10% renderer CPU**.

## v3.5 — Cozy Houses + time of day (Claude Design handoff)

Ported the **"Cozy Houses"** art direction (`AquarLLM - Cozy Houses.dc.html`) into
`client/src/city.ts`, wired to the live feed like every prior handoff. The two cozy worlds
(**Harbor**, **Isles** — `style:"cozy"`) now render the design's **freestanding gable
cottages**; the dark worlds (Cyber/Orbital/Silicon) keep their sci-fi dollhouse boxes.

**Freestanding cottages (not dollhouses).** First attempt only re-skinned the existing
*dollhouse* (open-front room) with a back-peaked roof — that's NOT the design, which has
**closed cottages with citizens standing in the yard**. So cozy non-civic projects now take
a separate path: `drawParcel` early-returns to **`drawCozyParcel`**, which draws the design's
**`drawCottage`** — a whole gable house (plinth, timber walls, **door + two cross-frame
windows with flower boxes** on the gable end, shingled roof + ridge, **chimney + smoke**,
plus **dormer / porch** variants picked by the project-name hash). Ported verbatim from the
design with its own iso projector (`Ucozy`/`mkPCozy`) + helpers (`drawChimneyCozy`,
`drawDormerCozy`, `drawSmoke`, `line`) and palette (`cozyPal`/`cozyWalls`/`cozyRoofs`).
- **Yard + village.** Each cottage sits on a **grass plot** (cozy occupied cells are grassed,
  not paved — `drawGround`) with **tree, hedge, flower-bed, lantern** dressing
  (`drawTreeCozy`/`drawHedge`/`drawFlowerBed`/`drawLanternCozy`). The town of project-plots
  reads as the design's **neighbourhood of homes**; civic git/build **yards** stay flat-roofed
  and visually distinct.
- **Citizens in the yard.** Agents are placed in the **front yard** (`yardAnchors`/`yardBeds`
  via `retarget`, gated on `isCozy`) instead of inside, so the closed house never hides them;
  idle cozy citizens just stand with a Zzz (`drawWalker` skips the bed for cozy). Activity
  glyph/speech still rides above each.
- **Work-house vs quiet home.** Lit windows + smoking chimney only when a project has working
  (non-idle) agents → the design legend's "glowing windows = active · chimney smoke = busy".
- **Time of day** (`todState` + `todParams`, default **dusk**; new ☀/◑/☾ buttons top-centre,
  wired in `main.ts`). Day/Dusk/Night re-light the cozy worlds: sky gradient (in the cached
  static bg — `todState` is in the bg cache key), **stars + moon**, ambient shade (`amb` →
  walls/roof/windows/smoke/lanterns) and grass shade (`grassF`). No-op on the dark worlds.

Verified with headless-Chrome screenshots (same-origin harness feeding fake agents, plus the
live app): a single cottage at day/dusk/night, a 6-cottage village with dormer/porch variety,
wide town shots, and a Cyber regression check. Build clean.

### v3.5a — organic village layout (design 02·A "organic village")

Follow-up to feedback ("villages aren't laid out like the design — still one house per
tile"). The user picked the design's **organic village**, so the cell-packing layout engine
was replaced:
- **Ring placement.** `placeCell` no longer packs a blob toward the centroid — it fills
  **concentric diamond rings** (`ringCells`) around a **reserved central green** (r≤1 = the
  git/build civic yards + the well), dropping each new cottage on the free ring cell
  **farthest from the others** so homes spread evenly around the ring. `computeLand` then
  grasses the empty interior → a clear green at the heart.
- **Well + radial lanes.** A stone **well** (`drawWell`) sits at `villageCenter()` (centroid
  of occupied cells), and worn **dirt lanes** (`pathStrip`) radiate from it to every cottage
  — drawn on the ground in `drawTown`, the well depth-sorted into the scene.
- **Organic jitter.** `cottagePos(p)` still nudges each cottage outward + a stable per-name
  jitter; draw position, yard citizens, and the **depth sort** all use it. Idle projects
  render a **dimmed cottage + Zzz** (`drawCozyDormant`/`cottageOpts`), not the old grey box.

Verified via headless-Chrome: n=3 / 8 / 14 towns (single + double ring), night, and the live
app — homes ring the green, well + lanes centre it.

Heads-up for future agents: ring placement is global (all worlds), so dark worlds also
cluster in rings now (fine). And Vite HMR does NOT re-instantiate the running `LivingCity`
(the rAF loop keeps the old instance) — a city.ts change needs a **full page reload** to
take; an open tab can show stale rendering.

## v3.6 — villages (repo) + Ploutos economy + trade

The town now reads as a set of **villages**, where a *village = a git repo*. Cottages
whose folders share a repo cluster together (`placeCell` drops a repo's later cottages on a
free cell **adjacent** to its repo-mates), wear a faint **palisade border** tracing the
cluster (`drawVillageBorders`), and fly a **banner** (`drawVillageBanners`/`drawBanner`)
with the repo name, an agent count, a **tier** (Hamlet→Metropolis, from history+size) and a
**git stat line** (`Nc · age · contributors`). A village's solo cottage drops its own
plot-label so the banner is the only sign (no dupe).

- **Clio** (`server/clio.ts`, muse of history): an async, cached git inspector. `resolve(cwd)`
  returns a repo id (the git toplevel path) instantly — cached, or `undefined` while it
  shells out to `git rev-parse / rev-list / log --max-parents=0 / shortlog / ls-files` to
  measure commits, age, contributors, files (`RepoInfo`). Never blocks the hook path; on
  completion it relabels agents + pushes a `{type:"repos"}` WS message. Wired into both
  servers (`server/index.ts`, `app/src/server.ts`); `normalize.ts` + `normalize-grok.ts`
  now forward the full `cwd`; `AgentEvent`/`AgentState` gained `cwd`/`repo`; Hypnos (app +
  `adapters/presence`) reports `cwd` so even sleeping sessions get a village. Sim/non-git
  folders have no `RepoInfo` → the client **synthesizes** playful stats from the name hash.
- **Ploutos** (the economy, in `city.ts`): live activity mints resources into the village
  stockpile — **read→lore, edit→timber, run→iron, search→spice, think/commit→grain**
  (`updateEconomy`, ~1/sec per active agent, soft cap 130, slow decay). Surplus villages
  send **trade caravans** (`attemptTrade`/`spawnCaravan`/`updateCaravans`/`drawCaravan`) —
  a trader hauling a resource-tinted sack walks the largest surplus→deficit gap and delivers
  on arrival (reuses `gridPath` + front-corner waypoints). Banners show the top-resource
  pips; the HUD gains a **STORES** strip (global totals) + a live caravan count; the left
  legend gains a **VILLAGE RESOURCES** key (`activitylog.ts` `RES_STYLE`).

Wire: `client/src/net.ts` + `main.ts` handle the `repos` message → `city.setRepos`. Verified
via real-time CDP screenshots (the embedded app server + sim): repos resolved with real git
stats (e.g. this repo = 21c/4d/37f → Town), `eos-monorepo` grouped `kernel`+`eos-stack`
under one banner+border, resources accrued, and a "↦ spice" caravan delivered between
villages. Client + Electron bundles clean. NB Chrome `--virtual-time-budget` stalls on the
open WebSocket (economy barely advances) — use real-time CDP capture to see trade.

## v3.7 — a village = a repo (footprint, houses scaled to size, residents & roads)

Reworked the layout so **the repo itself is the village** (not one cottage per folder).
A *village* is now the placed/drawn entity in `city.ts` (`this.villages` Map; `this.projects`
= civics + villages):

- **Footprint scaled to size.** Each village owns a **diamond of cells** (`diamond`,
  `placeVillage`, `villageRadius`) sized to its tier; anchors are spread so footprints +
  a 1-cell road gap never collide, yet stay close → a connected town. `createVillage`
  places it and marks `this.occ`; emptied villages go dormant then prune after a grace
  period (`PRUNE_GRACE`).
- **Decorative houses scaled to size.** `makeHouses` scatters `houseCount(v)` houses
  (tier → `houseTiers` [2,4,7,11,16] + jitter, cap 22) across the footprint, leaving a
  central green; bigger repos literally build bigger villages. `drawHouse`/`houseOpts`
  reuse the cozy `drawCottage` (Harbor/Isles) or a `drawDarkHouse` box (Cyber/Orbital/
  Silicon); some windows glow when the repo is busy. Houses are unlabelled — the banner
  names the village.
- **Villagers = one per active agent.** Agents are world-coord wanderers of their village
  (`updateVillager`/`villagerRetarget`, grouped by `repo || project` in `syncAgents`),
  drawn in the depth-sorted render list with their activity glyph/speech.
- **Resident NPCs live in the repo.** `ensureResidents`/`spawnResident`/`updateResidents`
  add ambient dwellers per village (count ~0.7×houses), wandering the footprint and
  lingering at houses — distinct from the existing park/shore townsfolk (`this.npcs`).
- **Roads link the villages.** `buildRoads` builds a nearest-neighbour edge network between
  anchors; `drawRoads` lays a bed + surface + dashed centre strip along `gridPath`. Cozy
  worlds also draw the green's **well** + radial lanes to each house. Trade caravans run
  the same gaps.
- **Economy/HUD/banners** adapted to the village-as-entity (`updateEconomy`/`villageActive`
  iterate `v.agents`; borders/banners key off `v.life`/`v.houses`). HUD relabelled
  **VILLAGES** with per-row tier + agent count; civic git/build yards retired.

**Depth fix + hover tooltips (follow-up):** walkers (agents/residents/NPCs/caravans) had a
large render-order bias left over from whole-parcel drawing, which made a character render
*over* any house it was within ~20 world-units behind. Now everything sorts by feet (`wy/B`)
with only a hair of forward bias, so characters occlude correctly among the houses. Added
**hover tooltips**: `drawTown` collects screen-space hit-boxes (`_hov`) for every house,
villager, resident, NPC and caravan; a `pointermove` listener records `_hoverPos`;
`drawHover` picks the front-most hit and draws a labelled plaque — houses → "*repo* · house ·
*tier*", agents → "*Kind* agent / *activity* · *repo*", residents → "Villager / resident of
*repo*", caravans → "Trade caravan / hauling *resource*". Cursor switches to `help` over a
hit. Verified via CDP (drove the cursor onto a house/agent/resident — all three plaques
correct, occlusion clean).

**Houses = portions of the repo + Harbor-only (follow-up 2):** each house now represents a
*top-level folder of the repo*. **Clio** gained `dirs` (`git ls-tree -d --name-only HEAD`,
dotfolders skipped) on `RepoInfo` (`shared/logos.ts`); the client (`portionsFor`/
`assignPortions`) labels each house with a real folder (cycling if there are more houses than
folders) or a synthetic one (`portionPool`) for non-git/sim repos, refreshed when Clio's dirs
arrive. The hover tooltip over a house now reads "*folder*/ — part of *repo* · *tier*"
(e.g. "app/ — part of AquarLLM · Town"), answering "what portion is this / why this repo".
The world switcher was reduced to **Harbor only** (other worlds removed from `index.html`;
the dark-world rendering paths remain in `city.ts`, just unreachable from the UI). Verified
via CDP: injected a real-cwd agent → AquarLLM village resolved with real dirs
`[adapters, app, client, server, shared, sim]` mapped onto its houses, tooltip correct.

**Spacing (follow-up 3):** villages were packing too tightly. Widened the inter-village gap
to `VILLAGE_GAP = 3` empty cells (`placeVillage`/`footprintClear`) so there's clear parkland +
road between clusters, and gave larger repos bigger footprints (`villageRadius` now goes to
r=4 for the biggest) with houses spread proportionally wider (`makeHouses` `maxR`/min-spacing
bumped) — so a big repo grows in *area*, not just density. Verified via CDP: a Metropolis +
several Cities now read as distinct, separated villages linked by roads.

Synth (non-git/sim) stats were dialled down so synthetic villages span Hamlet→City (real
Clio repos still drive the tier). Verified via real-time CDP: four repo-villages
(eos-monorepo Metropolis, platform, rustlang, aquarllm Town) with size-scaled house
clusters, palisade borders, wells + radial lanes, **roads between villages**, villagers
with speech bubbles, resident NPCs across the world, and a live caravan; dark-world box
houses confirmed. Client bundle clean.

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
