// @ts-nocheck
/**
 * AquarLLM — The Living City (Claude Design, v2 handoff).
 *
 * High-fidelity procedural pixel-art isometric city, ported verbatim from the design's
 * `Component` engine and fed the real Hermes feed instead of the auto-sim. New in this
 * version: buildings go *dormant* (never vanish) when idle, persistent git/build civic
 * yards with street-routed commuting, uniquely-dressed citizens (faction = foot dot
 * only), smaller footprints with paved lanes, per-room materials/rugs/props, doorways,
 * and beach rings. Raw 2D canvas (sanctioned by the handoff README).
 */
import type { AgentState } from "@aquarllm/shared";

// Hermes Activity → design activity.
const ACT_MAP: Record<string, string> = {
  reading: "read", editing: "edit", running: "run", searching: "search",
  thinking: "think", waiting: "wait", idle: "idle", error: "error",
  joined: "think", spawning: "think", left: "idle",
};

export class LivingCity {
  constructor(canvas) {
    this.canvas = canvas;
    this.state = { world: "harbor" };
    this.speed = 1; this.paused = false;
    this._cache = {};
    this.cam = { x: 0, y: 0, z: 0.85 };
    this.userControlled = false;
    this.leftGutter = 0;

    this.factions = { claude: "#d97757", codex: "#10a37f", grok: "#9aa0a6", custom: "#9b7cf0" };
    this.factionKeys = ["claude", "codex", "grok", "custom"];

    this.acts = {
      read: { label: "reading", glyph: "book", color: "#5fb0ab" },
      edit: { label: "editing", glyph: "pencil", color: "#e0a23c" },
      run: { label: "running", glyph: "run", color: "#56b870" },
      search: { label: "searching", glyph: "mag", color: "#5a8fd6" },
      think: { label: "thinking", glyph: "think", color: "#9b7cf0" },
      wait: { label: "waiting", glyph: "hour", color: "#e07a4a" },
      idle: { label: "idle (asleep)", glyph: "zee", color: "#7e8794" },
      error: { label: "error", glyph: "bang", color: "#d96b5a" },
      commit: { label: "committing", glyph: "commit", color: "#c98a3c" },
    };
    this.actCycle = ["read", "edit", "run", "search", "think", "wait", "idle"];

    this.glyphs = {
      book: [".......", "1110111", "1010101", "1010101", "1010101", "1110111", "......."],
      pencil: [".....11", "....111", "...11.1", "..11.1.", ".11.1..", "111....", "11....."],
      run: ["1......", "11.....", ".11....", "..11...", ".11....", "11.....", ".111111"],
      mag: [".1111..", "1....1.", "1....1.", "1....1.", ".1111..", "....11.", ".....11"],
      think: [".11111.", "1.....1", "1.1.1.1", "1.....1", ".11111.", ".1.....", "1......"],
      hour: ["1111111", ".11111.", "..111..", "...1...", "..111..", ".11111.", "1111111"],
      zee: [".11111.", "....11.", "...1...", "..1....", ".11....", ".11111.", "......."],
      bang: ["..11...", "..11...", "..11...", "..11...", "..11...", ".......", "..11..."],
      commit: [".1...1.", ".1...1.", ".1..11.", ".111...", ".1..11.", ".1...1.", ".1...1."],
    };
    // shared body (rows 4-17); the head (rows 0-3) varies per citizen so no two look alike
    this.bodyBase = [".HKKWKKWKKH.", ".HKKKKKKKKH.", ".HKKkkkkKKH.", "..KKKKKKKK..", "...SSSSSS...", "..SSSSSSSS..", ".sSSSSSSSSs.", "KsSSSSSSSSsK", "KsSSSSSSSSsK", ".sSSSSSSSSs.", "..PPPPPPPP..", "..PPP..PPP..", "..PPP..PPP..", "..BB....BB.."];
    this.heads = {
      hair: ["...HHHHHH...", "..HHHHHHHH..", ".HHHHHHHHHH.", ".HKKKKKKKKH."],
      cap: ["....CCCC....", "...CCCCCC...", "..CCCCCCCC..", ".CCKKKKKKCC."],
      hood: ["...HHHHHH...", "..HHHHHHHH..", ".HHHHHHHHHH.", ".HHHKKKKHHH."],
      long: ["...HHHHHH...", "..HHHHHHHH..", ".HHHHHHHHHH.", ".HHHHHHHHHH."],
    };
    this.headKeys = ["hair", "cap", "hood", "long"];
    this.skinTones = ["#f0c8a0", "#e8b48c", "#d99a6c", "#c98a5a", "#a86a44", "#8a5535"];
    this.hairColors = ["#2a2320", "#3a2a1a", "#5a3a22", "#7a5535", "#b0803a", "#caa86a", "#9a3a2a", "#cfd2d8"];
    this.shirtColors = ["#c0563f", "#3f7fc0", "#d99a3c", "#4f9e6a", "#9a6ac0", "#c95a86", "#5aa0a8", "#b0703f", "#7a8a4a", "#5a6a7a"];
    this.capColors = ["#c0563f", "#3f7fc0", "#2a2f3a", "#d99a3c", "#4f9e6a", "#9a6ac0", "#c95a86"];
    this.pantsColors = ["#3a4658", "#4a3f30", "#2f3a3a", "#54473a", "#3a3550"];

    this.worlds = {
      harbor: { label: "Harbor", sub: "tidewater", dark: false, road: "cobble", cozy: true, style: "cozy", roof: "#c2683f",
        bg: { top: "#10141a", glow: "rgba(46,108,116,0.16)" },
        pal: { gTop: "#6f9a55", gSide: "#496838", plaza: "#c8a06a", road: "#b89a72", wallA: "#ecdcbb", wallB: "#d9b48a", window: "#ffd98a" } },
      cyber: { label: "Cyber", sub: "data-district", dark: true, road: "neon", roof: "#0e1422", style: "neon",
        bg: { top: "#090a12", glow: "rgba(150,40,170,0.16)", grid: true },
        pal: { gTop: "#171b28", gSide: "#0c0e16", plaza: "#222840", road: "#37f0d6", wallA: "#1b2030", wallB: "#141826", window: "#37f0d6" } },
      space: { label: "Orbital", sub: "space colony", dark: true, road: "grate", roof: "#7f8aa0", style: "space",
        bg: { top: "#070912", glow: "rgba(60,90,170,0.13)", stars: true },
        pal: { gTop: "#aeb6c4", gSide: "#5f6776", plaza: "#c8cfd9", road: "#7e879a", wallA: "#c2c9d4", wallB: "#9aa3b2", window: "#bfe6ff" } },
      fantasy: { label: "Isles", sub: "archipelago", dark: false, road: "dirt", roof: "#b58a3a", style: "cozy",
        bg: { top: "#16233c", glow: "rgba(80,130,200,0.16)", sky: true },
        pal: { gTop: "#7bb05a", gSide: "#587f3e", plaza: "#cdbb90", road: "#9a7a4e", wallA: "#e8d9b8", wallB: "#cf9f6e", window: "#ffe6a0" } },
      silicon: { label: "Silicon", sub: "circuit board", dark: true, road: "copper", roof: "#0f1a14", style: "chip",
        bg: { top: "#0b1410", glow: "rgba(40,130,70,0.13)", board: true },
        pal: { gTop: "#16271c", gSide: "#0a160f", plaza: "#1d3026", road: "#b87333", wallA: "#1d2a22", wallB: "#142019", window: "#46e07a" } },
    };

    this.colorPool = ["#e0664f", "#46b39a", "#a07cf0", "#e0a23c", "#4f8fe0", "#e06a9a", "#56b870", "#5ac8d9", "#cf8a3c", "#8a7be0", "#d2607a", "#6ab04c", "#dd7bd0", "#4fb0a0"];

    this.A = 98; this.B = 49;
    this.walkSpeed = 24;
    this.anchors = { read: { x: -31, y: -8 }, think: { x: -11, y: -15 }, edit: { x: 11, y: -15 }, run: { x: 31, y: -8 }, search: { x: 24, y: 10 }, wait: { x: -24, y: 10 } };
    this.bedSlots = [{ x: -13, y: 18 }, { x: 3, y: 21 }, { x: 17, y: 16 }, { x: -2, y: 12 }];
    this.phrases = { read: ["reading…", "utils.go", "config.rs", "what is this?"], edit: ["fixing it", "refactor", "+ tests", "almost…"], run: ["$ build", "$ test", "npm ci", "deploying"], search: ["docs?", "grep -r", "how do I…", "found it!"], think: ["hmm…", "planning", "let me think", "what if…"], wait: ["your call?", "review pls", "blocked", "waiting…"], error: ["uh oh", "✗ failed", "retrying", "broken!"] };

    // Townsfolk — ambient NPCs that live in the parks & shore while the real agents work.
    this.npcSkin = this.skinTones; this.npcHair = this.hairColors; this.npcPants = this.pantsColors; this.npcCap = this.capColors;
    this.npcShirt = ["#7a8a4a", "#5a8a6a", "#8a6a4a", "#6a7a9a", "#9a7a5a", "#7a6a8a", "#5a7a8a", "#a08a5a", "#8a5a6a", "#6a8a7a"];
    this.npcEmotes = {
      gaze: ["nice view", "lovely", "the sea…", "calm…", "so peaceful"],
      rest: ["*sip*", "phew", "nice spot", "a break~", "ahh…"],
      chat: ["hello!", "how's it?", "hi there", "did you hear?", "g'day"],
      fish: ["any fish?", "patience…", "got one!", "just one more", "nibble?"],
      stroll: ["la la~", "…", "off we go", "hmm", "such a day"],
      wish: ["make a wish", "i wish…", "one coin…", "✦", "fingers crossed"],
      coffee: ["one coffee", "*sip*", "smells good", "another?", "mmm"],
      tend: ["watering…", "such flowers", "grow well", "pretty!", "almost bloomed"],
      admire: ["impressive", "who's that?", "majestic", "nice work", "a classic"],
      relax: ["so sunny", "shade~", "relaxing", "ahh…", "beach day"],
    };
    // POI kind → the leisure task an NPC performs when it arrives there.
    this.npcDestTask = { bench: "rest", fountain: "wish", cafe: "coffee", garden: "tend", statue: "admire", umbrella: "relax" };
    this.npcs = []; this._npcId = 0; this.npcTarget = 0; this.npcSpeed = 26;

    this.projects = []; this.occ = {}; this.projByName = new Map();
    this._pid = 0;
    this.edge4 = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    this.civics = []; this.commuteSpeed = 30; this.MAXTOTAL = 9;
    this.roomMats = [
      { f: "#b5563f", a: 0.5 }, { f: "#9c7338", a: 0.5 }, { f: "#4f8a55", a: 0.46 }, { f: "#6f86a8", a: 0.46 }, { f: "#5a6473", a: 0.5 },
    ];

    // ---- Cozy Houses (Claude Design) — time-of-day lighting + cottage trim ----
    // The cozy worlds (Harbor, Isles) render gable cottages whose windows glow and
    // chimneys smoke when the house has working agents. A day/dusk/night cycle re-lights
    // the whole town. Dark worlds (Cyber/Orbital/Silicon) keep their sci-fi roofs.
    this.todState = "dusk";
    this.flowers = ["#d96b5a", "#e0a23c", "#e07a9a", "#b07be0", "#f0e0a0", "#e85d70"];
    // Cottage palette (ported from the design). Cozy worlds draw freestanding gable
    // cottages with these colours; the project's own colour tints the roof/picks variants.
    this.cozyPal = {
      grass: "#6f9a55", grassDk: "#496838", path: "#cbb487", pathDk: "#a98e63",
      wallA: "#ecdcbb", wallB: "#e2cfa6", timber: "#7a5232", timberDk: "#5e3f26",
      roofA: "#c2683f", roofB: "#a8542f", roofRidge: "#8f4527", shingle: "#b35c36",
      door: "#6e4429", doorTrim: "#caa86a", brick: "#a8573a", brickDk: "#854127",
      win: "#ffd98a", winDk: "#2c3c4e", winFrame: "#5b3f28",
      hedgeA: "#4d7a3a", hedgeB: "#5e8b4a", hedgeC: "#6f9a55", fence: "#e3d6b8", fenceDk: "#b7a684",
    };
    this.cozyWalls = [this.cozyPal.wallA, this.cozyPal.wallB, "#e8d2a8", "#e6dcc2"];
    this.cozyRoofs = [this.cozyPal.roofA, "#b86a44", "#c2683f", "#a8542f", "#bd7a48"];
    // Cozy citizens stand/work in the front yard (positive y = toward the viewer) so the
    // closed cottage never hides them.
    this.yardAnchors = { read: { x: -24, y: 18 }, think: { x: -10, y: 24 }, edit: { x: 6, y: 24 }, run: { x: 22, y: 18 }, search: { x: 30, y: 8 }, wait: { x: -30, y: 8 } };
    this.yardBeds = [{ x: -18, y: 22 }, { x: -4, y: 27 }, { x: 12, y: 25 }, { x: 26, y: 20 }];

    // ---- Villages (a village = a git repo) + Ploutos (the resource economy) ----
    // Each git repo is a *village*: a footprint of cells sized to its tier, filled with
    // decorative houses scaled to the repo's size (Clio's RepoInfo). Its live agents are
    // *villagers* walking it; ambient *residents* (NPCs) also live there. Roads link the
    // villages, live activity mints resources, and surplus villages send trade caravans.
    this.repos = new Map();        // repo id -> RepoInfo (from Clio; real or absent)
    this.villages = new Map();     // village id -> village (also the placed/drawn entity)
    this.houseTiers = [2, 4, 7, 11, 16]; // decorative houses per tier rank (Hamlet→Metropolis)
    this.MAX_HOUSES = 22;
    this.VILLAGE_GAP = 3; // empty cells (parkland/road) kept between village footprints
    // Each house is a *portion of the repo* — a real top-level folder (from Clio) when known,
    // else a plausible one drawn from this pool. Shown in the hover tooltip.
    this.portionPool = ["src", "lib", "core", "api", "ui", "tests", "docs", "cli", "server", "client", "utils", "assets", "scripts", "config", "build", "pkg", "internal", "cmd", "web", "data", "app", "tools", "examples", "types"];
    this.villagerSpeed = 22;       // live agents wandering their village
    this.residentSpeed = 16;       // ambient repo-dwellers (non-agents)
    this.RESIDENT_RATIO = 0.7; this.RESIDENT_MAX = 14;
    this.roads = []; this._roadSig = "";
    this.PRUNE_GRACE = 16;         // s an emptied village lingers (dormant) before removal
    this.resKeys = ["timber", "iron", "lore", "spice", "grain"];
    this.resMeta = {
      timber: { label: "timber", color: "#b5793f" },
      iron: { label: "iron", color: "#9aa3b2" },
      lore: { label: "lore", color: "#7c9fe0" },
      spice: { label: "spice", color: "#e07a4a" },
      grain: { label: "grain", color: "#e0c24a" },
    };
    // What each live activity mints. think/commit → grain (the staple); the rest map 1:1.
    this.actToRes = { read: "lore", edit: "timber", run: "iron", search: "spice", think: "grain", commit: "grain" };
    this.tiers = ["Hamlet", "Village", "Town", "City", "Metropolis"];
    this.PROD = 1.0;    // resource units/sec per active agent
    this.RES_CAP = 130; // soft cap per resource
    this.DECAY = 0.02;  // slow drift toward 0 so surplus/deficit (and trade) resolve over time
    this.caravans = []; this._carId = 0; this.tradeT = 4;
    this.MAX_CARAVANS = 3; this.caravanSpeed = 28;
    this.SURPLUS_MIN = 35; this.DEFICIT_MAX = 22; this.TRADE_AMT = 18;

    this._initControls();
  }
  world() { return this.worlds[this.state.world]; }
  get worldKey() { return this.state.world; }
  setWorld(k) { if (!this.worlds[k]) return; this.state.world = k; this.rebuildBg(); }
  get isCozy() { return this.world().style === "cozy"; }
  setTimeOfDay(k) { if (k !== "day" && k !== "dusk" && k !== "night") return; this.todState = k; }
  get timeOfDay() { return this.todState; }
  // Lighting model ported from the Cozy Houses design: ambient wall/roof shade, window
  // glow, chimney-smoke + lantern strength, grass shade and a starfield amount per phase.
  todParams() {
    const t = this.todState;
    if (t === "day") return { glow: 0.12, amb: 1.06, sky: ["#bcdce0", "#dfe6d2", "#cfdcc6"], grassF: 1.06, lantern: 0.0, smoke: 0.5, star: 0 };
    if (t === "night") return { glow: 1.0, amb: 0.58, sky: ["#0b1530", "#102038", "#0a1626"], grassF: 0.6, lantern: 1.0, smoke: 0.95, star: 1 };
    return { glow: 0.85, amb: 0.84, sky: ["#163a4c", "#103040", "#0c2532"], grassF: 0.86, lantern: 0.7, smoke: 0.85, star: 0.22 }; // dusk
  }

  hx(h) { h = h.replace("#", ""); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  shade(h, f) { const c = this.hx(h); return "rgb(" + Math.round(c[0] * f) + "," + Math.round(c[1] * f) + "," + Math.round(c[2] * f) + ")"; }
  tint(h, f) { const c = this.hx(h); return "rgb(" + Math.round(c[0] + (255 - c[0]) * f) + "," + Math.round(c[1] + (255 - c[1]) * f) + "," + Math.round(c[2] + (255 - c[2]) * f) + ")"; }
  rgbaA(h, a) { const c = this.hx(h); return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + Math.max(0, a) + ")"; }
  rnd(a, b) { return a + Math.random() * (b - a); }
  pickArr(a) { return a[Math.floor(Math.random() * a.length)]; }
  hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }

  buildCanvas(map, pal, scale) { const h = map.length, w = map[0].length; const cv = document.createElement("canvas"); cv.width = w * scale; cv.height = h * scale; const c = cv.getContext("2d"); c.imageSmoothingEnabled = false; for (let r = 0; r < h; r++)for (let x = 0; x < w; x++) { const ch = map[r][x]; if (!ch || ch === "." || ch === " ") continue; const col = (typeof pal === "string") ? (ch === "1" ? pal : null) : pal[ch]; if (!col) continue; c.fillStyle = col; c.fillRect(x * scale, r * scale, scale, scale); } return cv; }
  glyphCv(name, color, scale) { const k = "g" + name + color + scale; if (this._cache[k]) return this._cache[k]; return this._cache[k] = this.buildCanvas(this.glyphs[name], color, scale); }
  sprite(a) { const head = a.head || "hair", skin = a.skin || "#e8b48c", hair = a.hair || "#3a2a1a", shirt = a.shirt || this.factions[a.faction] || "#c0563f", cap = a.cap || "#3f7fc0", pants = a.pants || "#3a4658";
    const k = "sp" + head + skin + hair + shirt + cap + pants; if (this._cache[k]) return this._cache[k];
    const map = (this.heads[head] || this.heads.hair).concat(this.bodyBase);
    const pal = { H: hair, C: cap, K: skin, k: this.shade(skin, 0.82), W: "#241f2e", S: shirt, s: this.shade(shirt, 0.66), P: pants, B: "#23272f" };
    return this._cache[k] = this.buildCanvas(map, pal, 2); }

  poly(ctx, pts, fill) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); }
  line(ctx, a, b, col, w) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
  ell(ctx, x, y, rx, ry, fill) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); }
  box(ctx, x, y, bw, bh, h, wall, roof, opt) { opt = opt || {};
    const L = [x - bw, y], B = [x, y + bh], R = [x + bw, y], Lr = [x - bw, y - h], Br = [x, y + bh - h], Rr = [x + bw, y - h], Tr = [x, y - bh - h];
    this.poly(ctx, [L, B, Br, Lr], this.shade(wall, 0.7)); this.poly(ctx, [B, R, Rr, Br], this.shade(wall, 0.9));
    if (opt.win) { const wc = this.world().pal.window; const fp = (u, v) => { const bx = B[0] + (R[0] - B[0]) * u, by = B[1] + (R[1] - B[1]) * u, tx = Br[0] + (Rr[0] - Br[0]) * u, ty = Br[1] + (Rr[1] - Br[1]) * u; return [bx + (tx - bx) * v, by + (ty - by) * v]; }; this.poly(ctx, [fp(0.5, 0.42), fp(0.82, 0.42), fp(0.82, 0.82), fp(0.5, 0.82)], wc); }
    const e = opt.eave === false ? 0 : Math.max(1, bw * 0.14);
    this.poly(ctx, [[Lr[0] - e, Lr[1]], [Tr[0], Tr[1] - e], [Rr[0] + e, Rr[1]], [Br[0], Br[1] + e]], roof);
    this.poly(ctx, [[Lr[0] - e, Lr[1]], [Br[0], Br[1] + e], [Rr[0] + e, Rr[1]]], this.shade(roof, 0.8)); }

  /* ---------- model ---------- */
  worldPos(cell) { return { x: (cell.cx - cell.cy) * this.A, y: (cell.cx + cell.cy) * this.B }; }
  worldToCell(wx, wy) { return { cx: Math.round((wx / this.A + wy / this.B) / 2), cy: Math.round((wy / this.B - wx / this.A) / 2) }; }
  centroidCell() { const a = this.projects.filter(p => !p.removing); if (!a.length) return { cx: 0, cy: 0 }; let sx = 0, sy = 0; for (const p of a) { sx += p.cell.cx; sy += p.cell.cy; } return { cx: sx / a.length, cy: sy / a.length }; }
  // Diamond ring of cells at Manhattan distance r from the origin, walked around angularly.
  ringCells(r) { const o = []; for (let i = 0; i < r; i++) o.push([r - i, i]); for (let i = 0; i < r; i++) o.push([-i, r - i]); for (let i = 0; i < r; i++) o.push([-r + i, -i]); for (let i = 0; i < r; i++) o.push([i, -r + i]); return o; }
  // ---- village placement (a village owns a diamond footprint of cells) ----
  // The diamond of cells at Manhattan radius r around an anchor (|dx|+|dy|≤r).
  diamond(anchor, r) { const out = []; for (let dx = -r; dx <= r; dx++) { const ry = r - Math.abs(dx); for (let dy = -ry; dy <= ry; dy++) out.push({ cx: anchor.cx + dx, cy: anchor.cy + dy }); } return out; }
  // Is the (r+gap) diamond around `anchor` clear of every other village's footprint?
  footprintClear(anchor, r, gap) { for (const c of this.diamond(anchor, r + gap)) if (this.occ[c.cx + "," + c.cy]) return false; return true; }
  // Place a village footprint of radius r: the nearest free anchor (smallest ring) whose
  // footprint + a road/parkland gap clears every other village — then, among equals on that
  // ring, the one closest to existing villages so the map stays a connected town with clear
  // lanes + green between the clusters.
  placeVillage(r) {
    const gap = this.VILLAGE_GAP;
    for (let R = 0; R < 120; R++) {
      const cands = R === 0 ? [[0, 0]] : this.ringCells(R);
      const valid = []; for (const [cx, cy] of cands) { const a = { cx, cy }; if (this.footprintClear(a, r, gap)) valid.push(a); }
      if (!valid.length) continue;
      if (!this.villages.size) return valid[0];
      let best = valid[0], bd = 1e18;
      for (const a of valid) { const w = this.worldPos(a); let md = 1e18; for (const v of this.villages.values()) { const w2 = this.worldPos(v.anchor); md = Math.min(md, (w.x - w2.x) ** 2 + ((w.y - w2.y) * 2) ** 2); } if (md < bd) { bd = md; best = a; } }
      return best;
    }
    return { cx: 0, cy: 0 };
  }
  // Footprint radius from house count: small repos a single cell, big ones a wide cluster
  // (larger repos grow in *area*, not just density, so they stay readable).
  villageRadius(hc) { return hc <= 3 ? 0 : hc <= 6 ? 1 : hc <= 10 ? 2 : hc <= 14 ? 3 : 4; }
  // How many decorative houses a village shows: scaled to its tier (+ a little hash jitter).
  houseCount(v) { return Math.min(this.MAX_HOUSES, this.houseTiers[v.tier.rank] + (this.hashStr(v.id + "hc") % 3)); }
  // Scatter the village's decorative houses across its footprint (stable per id), leaving a
  // central green clear; bigger footprints spread the houses wider (denser repos still get
  // more land, not just tighter packing).
  makeHouses(v) {
    const hc = this.houseCount(v), center = this.worldPos(v.anchor);
    const inner = this.A * (0.32 + 0.05 * v.r), maxR = this.A * (0.55 + 0.5 * v.r);
    const houses = []; let seed = this.hashStr(v.id + "houses") || 1; let tries = 0;
    const nextF = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed % 100000) / 100000; };
    while (houses.length < hc && tries++ < hc * 20) {
      const ang = nextF() * Math.PI * 2, rad = inner + Math.sqrt(nextF()) * (maxR - inner);
      const wx = center.x + Math.cos(ang) * rad, wy = center.y + Math.sin(ang) * rad * 0.62;
      if (houses.some((h) => (h.wx - wx) ** 2 + ((h.wy - wy) * 1.7) ** 2 < (this.A * 0.52) ** 2)) continue;
      houses.push({ wx, wy, seed: this.hashStr(v.id + "h" + houses.length) });
    }
    houses.sort((a, b) => a.wy - b.wy);
    v.houses = houses; v.green = { wx: center.x, wy: center.y };
    this.assignPortions(v);
  }
  makeResidents(v) { v.residentTarget = Math.min(this.RESIDENT_MAX, Math.max(1, Math.round((v.houses ? v.houses.length : 1) * this.RESIDENT_RATIO))); }
  // The repo's portions (top-level folders): real from Clio (`info.dirs`), else a stable
  // synthetic set drawn from the pool, sized to the house count.
  portionsFor(v) {
    const dirs = v.info && v.info.dirs;
    if (dirs && dirs.length) return dirs;
    const pool = this.portionPool, n = Math.min(pool.length, Math.max(2, v.houses ? v.houses.length : 3));
    const out = [], used = new Set(); let h = this.hashStr(v.id + "port") || 1;
    while (out.length < n && used.size < pool.length) { h = (h * 1664525 + 1013904223) >>> 0; const i = h % pool.length; if (used.has(i)) continue; used.add(i); out.push(pool[i]); }
    return out;
  }
  // Label each house with a portion (cycling the list if there are more houses than folders —
  // a big folder simply gets a few buildings).
  assignPortions(v) { if (!v.houses || !v.houses.length) return; const ps = this.portionsFor(v); v.houses.forEach((h, i) => { h.portion = ps.length ? ps[i % ps.length] : "src"; }); }
  // World position of the village green's centre (centroid of all occupied cells).
  villageCenter() { const a = this.projects.filter(p => this.occ[p.cell.cx + "," + p.cell.cy]); if (!a.length) return this.worldPos({ cx: 0, cy: 0 }); let sx = 0, sy = 0; for (const p of a) { sx += p.cell.cx; sy += p.cell.cy; } return this.worldPos({ cx: sx / a.length, cy: sy / a.length }); }
  retarget(p, a, i) { const yard = this.isCozy && !p.civic; // cozy citizens stand in the front yard, not an interior workspace
    if (a.act === "idle") { const beds = yard ? this.yardBeds : this.bedSlots; const bs = beds[i % beds.length]; a.tx = bs.x; a.ty = bs.y; a.bed = !yard; return; }
    const A = yard ? this.yardAnchors : this.anchors; const an = A[a.act === "error" ? "run" : a.act] || A.edit; a.tx = an.x + this.rnd(-9, 9); a.ty = an.y + this.rnd(yard ? -4 : 3, yard ? 6 : 9); a.bed = false; }
  layoutAgents(p) { p.agents.forEach((a, i) => this.retarget(p, a, i)); }
  // A villager: a live agent walking its village in world coords (tx/ty = world target).
  newAgent() { return { faction: this.pickArr(this.factionKeys), head: this.pickArr(this.headKeys), skin: this.pickArr(this.skinTones), hair: this.pickArr(this.hairColors), shirt: this.pickArr(this.shirtColors), cap: this.pickArr(this.capColors), pants: this.pickArr(this.pantsColors), act: this.pickArr(this.actCycle), phase: Math.random() * 6, wx: 0, wy: 0, tx: null, ty: null, walking: true, faceLeft: false, wanderT: this.rnd(2, 5), sayT: this.rnd(1, 5), say: "", sayUntil: 0, homeIdx: 0, detail: "" }; }
  simPool() { return [...this.villages.values()].filter((v) => !v.removing); }

  // A village = a git repo: a placed footprint of cells with decorative houses, villagers
  // (agents) and resident NPCs. It IS the drawn entity (no per-folder cottages anymore).
  createVillage(id, name) {
    const accent = this.colorPool[this.hashStr(id) % this.colorPool.length];
    const v = { id, name: name || this.baseName(id), repoId: id, color: accent, accent,
      agents: [], agentById: new Map(), residents: [], residentTarget: 0,
      life: 0, target: 1, dormant: false, removing: false, born: performance.now(), emptySince: 0, working: false,
      stock: { timber: 0, iron: 0, lore: 0, spice: 0, grain: 0 }, lastTradeT: 0 };
    v.info = this.villageInfo(v); v.tier = this.villageTier(v.info); v.name = v.info.name || v.name;
    v.r = this.villageRadius(this.houseCount(v));
    v.anchor = this.placeVillage(v.r); v.cell = v.anchor; // .cell kept for camera/commute compat
    v.cells = this.diamond(v.anchor, v.r); v.cellSet = new Set(v.cells.map((c) => c.cx + "," + c.cy));
    for (const c of v.cells) this.occ[c.cx + "," + c.cy] = id;
    this.makeHouses(v); this.makeResidents(v);
    this.villages.set(id, v); this._landSig = null; this._roadSig = "";
    return v;
  }
  removeVillage(v) { for (const c of v.cells || []) if (this.occ[c.cx + "," + c.cy] === v.id) delete this.occ[c.cx + "," + c.cy]; this.villages.delete(v.id); this._landSig = null; this._roadSig = ""; }
  // Keep this.projects (drawn/iterated list) = civics + villages, in sync after every change.
  syncProjectsArray() { this.projects = [...this.civics, ...this.villages.values()]; }
  addCivic(kind, cell) { const meta = kind === "git"
      ? { name: "git-yard", color: "#c98a3c", slots: [{ x: -26, y: -2 }, { x: 0, y: -6 }, { x: 26, y: -2 }, { x: -13, y: 9 }, { x: 13, y: 9 }] }
      : { name: "build-yard", color: "#56b870", slots: [{ x: -28, y: -2 }, { x: -9, y: -7 }, { x: 11, y: -7 }, { x: 29, y: -2 }, { x: 0, y: 11 }] };
    this.occ[cell.cx + "," + cell.cy] = 1;
    const p = { id: ++this._pid, name: meta.name, color: meta.color, cell, agents: [], life: 1, target: 1, removing: false, civic: true, kind, slots: meta.slots, slotUsed: meta.slots.map(() => false), born: performance.now() - 1e5 };
    this.projects.push(p); this.civics.push(p); return p; }
  gridPath(a, b) { const out = [{ cx: a.cx, cy: a.cy }]; let cx = a.cx, cy = a.cy; while (cx !== b.cx) { cx += Math.sign(b.cx - cx); out.push({ cx, cy }); } while (cy !== b.cy) { cy += Math.sign(b.cy - cy); out.push({ cx, cy }); } return out; }
  goDormant(p) { if (p.dormant) return; for (const a of p.agents) { if (a.commute) a.commute.civ.slotUsed[a.commute.slot] = false; } p.dormant = true; p.agents = []; if (p.agentById) p.agentById.clear(); }

  /** Map the live agent feed onto villages (= repos). Agents sharing a repo are villagers of
   *  one village; emptied villages go dormant, then are pruned after a grace period. */
  syncAgents(states: AgentState[]) {
    const byV = new Map();
    for (const s of states) { const id = s.repo || s.project || "·"; if (!byV.has(id)) byV.set(id, { id, name: s.project || this.baseName(id), list: [] }); byV.get(id).list.push(s); }

    const seen = new Set();
    for (const [id, g] of byV) {
      seen.add(id);
      let v = this.villages.get(id);
      if (!v) v = this.createVillage(id, g.name);
      if (v.dormant) { v.dormant = false; v.born = performance.now(); }
      v.target = 1; v.removing = false; v.emptySince = 0;

      const agentSeen = new Set();
      for (const st of g.list) {
        agentSeen.add(st.agentId);
        const act = ACT_MAP[st.activity] || "think";
        const fac = this.factions[st.agentKind] ? st.agentKind : "custom";
        let a = v.agentById.get(st.agentId);
        if (!a) {
          a = this.newAgent(); a.__id = st.agentId; a.faction = fac; a.act = act;
          a.homeIdx = v.agents.length; a.wx = v.green.wx + this.rnd(-22, 22); a.wy = v.green.wy + this.rnd(-12, 12); a.tx = null;
          v.agents.push(a); v.agentById.set(st.agentId, a);
        } else { a.faction = fac; if (a.act !== act) { a.act = act; a.tx = null; a.sayT = 0.4; } }
        a.detail = st.detail ? String(st.detail).slice(0, 20) : "";
      }
      for (let i = v.agents.length - 1; i >= 0; i--) { const a = v.agents[i]; if (a.__id && !agentSeen.has(a.__id)) { v.agents.splice(i, 1); v.agentById.delete(a.__id); } }
      v.working = v.agents.some((a) => a.act !== "idle");
    }

    const now = performance.now();
    for (const [id, v] of this.villages) {
      if (seen.has(id)) continue;
      if (!v.dormant) { v.dormant = true; v.emptySince = now; v.agents.length = 0; v.agentById.clear(); v.working = false; }
      else if (!v.removing && now - (v.emptySince || now) > this.PRUNE_GRACE * 1000) { v.removing = true; v.target = 0; }
    }
    this.relabelVillages();
    this.syncProjectsArray();
  }

  /* ---------- villages (a village = a git repo) + Ploutos (economy) ---------- */
  setRepos(repos) { for (const r of repos) this.repos.set(r.id, r); this.relabelVillages(); }
  // When Clio's real stats arrive (or a synth repo is first seen), refresh each village's
  // name/tier; if the tier changed, regenerate its houses & residents within the same
  // footprint (so a Hamlet that turns out to be a Town fills out, without re-placing it).
  relabelVillages() {
    for (const v of this.villages.values()) {
      const info = this.villageInfo(v), tier = this.villageTier(info);
      v.info = info; v.name = info.name || v.name;
      if (!v.tier || v.tier.rank !== tier.rank) { v.tier = tier; this.makeHouses(v); this.makeResidents(v); }
      else { v.tier = tier; this.assignPortions(v); } // dirs may have just arrived from Clio
    }
  }
  baseName(id) { return id.split(/[\\/]/).filter(Boolean).pop() || id; }
  // RepoInfo for a village — Clio's real git stats, else playful stats hashed from the id.
  villageInfo(v) {
    const real = this.repos.get(v.id);
    if (real) return real;
    if (v._synth && v._synthFor === v.id) return v._synth;
    const h = this.hashStr(v.id);
    v._synthFor = v.id;
    return (v._synth = { id: v.id, name: this.baseName(v.id), commits: 2 + (h % 150), ageDays: (h >> 5) % 950, contributors: 1 + ((h >> 9) % 5), files: 4 + ((h >> 3) % 210), real: false });
  }
  // Hamlet → Metropolis, from a log-scaled blend of history (commits, age, devs) + size (files).
  villageScore(info) { const l = (n) => Math.log2(Math.max(1, n) + 1); return l(info.commits) * 1.15 + l(info.files) * 0.85 + l(info.ageDays) * 0.45 + info.contributors * 0.5; }
  villageTier(info) { const s = this.villageScore(info); const i = s < 6 ? 0 : s < 10 ? 1 : s < 14 ? 2 : s < 18 ? 3 : 4; return { name: this.tiers[i], rank: i }; }
  // World position of a village's centre (centroid of its occupied cells).
  villageCentroid(v) { let sx = 0, sy = 0; for (const c of v.cells) { sx += c.cx; sy += c.cy; } const n = v.cells.length || 1; return this.worldPos({ cx: sx / n, cy: sy / n }); }
  villageActive(v) { return { agents: v.agents.length, working: v.working }; }

  /* ---------- Ploutos: production, decay & trade ---------- */
  updateEconomy(dt) {
    if (this.paused) return;
    for (const v of this.villages.values()) {
      if (!v.dormant) for (const a of v.agents) {
        const res = this.actToRes[a.act];
        if (res && a.act !== "idle") v.stock[res] = Math.min(this.RES_CAP, v.stock[res] + this.PROD * dt);
      }
      for (const k of this.resKeys) v.stock[k] = Math.max(0, v.stock[k] - this.DECAY * dt); // slow drift
    }
    this.tradeT -= dt;
    if (this.tradeT <= 0) { this.tradeT = this.rnd(3, 5.5); this.attemptTrade(); }
  }
  // Find the largest surplus→deficit gap across all resources and dispatch a caravan for it.
  attemptTrade() {
    const vs = [...this.villages.values()].filter((v) => v.cells.length);
    if (vs.length < 2 || this.caravans.length >= this.MAX_CARAVANS) return;
    let pick = null, bestGap = 0;
    for (const res of this.resKeys) {
      let from = null, to = null;
      for (const v of vs) { if (!from || v.stock[res] > from.stock[res]) from = v; if (!to || v.stock[res] < to.stock[res]) to = v; }
      if (from === to) continue;
      const gap = from.stock[res] - to.stock[res];
      if (from.stock[res] >= this.SURPLUS_MIN && to.stock[res] <= this.DEFICIT_MAX && gap > bestGap) { bestGap = gap; pick = { from, to, res }; }
    }
    if (pick && !this.caravans.some((c) => c.from === pick.from && c.to === pick.to)) this.spawnCaravan(pick.from, pick.to, pick.res);
  }
  spawnCaravan(from, to, res) {
    const amt = Math.min(this.TRADE_AMT, from.stock[res] * 0.5);
    if (amt < 4) return;
    from.stock[res] -= amt; // goods loaded onto the caravan now
    const fc = this.nearestCell(from, this.villageCentroid(to)), tc = this.nearestCell(to, this.villageCentroid(from));
    const front = (cell) => { const w = this.worldPos(cell); return { x: w.x, y: w.y + this.B * 0.9 }; };
    const path = this.gridPath(fc, tc).map(front);
    const c = { id: ++this._carId, from, to, res, amt, path, i: 1, wx: path[0].x, wy: path[0].y, phase: this.rnd(0, 6), faceLeft: false,
      head: this.pickArr(this.headKeys), skin: this.pickArr(this.skinTones), hair: this.pickArr(this.hairColors), shirt: this.pickArr(this.shirtColors), cap: this.pickArr(this.capColors), pants: this.pickArr(this.pantsColors),
      state: "go", fade: 1, sayT: this.rnd(0.5, 2), say: "", sayUntil: 0 };
    this.caravans.push(c);
  }
  // The village cell closest to a target world point (so caravans leave from the near edge).
  nearestCell(v, target) { let best = v.cells[0], bd = 1e18; for (const c of v.cells) { const w = this.worldPos(c); const d = (w.x - target.x) ** 2 + ((w.y - target.y) * 2) ** 2; if (d < bd) { bd = d; best = c; } } return best; }
  updateCaravans(dt, t) {
    if (this.paused) return; const sp = Math.max(1, this.speed);
    for (let i = this.caravans.length - 1; i >= 0; i--) {
      const c = this.caravans[i];
      if (c.state === "go") {
        const tgt = c.path[c.i] || c.path[c.path.length - 1];
        const dx = tgt.x - c.wx, dy = tgt.y - c.wy, d = Math.hypot(dx, dy);
        if (d > 2) { const step = Math.min(d, this.caravanSpeed * dt * sp); c.wx += dx / d * step; c.wy += dy / d * step; if (dx < -0.3) c.faceLeft = true; else if (dx > 0.3) c.faceLeft = false; c.phase += dt * 7; }
        else { c.i++; if (c.i >= c.path.length) { c.to.stock[c.res] = Math.min(this.RES_CAP, c.to.stock[c.res] + c.amt); c.state = "done"; c.say = "delivered!"; c.sayUntil = t + 2; } }
        c.sayT -= dt; if (c.sayT <= 0) { c.say = "↦ " + this.resMeta[c.res].label; c.sayUntil = t + 1.8; c.sayT = this.rnd(2.5, 5); }
      } else { c.fade -= dt * 1.6; if (c.fade <= 0) { this.caravans.splice(i, 1); } }
    }
  }

  stepCommute(p, a, ai, dt, t) { if (p.civic) return false; const sp = this.paused ? 0 : this.speed;
    if (!a.commute) { if (p.removing || p.dormant || a.act === "idle" || !this.civics.length || sp <= 0) return false;
      a.commuteT -= dt * sp; if (a.commuteT > 0) return false; a.commuteT = this.rnd(9, 20);
      const civ = this.pickArr(this.civics), slot = civ.slotUsed.indexOf(false);
      if (slot < 0) { a.commuteT = this.rnd(2, 4); return false; } civ.slotUsed[slot] = true;
      const hb = this.worldPos(p.cell), cb = this.worldPos(civ.cell), sl = civ.slots[slot];
      const front = (c) => { const w = this.worldPos(c); return { x: w.x, y: w.y + this.B * 0.92 }; };
      const cells = this.gridPath(p.cell, civ.cell);
      const homeSt = { x: hb.x + a.lx, y: hb.y + a.ly }, civSt = { x: cb.x + sl.x, y: cb.y + sl.y + 6 };
      a.cmOut = [homeSt, ...cells.map(front), civSt];
      a.cmBack = [civSt, ...cells.slice().reverse().map(front), homeSt];
      a.wx = homeSt.x; a.wy = homeSt.y; a.cmI = 1;
      a.commute = { civ, slot, phase: "out", restT: this.rnd(3, 6.5), hLX: a.lx, hLY: a.ly, prev: a.act };
      a.act = civ.kind === "git" ? "commit" : "run"; a.say = ""; return true; }
    if (this.paused) return true;
    const c = a.commute;
    if (c.phase === "work") { a.walking = false; c.restT -= dt * sp; a.sayT -= dt; if (a.sayT <= 0) { a.say = this.pickArr(c.civ.kind === "git" ? ["git commit", "merge ✓", "+ staged", "git push"] : ["$ make", "$ build", "running…", "./run.sh"]); a.sayUntil = t + 2.4; a.sayT = this.rnd(3, 6); } if (c.restT <= 0) { c.phase = "back"; a.cmI = 1; a.say = ""; } a.phase += dt * 2.6; return true; }
    const path = (c.phase === "back") ? a.cmBack : a.cmOut, tgt = path[a.cmI] || path[path.length - 1];
    const dx = tgt.x - a.wx, dy = tgt.y - a.wy, d = Math.hypot(dx, dy);
    if (d > 2) { const step = Math.min(d, this.commuteSpeed * dt * Math.max(1, sp)); a.wx += dx / d * step; a.wy += dy / d * step; a.walking = true; if (dx < -0.3) a.faceLeft = true; else if (dx > 0.3) a.faceLeft = false; }
    else { a.cmI++; if (a.cmI >= path.length) { if (c.phase === "out") { c.phase = "work"; a.say = ""; a.sayT = this.rnd(0.4, 1.6); } else { c.civ.slotUsed[c.slot] = false; a.lx = c.hLX; a.ly = c.hLY; a.act = c.prev; a.commute = null; this.retarget(p, a, ai); a.walking = false; return false; } } }
    a.phase += dt * (a.walking ? 7 : 2.6); return true; }

  update(dt, t) {
    for (let i = this.projects.length - 1; i >= 0; i--) {
      const p = this.projects[i]; p.life += (p.target - p.life) * Math.min(1, dt * 3);
      if (p.civic) continue;
      for (const a of p.agents) this.updateVillager(p, a, dt, t);
      this.ensureResidents(p); this.updateResidents(p, dt, t);
      if (p.removing && p.life < 0.02) { this.removeVillage(p); this.projects.splice(i, 1); }
    }
    this.ensureNPCs(); this.updateNPCs(dt, t);
    this.updateEconomy(dt); this.updateCaravans(dt, t);
  }

  /* ---------- villagers (live agents wandering their village) ---------- */
  // A point for a villager to head to: near a house (its home, or any) or out on the green.
  villagerRetarget(v, a) {
    const g = v.green, span = this.A * (0.42 + 0.42 * v.r);
    if (a.act === "idle") { const h = (v.houses && v.houses.length) ? v.houses[a.homeIdx % v.houses.length] : null; const bx = h ? h.wx : g.wx, by = h ? h.wy : g.wy; a.tx = bx + this.rnd(-9, 9); a.ty = by + this.rnd(8, 16); return; }
    if (v.houses && v.houses.length && Math.random() < 0.6) { const h = this.pickArr(v.houses); a.tx = h.wx + this.rnd(-14, 14); a.ty = h.wy + this.rnd(6, 20); }
    else { a.tx = g.wx + this.rnd(-span, span); a.ty = g.wy + this.rnd(-span * 0.6, span * 0.6); }
  }
  updateVillager(v, a, dt, t) {
    const sp = this.paused ? 0 : Math.max(1, this.speed);
    if (v.removing) { const g = v.green; a.tx = g.wx + this.rnd(-10, 10); a.ty = g.wy + this.B * (v.r + 2); }
    else if (a.tx == null) this.villagerRetarget(v, a);
    const dx = a.tx - a.wx, dy = a.ty - a.wy, d = Math.hypot(dx, dy);
    if (this.paused) return;
    if (d > 2) { const step = Math.min(d, this.villagerSpeed * dt * sp); a.wx += dx / d * step; a.wy += dy / d * step; a.walking = true; if (dx < -0.3) a.faceLeft = true; else if (dx > 0.3) a.faceLeft = false; a.phase += dt * 7; }
    else { a.walking = false; a.phase += dt * (a.act === "idle" ? 1.2 : 3); a.wanderT -= dt; if (a.wanderT <= 0) { this.villagerRetarget(v, a); a.wanderT = this.rnd(3, 7); } }
    if (!a.walking && a.act !== "idle") { a.sayT -= dt; if (a.sayT <= 0) { a.say = a.detail || this.pickArr(this.phrases[a.act === "error" ? "error" : a.act] || ["…"]); a.sayUntil = t + 2.6; a.sayT = this.rnd(4, 9); } }
  }

  /* ---------- residents (ambient NPCs that live in a village, not agents) ---------- */
  ensureResidents(v) {
    const want = v.removing ? 0 : (v.dormant ? Math.min(2, v.residentTarget) : v.residentTarget);
    let n = 0; while (v.residents.length < want && n++ < 2) this.spawnResident(v);
    if (v.residents.length > want) v.residents.length = want;
  }
  spawnResident(v) {
    const g = v.green, span = this.A * (0.5 + 0.42 * v.r);
    const n = { id: ++this._npcId, head: this.pickArr(this.headKeys), skin: this.pickArr(this.npcSkin), hair: this.pickArr(this.npcHair), shirt: this.pickArr(this.npcShirt), cap: this.pickArr(this.npcCap), pants: this.pickArr(this.npcPants),
      wx: g.wx + this.rnd(-span, span), wy: g.wy + this.rnd(-span * 0.6, span * 0.6), tx: 0, ty: 0,
      state: "walk", task: "stroll", taskT: 0, phase: this.rnd(0, 6), faceLeft: Math.random() < 0.5, spd: this.rnd(0.7, 1.2), emote: "", emoteUntil: 0, emoteT: this.rnd(2, 8) };
    this.residentRetarget(v, n); v.residents.push(n);
  }
  residentRetarget(v, n) {
    n.state = "walk";
    if (v.houses && v.houses.length && Math.random() < 0.6) { const h = this.pickArr(v.houses); n.tx = h.wx + this.rnd(-14, 14); n.ty = h.wy + this.rnd(8, 22); }
    else { const g = v.green, span = this.A * (0.5 + 0.42 * v.r); n.tx = g.wx + this.rnd(-span, span); n.ty = g.wy + this.rnd(-span * 0.6, span * 0.6); }
  }
  updateResidents(v, dt, t) {
    if (this.paused) return; const sp = Math.max(1, this.speed);
    for (const n of v.residents) {
      if (n.state === "walk") {
        const dx = n.tx - n.wx, dy = n.ty - n.wy, d = Math.hypot(dx, dy);
        if (d > 2) { const step = Math.min(d, this.residentSpeed * n.spd * dt * sp); n.wx += dx / d * step; n.wy += dy / d * step; if (dx < -0.3) n.faceLeft = true; else if (dx > 0.3) n.faceLeft = false; n.phase += dt * 7; }
        else if (Math.random() < 0.4) this.residentRetarget(v, n);
        else { n.task = this.pickArr(["gaze", "rest", "chat", "tend", "stroll"]); if (n.task === "stroll") this.residentRetarget(v, n); else { n.state = "task"; n.taskT = this.rnd(2.5, 6); n.emoteT = this.rnd(0.3, 1.6); } }
      } else { n.taskT -= dt * sp; n.phase += dt * (n.task === "rest" ? 1.4 : 2.4); if (n.taskT <= 0) this.residentRetarget(v, n); }
      n.emoteT -= dt; if (n.emoteT <= 0) { if (n.state !== "walk") { n.emote = this.pickArr(this.npcEmotes[n.task] || this.npcEmotes.stroll); n.emoteUntil = t + 2.4; } n.emoteT = this.rnd(4, 11); }
    }
  }

  /* ---------- townsfolk (ambient NPCs) ---------- */
  // Walkable commons = the park infill + beach ring (cached against the land signature).
  npcWalkable() {
    if (this._npcWalkSig === this._landSig && this._npcWalk) return this._npcWalk;
    const out = [], pois = [], land = this._land || {};
    for (const k in land) { const e = land[k]; if (e.park || e.beach) { out.push(k); if (e.poi && this.npcDestTask[e.poi]) pois.push({ key: k, kind: e.poi }); } }
    this._npcWalk = out; this._npcPOI = pois; this._npcWalkSig = this._landSig; return out;
  }
  ensureNPCs() {
    const walk = this.npcWalkable();
    if (!walk.length) { if (this.npcs.length) this.npcs.length = 0; this.npcTarget = 0; return; }
    this.npcTarget = Math.max(3, Math.min(18, Math.round(walk.length * 0.5)));
    let n = 0; while (this.npcs.length < this.npcTarget && n++ < 3) this.spawnNPC(walk); // ramp in a few/frame
    if (this.npcs.length > this.npcTarget) this.npcs.length = this.npcTarget;
  }
  spawnNPC(walk) {
    const [cx, cy] = this.pickArr(walk).split(",").map(Number), w = this.worldPos({ cx, cy });
    const n = { id: ++this._npcId,
      head: this.pickArr(this.headKeys), skin: this.pickArr(this.npcSkin), hair: this.pickArr(this.npcHair),
      shirt: this.pickArr(this.npcShirt), cap: this.pickArr(this.npcCap), pants: this.pickArr(this.npcPants),
      wx: w.x + this.rnd(-this.A * 0.35, this.A * 0.35), wy: w.y + this.rnd(-this.B * 0.35, this.B * 0.35),
      tx: 0, ty: 0, state: "walk", task: "stroll", taskT: 0, phase: this.rnd(0, 6),
      faceLeft: Math.random() < 0.5, spd: this.rnd(0.7, 1.25), emote: "", emoteUntil: 0, emoteT: this.rnd(2, 8) };
    this.npcPickTarget(n, walk); this.npcs.push(n);
  }
  npcPickTarget(n, walk) {
    walk = walk || this.npcWalkable(); if (!walk.length) { n.tx = n.wx; n.ty = n.wy; n.state = "task"; n.taskT = 2; n.dest = null; return; }
    const pois = this._npcPOI || [];
    if (pois.length && Math.random() < 0.5) { const poi = this.pickArr(pois), [cx, cy] = poi.key.split(",").map(Number), w = this.worldPos({ cx, cy });
      n.tx = w.x + this.rnd(-this.A * 0.18, this.A * 0.18); n.ty = w.y + this.rnd(-this.B * 0.18, this.B * 0.18); n.dest = poi.kind; n.state = "walk"; return; }
    const [cx, cy] = this.pickArr(walk).split(",").map(Number), w = this.worldPos({ cx, cy });
    n.tx = w.x + this.rnd(-this.A * 0.4, this.A * 0.4); n.ty = w.y + this.rnd(-this.B * 0.4, this.B * 0.4); n.dest = null; n.state = "walk";
  }
  updateNPCs(dt, t) {
    if (this.paused) return; const sp = Math.max(1, this.speed);
    for (const n of this.npcs) {
      if (n.state === "walk") {
        const dx = n.tx - n.wx, dy = n.ty - n.wy, d = Math.hypot(dx, dy);
        if (d > 2) { const step = Math.min(d, this.npcSpeed * n.spd * dt * sp); n.wx += dx / d * step; n.wy += dy / d * step; if (dx < -0.3) n.faceLeft = true; else if (dx > 0.3) n.faceLeft = false; n.phase += dt * 7; }
        else if (n.dest && this.npcDestTask[n.dest]) { n.task = this.npcDestTask[n.dest]; n.dest = null; n.state = "task"; n.taskT = this.rnd(3, 7); n.emoteT = this.rnd(0.3, 1.5); } // use the POI
        else if (Math.random() < 0.3) { this.npcPickTarget(n); } // keep ambling
        else { const c = this.worldToCell(n.wx, n.wy), e = (this._land || {})[c.cx + "," + c.cy], beach = e && e.beach;
          n.task = this.pickArr(beach ? ["gaze", "fish", "chat", "stroll"] : ["gaze", "rest", "chat", "stroll"]);
          if (n.task === "stroll") this.npcPickTarget(n);
          else { n.state = "task"; n.taskT = this.rnd(2.5, 6.5); n.emoteT = this.rnd(0.3, 1.8); } }
      } else { n.taskT -= dt * sp; n.phase += dt * (n.task === "rest" ? 1.4 : 2.4); if (n.taskT <= 0) this.npcPickTarget(n); }
      n.emoteT -= dt;
      if (n.emoteT <= 0) { if (n.state !== "walk") { n.emote = this.pickArr(this.npcEmotes[n.task] || this.npcEmotes.stroll); n.emoteUntil = t + 2.4; } n.emoteT = this.rnd(4, 11); }
    }
  }
  drawNPC(ctx, x, y, n, t) {
    const z = this.cam.z, sc = Math.max(0.8, Math.min(1.35, z)) * 0.9, walking = n.state === "walk";
    const bob = walking ? Math.abs(Math.sin(n.phase)) * -1.5 * sc : Math.sin(n.phase) * (n.task === "rest" ? -0.4 : -0.6) * sc;
    this.drawPerson(ctx, x, y, n, sc, n.phase, "think", n.faceLeft, bob);
    if (n.task === "fish" && !walking) { const hx = x + (n.faceLeft ? -5 : 5) * z, hy = y - 9 * z, ex = hx + (n.faceLeft ? -11 : 11) * z, ey = hy + 9 * z;
      ctx.strokeStyle = "#caa86a"; ctx.lineWidth = 1 * z; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(ex, ey); ctx.stroke(); this.ell(ctx, ex, ey + 1 * z, 1.1 * z, 0.7 * z, "#e7f0f2"); }
    if (n.emote && t < n.emoteUntil && !walking) this.speech(ctx, x, y - 18 * sc + bob - 4 * z, n.emote);
  }

  /* ---------- camera ---------- */
  project(w) { return { x: this._vcx + (w.x - this.cam.x) * this.cam.z, y: this._vcy + (w.y - this.cam.y) * this.cam.z }; }
  updateCamera(dt) { const live = this.projects.filter(p => p.life > 0.05); if (!live.length) return; let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    for (const p of live) for (const c of (p.cells || [p.cell])) { const w = this.worldPos(c); minx = Math.min(minx, w.x); maxx = Math.max(maxx, w.x); miny = Math.min(miny, w.y); maxy = Math.max(maxy, w.y); }
    const pad = 180; const bw = (maxx - minx) + pad * 2, bh = (maxy - miny) + pad * 2; const availW = this._W - 250 - this.leftGutter, availH = this._H - 30;
    let tz = Math.min(availW / bw, availH / bh); tz = Math.max(0.5, Math.min(1.05, tz)); const tx = (minx + maxx) / 2, ty = (miny + maxy) / 2; const k = 1 - Math.pow(0.0002, dt);
    this.cam.x += (tx - this.cam.x) * k; this.cam.y += (ty - this.cam.y) * k; this.cam.z += (tz - this.cam.z) * k; }

  _initControls() {
    const cv = this.canvas;
    cv.addEventListener("wheel", (e) => {
      e.preventDefault(); this.userControlled = true;
      if (e.ctrlKey) { const r = cv.getBoundingClientRect(); this.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.01)); }
      else { this.cam.x += e.deltaX / this.cam.z; this.cam.y += e.deltaY / this.cam.z; }
    }, { passive: false });
    let drag = false, lx = 0, ly = 0;
    cv.addEventListener("pointerdown", (e) => { drag = true; this._hoverPos = null; lx = e.clientX; ly = e.clientY; try { cv.setPointerCapture(e.pointerId); } catch {} });
    cv.addEventListener("pointermove", (e) => {
      const r = cv.getBoundingClientRect(); this._hoverPos = { x: e.clientX - r.left, y: e.clientY - r.top }; // for hover tooltips
      if (!drag) return; this.userControlled = true; this.cam.x -= (e.clientX - lx) / this.cam.z; this.cam.y -= (e.clientY - ly) / this.cam.z; lx = e.clientX; ly = e.clientY;
    });
    const end = () => (drag = false); cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
    cv.addEventListener("pointerleave", () => { this._hoverPos = null; });
    window.addEventListener("keydown", (e) => {
      if (e.key === "f" || e.key === "F") { this.userControlled = false; return; }
      const f = (e.key === "+" || e.key === "=") ? 1.18 : (e.key === "-" || e.key === "_") ? 0.85 : 0;
      if (!f) return; this.userControlled = true; this.zoomAt(this._vcx, this._vcy, f);
    });
  }
  zoomAt(sx, sy, factor) { const z = this.cam.z, z2 = Math.max(0.3, Math.min(2.5, z * factor)); this.cam.x += (sx - this._vcx) * (1 / z - 1 / z2); this.cam.y += (sy - this._vcy) * (1 / z - 1 / z2); this.cam.z = z2; }

  /* ---------- background ---------- */
  rebuildBg() { const w = this.world(); this._bg = {};
    if (w.bg.stars) { const s = []; for (let i = 0; i < 150; i++)s.push({ x: Math.random(), y: Math.random(), r: Math.random() < 0.85 ? 1 : 2, a: this.rnd(0.3, 1), tw: Math.random() * 6 }); this._bg.stars = s; }
    if (w.bg.board) { const tr = []; for (let i = 0; i < 28; i++)tr.push({ x: Math.random(), y: Math.random(), len: this.rnd(0.06, 0.22), dir: Math.random() < 0.5 ? 0 : 1, bend: Math.random() < 0.5 }); this._bg.traces = tr; } }
  // The static background (gradient/glow/grid/water-pool) is expensive and unchanging —
  // render it once to an offscreen canvas and blit it each frame.
  ensureStaticBg() {
    const key = this.state.world + "|" + this.todState + "|" + this._townW + "|" + this._townH + "|" + this._dpr;
    if (this._sbgKey === key && this._sbg) return;
    if (!this._sbg) this._sbg = document.createElement("canvas");
    const W = this._townW, H = this._townH, dpr = this._dpr;
    const cv = this._sbg; cv.width = Math.max(1, Math.round(W * dpr)); cv.height = Math.max(1, Math.round(H * dpr));
    const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.imageSmoothingEnabled = false;
    this.drawStaticBg(ctx, W, H);
    this._sbgKey = key;
  }
  drawStaticBg(ctx, W, H) { const w = this.world();
    if (w.cozy) { const tod = this.todParams(); const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, tod.sky[0]); g.addColorStop(0.55, tod.sky[1]); g.addColorStop(1, tod.sky[2]); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      if (tod.star > 0.05) { for (let i = 0; i < 90; i++) { const sx = (i * 97 % W), sy = (i * 53 % Math.round(H * 0.55)); ctx.fillStyle = "rgba(232,240,255," + (tod.star * (0.28 + 0.5 * ((i * 31 % 100) / 100))).toFixed(2) + ")"; ctx.fillRect(sx, sy, i % 7 === 0 ? 2 : 1, i % 7 === 0 ? 2 : 1); } }
      if (this.todState === "dusk") { this.ell(ctx, (W - 250) * 0.78, H * 0.2, 14, 14, "rgba(240,200,150,0.5)"); this.ell(ctx, (W - 250) * 0.78, H * 0.2, 9, 9, "rgba(248,224,178,0.85)"); }
      if (this.todState === "night") { this.ell(ctx, (W - 250) * 0.8, H * 0.16, 11, 11, "rgba(230,236,248,0.5)"); this.ell(ctx, (W - 250) * 0.8, H * 0.16, 7.5, 7.5, "rgba(240,244,252,0.92)"); this.ell(ctx, (W - 250) * 0.8 + 3, H * 0.16 - 2, 5, 5, this.shade(tod.sky[1], 1.15)); } }
    else { ctx.fillStyle = w.bg.top; ctx.fillRect(0, 0, W, H); }
    if (w.bg.sky) { const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#20335a"); g.addColorStop(0.6, "#16233c"); g.addColorStop(1, "#101a2e"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
    if (w.bg.board && this._bg.traces) { ctx.strokeStyle = "rgba(60,150,90,0.18)"; ctx.lineWidth = 2; for (const tr of this._bg.traces) { const x = tr.x * W, y = tr.y * H, L = tr.len * W; ctx.beginPath(); if (tr.dir === 0) { ctx.moveTo(x, y); ctx.lineTo(x + L, y); if (tr.bend) ctx.lineTo(x + L, y + L * 0.5); } else { ctx.moveTo(x, y); ctx.lineTo(x, y + L); if (tr.bend) ctx.lineTo(x + L * 0.5, y + L); } ctx.stroke(); ctx.fillStyle = "rgba(120,200,140,0.22)"; ctx.fillRect(x - 2, y - 2, 4, 4); } }
    if (w.bg.grid) { ctx.strokeStyle = "rgba(120,80,170,0.07)"; ctx.lineWidth = 1; const g = 64; for (let i = -H; i < W + H; i += g) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + H, H); ctx.stroke(); ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i - H, H); ctx.stroke(); } }
    this.ell(ctx, (W - 250) / 2, H * 0.5, W * 0.5, H * 0.42, w.bg.glow);
    if (this.state.world === "harbor") { const cx = (W - 250) / 2, cy = H * 0.52;
      this.ell(ctx, cx, cy + 24, W * 0.46, H * 0.34, "rgba(46,110,120,0.16)");
      this.ell(ctx, cx, cy + 24, W * 0.33, H * 0.23, "rgba(64,138,142,0.14)"); }
  }
  drawAnimatedBg(ctx) { const w = this.world(), W = this._W, H = this._H, tt = performance.now() / 1000;
    if (w.bg.stars && this._bg.stars) { for (const s of this._bg.stars) { const a = s.a * (0.6 + 0.4 * Math.sin(tt + s.tw)); ctx.fillStyle = "rgba(220,230,255," + a.toFixed(2) + ")"; ctx.fillRect(Math.round(s.x * W), Math.round(s.y * H), s.r, s.r); } }
    if (w.cozy) {
      ctx.lineWidth = 1.4; for (let i = 0; i < 16; i++) { const yy = (i / 16) * H + Math.sin(tt * 0.5 + i) * 4; ctx.strokeStyle = "rgba(150,205,208," + (0.05 + 0.03 * Math.sin(tt + i)).toFixed(3) + ")"; ctx.beginPath(); for (let xx = 0; xx <= W; xx += 26) { const yo = Math.sin(xx * 0.018 + tt * 0.7 + i) * 2.2; xx === 0 ? ctx.moveTo(xx, yy + yo) : ctx.lineTo(xx, yy + yo); } ctx.stroke(); }
      this.drawBoat(ctx, W * 0.15, H * 0.2, tt, 0); this.drawBoat(ctx, W * 0.82, H * 0.74, tt, 1);
    }
    if (this.state.world === "harbor") { const cx = (W - 250) / 2, cy = H * 0.52;
      ctx.strokeStyle = "rgba(150,205,208,0.09)"; ctx.lineWidth = 1.5;
      for (let i = 0; i < 7; i++) { const yy = cy - 66 + i * 34 + Math.sin(tt + i) * 3, xw = W * 0.30 * (1 - Math.abs(i - 3) / 5.5); ctx.beginPath(); ctx.moveTo(cx - xw, yy); ctx.lineTo(cx - xw * 0.45, yy); ctx.moveTo(cx + xw * 0.45, yy); ctx.lineTo(cx + xw, yy); ctx.stroke(); }
      this.drawBoat(ctx, cx - W * 0.33, cy + 6, tt, 0); this.drawBoat(ctx, cx + W * 0.31, cy + 44, tt, 1); this.drawBoat(ctx, cx - W * 0.10, cy + H * 0.33, tt, 2);
      ctx.strokeStyle = "rgba(222,227,232,0.5)"; ctx.lineWidth = 1.6; for (let i = 0; i < 3; i++) { const gx = cx - W * 0.22 + ((tt * 16 + i * 150) % (W * 0.5)), gy = H * 0.13 + i * 24 + Math.sin(tt * 1.5 + i) * 5; ctx.beginPath(); ctx.moveTo(gx - 5, gy); ctx.quadraticCurveTo(gx, gy - 3.5, gx + 1, gy); ctx.quadraticCurveTo(gx + 2, gy - 3.5, gx + 7, gy); ctx.stroke(); } }
  }
  rebuildBgInvalidate() { this._sbgKey = null; }
  drawBoat(ctx, x, y, t, i) { const sc = 1.15, bob = Math.sin(t * 1.2 + i) * 2; y += bob;
    this.ell(ctx, x, y + 5 * sc, 12 * sc, 3 * sc, "rgba(0,0,0,0.14)");
    this.poly(ctx, [[x - 11 * sc, y], [x + 11 * sc, y], [x + 7 * sc, y + 5 * sc], [x - 7 * sc, y + 5 * sc]], "#8a5a3a"); this.poly(ctx, [[x - 11 * sc, y], [x + 11 * sc, y], [x + 9 * sc, y - 1.5 * sc], [x - 9 * sc, y - 1.5 * sc]], "#a06a44");
    ctx.fillStyle = "#6b4a2e"; ctx.fillRect(x - 0.8 * sc, y - 16 * sc, 1.6 * sc, 16 * sc);
    this.poly(ctx, [[x + 1 * sc, y - 15 * sc], [x + 1 * sc, y - 2 * sc], [x + 9 * sc, y - 3.5 * sc]], "#f0e6d2");
    ctx.fillStyle = "#d97757"; ctx.fillRect(x - 0.8 * sc, y - 18 * sc, 4 * sc, 2 * sc); }

  /* ---------- ground (connected) ---------- */
  computeLand(live) { const occ = {}; for (const p of live) for (const c of (p.cells || [p.cell])) occ[c.cx + "," + c.cy] = p; const land = {}; for (const k in occ)land[k] = { park: false, p: occ[k] };
    const cand = new Set(); for (const k in occ) { const [cx, cy] = k.split(",").map(Number); for (const d of this.edge4) { const nk = (cx + d[0]) + "," + (cy + d[1]); if (!occ[nk]) cand.add(nk); } }
    // Every empty cell touching the cluster becomes parkland — a green belt wraps the town
    // (and fills any interior holes), giving fountains/benches/gardens somewhere to live.
    for (const nk of cand) land[nk] = { park: true, p: null };
    if (this.world().cozy || this.world().bg.sky) { const ring = new Set(); const d8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]; for (const k in land) { const [cx, cy] = k.split(",").map(Number); for (const d of d8) { const nk = (cx + d[0]) + "," + (cy + d[1]); if (!land[nk]) ring.add(nk); } } for (const nk of ring) land[nk] = { beach: true, p: null }; }
    // Decorate the commons with stable points of interest (parks lush, beach sparse).
    const parkPoi = ["tree", "tree", "garden", "bench", "lamp", "fountain", "statue", "cafe"];
    for (const k in land) { const e = land[k]; if (e.p) continue; const h = this.hashStr("poi:" + k);
      if (e.park) e.poi = parkPoi[h % parkPoi.length];
      else if (e.beach) { const r = h % 7; e.poi = r === 0 || r === 4 ? "umbrella" : r === 1 ? "sandcastle" : r === 2 ? "cafe" : null; } }
    return { occ, land }; }
  drawGround(ctx, land) { const w = this.world(), pal = w.pal, z = this.cam.z, a = this.A * z, b = this.B * z, Td = 8 * z, tt = performance.now() / 1000; const gf = w.style === "cozy" ? this.todParams().grassF : 1;
    const keys = Object.keys(land).sort((u, v) => { const A = u.split(",").map(Number), B = v.split(",").map(Number); return (A[0] + A[1]) - (B[0] + B[1]); });
    for (const k of keys) { const cell = { cx: +k.split(",")[0], cy: +k.split(",")[1] }; const e = land[k]; const s = this.project(this.worldPos(cell)); const al = e.p ? Math.min(1, e.p.life * 1.2) : 1; ctx.globalAlpha = al;
      const T = [s.x, s.y - b], R = [s.x + a, s.y], Bm = [s.x, s.y + b], L = [s.x - a, s.y];
      const at = (dx, dy) => land[(cell.cx + dx) + "," + (cell.cy + dy)];
      if (e.beach) {
        if (!at(1, 0)) this.poly(ctx, [R, Bm, [Bm[0], Bm[1] + Td * 0.5], [R[0], R[1] + Td * 0.5]], this.shade("#caa86a", 0.66));
        if (!at(0, 1)) this.poly(ctx, [Bm, L, [L[0], L[1] + Td * 0.5], [Bm[0], Bm[1] + Td * 0.5]], this.shade("#caa86a", 0.58));
        this.poly(ctx, [T, R, Bm, L], this.tint("#cdb98f", 0.05));
        ctx.strokeStyle = "rgba(232,242,240," + (0.28 + 0.18 * Math.sin(tt * 1.4 + cell.cx + cell.cy)).toFixed(2) + ")"; ctx.lineWidth = 1.6 * z;
        if (!at(1, 0)) { ctx.beginPath(); ctx.moveTo(R[0], R[1]); ctx.lineTo(Bm[0], Bm[1]); ctx.stroke(); }
        if (!at(0, 1)) { ctx.beginPath(); ctx.moveTo(Bm[0], Bm[1]); ctx.lineTo(L[0], L[1]); ctx.stroke(); }
        const hh = ((cell.cx * 7 + cell.cy * 13) % 5 + 5) % 5; if (hh < 2) this.ell(ctx, s.x + (hh ? -6 : 5) * z, s.y + 2 * z, 1.7 * z, 1.1 * z, "#9a8460");
        if (e.poi) this.drawPOI(ctx, e.poi, s.x, s.y, z, tt, cell);
        ctx.globalAlpha = 1; continue; }
      if (!at(1, 0)) this.poly(ctx, [R, Bm, [Bm[0], Bm[1] + Td], [R[0], R[1] + Td]], this.shade(pal.gSide, 0.85 * gf));
      if (!at(0, 1)) this.poly(ctx, [Bm, L, [L[0], L[1] + Td], [Bm[0], Bm[1] + Td]], this.shade(pal.gSide, gf));
      const paved = w.dark ? this.tint(pal.plaza, 0.16) : this.tint(pal.road, 0.5);
      const occFill = (w.style === "cozy" && e.p) ? this.shade(pal.gTop, 0.86 * gf) : (e.park ? this.shade(pal.gTop, 0.92 * gf) : paved);
      this.poly(ctx, [T, R, Bm, L], occFill);
      if (e.park) { if (w.cozy) { if (e.poi) this.drawPOI(ctx, e.poi, s.x, s.y, z, tt, cell); }
        else { this.ell(ctx, s.x, s.y, 4 * z, 3 * z, this.shade(pal.gTop, 0.7)); this.ell(ctx, s.x, s.y - 4 * z, 5 * z, 5 * z, this.tint(pal.gTop, 0.15)); } }
      if (e.p && !e.park && w.style !== "cozy") { ctx.strokeStyle = this.rgbaA(pal.gSide, 0.5); ctx.lineWidth = 1 * z; ctx.beginPath(); ctx.moveTo(L[0], L[1]); ctx.lineTo(Bm[0], Bm[1]); ctx.lineTo(R[0], R[1]); ctx.stroke();
        ctx.strokeStyle = this.rgbaA(pal.gSide, 0.22); ctx.beginPath(); ctx.moveTo(T[0], T[1]); ctx.lineTo(s.x, s.y); ctx.lineTo(Bm[0], Bm[1]); ctx.moveTo(L[0], L[1]); ctx.lineTo(s.x, s.y); ctx.lineTo(R[0], R[1]); ctx.stroke(); }
      ctx.globalAlpha = 1; } }

  /* ---------- agents: pixel citizens ---------- */
  drawWalker(ctx, x, y, a, t) { const z = this.cam.z, ac = this.acts[a.act].color;
    if (a.act === "idle" && !a.walking && !this.isCozy) { this.drawBed(ctx, x, y, a, t, z); return; } // cozy idle = stand in the yard w/ Zzz
    const sc = Math.max(0.85, Math.min(1.45, z));
    const bob = a.walking ? Math.abs(Math.sin(a.phase)) * -1.7 * sc : Math.sin(a.phase) * -0.7 * sc;
    this.drawPerson(ctx, x, y, a, sc, a.phase, a.act, a.faceLeft, bob);
    this.ell(ctx, x + 4.5 * z, y - 0.3 * z, 1.5 * z, 1 * z, this.factions[a.faction]);
    const headTop = y - 18 * sc + bob;
    if (a.say && t < a.sayUntil && !a.walking) { this.speech(ctx, x, headTop - 4 * z, a.say); }
    else { const g = this.glyphCv(this.acts[a.act].glyph, ac, z > 0.8 ? 2 : 1); const gy = headTop - g.height - 5 * z; this.ell(ctx, x, gy + g.height * 0.5, 5.5 * z, 4.4 * z, "rgba(12,13,18,0.55)"); ctx.drawImage(g, Math.round(x - g.width / 2), Math.round(gy)); } }
  speech(ctx, x, by, text) { ctx.font = "600 9px 'JetBrains Mono',monospace"; ctx.textBaseline = "middle"; ctx.textAlign = "left"; const tw = ctx.measureText(text).width; const w = tw + 10, h = 14, bx = x - w / 2, y2 = by - h; ctx.fillStyle = "#f3efe6"; ctx.fillRect(bx, y2, w, h); ctx.fillStyle = "#cdb98f"; ctx.fillRect(bx, y2 + h - 1, w, 1); this.poly(ctx, [[x - 3, by], [x + 3, by], [x, by + 4]], "#f3efe6"); ctx.fillStyle = "#2a2630"; ctx.fillText(text, bx + 5, y2 + h / 2); }
  drawFurniture(ctx, x, y, act, t) { const z = this.cam.z; this.ell(ctx, x, y + 2 * z, 9 * z, 3.4 * z, "rgba(0,0,0,0.2)");
    const mon = (bg, fg, blink) => { this.box(ctx, x + 1.4 * z, y - 0.5 * z, 3 * z, 1.8 * z, 5.6 * z, "#2b313b", "#23272f", { win: false }); ctx.fillStyle = bg; ctx.fillRect(x - 1 * z, y - 9 * z, 5 * z, 3.4 * z); ctx.fillStyle = fg; ctx.fillRect(x - 0.4 * z, y - 8.4 * z, 1.6 * z, 0.8 * z); if (!blink || Math.floor(t * 3) % 2) ctx.fillRect(x + 1.4 * z, y - 8.4 * z, 1.6 * z, 0.8 * z); ctx.fillRect(x - 0.4 * z, y - 7.2 * z, 3 * z, 0.8 * z); };
    switch (act) {
      case "read": this.box(ctx, x, y, 5 * z, 3 * z, 12 * z, "#6b4a2e", "#5a3f28", { win: false }); { const cols = ["#c9543f", "#4f8fe0", "#e0a23c", "#56b870"]; for (let r = 0; r < 3; r++)for (let c = 0; c < 3; c++) { ctx.fillStyle = cols[(r * 3 + c) % 4]; ctx.fillRect(x - 3.6 * z + c * 2.6 * z, y - 11 * z + r * 3.4 * z, 2 * z, 2.6 * z); } } break;
      case "edit": this.box(ctx, x, y, 6 * z, 3.4 * z, 4 * z, "#7a5a3a", "#8a6a46", { win: false }); mon("#10141b", "#e0a23c", false); break;
      case "run": this.box(ctx, x, y, 6 * z, 3.4 * z, 4 * z, "#3a3030", "#2a2424", { win: false }); mon("#08120e", "#46e07a", true); break;
      case "error": this.box(ctx, x, y, 6 * z, 3.4 * z, 4 * z, "#3a3030", "#2a2424", { win: false }); mon("#2a0e0e", "#d96b5a", true); if (Math.floor(t * 4) % 2) { ctx.fillStyle = "#ffcf6a"; this.ell(ctx, x + 3.4 * z, y - 10 * z, 1 * z, 1 * z, "#ffcf6a"); } break;
      case "search": this.box(ctx, x, y, 6.5 * z, 3.6 * z, 3.5 * z, "#7a5a3a", "#8a6a46", { win: false }); ctx.fillStyle = "#cdbb90"; ctx.fillRect(x - 4 * z, y - 7 * z, 8 * z, 3.6 * z); ctx.strokeStyle = "#8a6a4a"; ctx.lineWidth = 0.7 * z; ctx.strokeRect(x - 4 * z, y - 7 * z, 8 * z, 3.6 * z); this.ell(ctx, x + 2.5 * z, y - 8.5 * z, 1.8 * z, 1.8 * z, "#5a8fd6"); break;
      case "think": this.box(ctx, x, y, 1.6 * z, 1 * z, 1.6 * z, "#6b5a44", "#5a4030", { win: false }); ctx.fillStyle = "#e8e8ee"; ctx.fillRect(x - 5 * z, y - 13 * z, 10 * z, 8 * z); ctx.strokeStyle = "#9b7cf0"; ctx.lineWidth = 0.8 * z; ctx.beginPath(); ctx.moveTo(x - 3.5 * z, y - 9 * z); ctx.lineTo(x - 0.5 * z, y - 11 * z); ctx.lineTo(x + 2 * z, y - 7 * z); ctx.stroke(); break;
      case "wait": this.box(ctx, x, y, 6 * z, 3.4 * z, 5 * z, "#8a6a4a", "#6b4a2e", { win: false }); ctx.fillStyle = "#f3efe6"; ctx.fillRect(x - 3 * z, y - 9 * z, 6 * z, 2.6 * z); ctx.fillStyle = "#e07a4a"; ctx.font = "bold " + Math.round(4 * z) + "px 'JetBrains Mono',monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("?", x, y - 7.7 * z); break;
    } }
  drawPerson(ctx, x, feet, a, scale, phase, act, faceLeft, bobO) { const sp = this.sprite(a); const w = sp.width * scale / 2, h = sp.height * scale / 2; const bob = (bobO != null) ? bobO : ((act === "think") ? Math.sin(phase) * -1 * scale : Math.abs(Math.sin(phase * 1.3)) * -1.4 * scale);
    this.ell(ctx, x, feet, w * 0.42, 2.4 * scale, "rgba(0,0,0,0.28)"); const dx = Math.round(x - w / 2), dy = Math.round(feet - h + bob);
    if (faceLeft) { ctx.save(); ctx.translate(2 * x, 0); ctx.scale(-1, 1); ctx.drawImage(sp, dx, dy, Math.round(w), Math.round(h)); ctx.restore(); } else ctx.drawImage(sp, dx, dy, Math.round(w), Math.round(h)); }
  drawBed(ctx, x, y, a, t, z) { const pc = a.shirt || this.factions[a.faction];
    this.ell(ctx, x, y + 2 * z, 11 * z, 4 * z, "rgba(0,0,0,0.26)");
    this.box(ctx, x, y, 9 * z, 5 * z, 3 * z, "#6b4a2e", "#5a3f28", { win: false });
    this.poly(ctx, [[x - 9 * z, y - 3 * z], [x, y - 3 * z + 2.5 * z], [x + 2 * z, y - 3 * z + 1.5 * z], [x - 3 * z, y - 6 * z]], this.shade(pc, 0.8));
    this.poly(ctx, [[x - 3 * z, y - 6 * z], [x + 2 * z, y - 1.5 * z], [x + 9 * z, y - 3 * z], [x + 5 * z, y - 7 * z]], pc);
    this.ell(ctx, x + 6 * z, y - 4.5 * z, 3 * z, 2.2 * z, "#f0e6d2"); this.ell(ctx, x + 6 * z, y - 5.5 * z, 2 * z, 2 * z, a.skin || "#e8b48c");
    ctx.fillStyle = "rgba(180,190,205," + (0.5 + 0.4 * Math.sin(t * 3)).toFixed(2) + ")"; ctx.font = "bold " + Math.round(7 * z) + "px 'JetBrains Mono',monospace"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    const zb = (Math.sin(t * 2) * 2); ctx.fillText("z", x + 8 * z, y - 9 * z + zb); ctx.fillText("z", x + 11 * z, y - 13 * z + zb * 0.6); }

  // Lit windows mapped onto a wall face (base edge b0→b1, rising by `wh`), one band per floor.
  faceWindows(ctx, b0, b1, wh, floors, p, t, skipDoor, active, cozy) {
    if (active === undefined) active = true;
    const pal = this.world().pal, z = this.cam.z, rc = this.world().roof || pal.wallB, tod = cozy ? this.todParams() : null;
    const t0 = [b0[0], b0[1] - wh], t1 = [b1[0], b1[1] - wh];
    const lp = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    const pt = (u, v) => lp(lp(b0, b1, u), lp(t0, t1, u), v);
    for (let f = 0; f < floors; f++) {
      const vc = (f + 0.55) / floors, vh = Math.min(0.26, 0.32 / floors), uw = 0.08;
      const cols = (f === 0 && skipDoor) ? [0.26, 0.82] : [0.26, 0.54, 0.82];
      for (const u of cols) {
        const a = pt(u - uw, vc - vh), b = pt(u + uw, vc - vh), c = pt(u + uw, vc + vh), d = pt(u - uw, vc + vh);
        const h = this.hashStr(p.name + "w" + f + u), litPat = (h % 5) !== 0, flick = litPat && (h % 11 === 0) && (Math.floor(t * 1.3 + h) % 2 === 0);
        // Cozy windows only glow when the house has working agents ("glowing windows = active").
        const on = litPat && !flick && (cozy ? active : true);
        if (cozy && on && tod.glow > 0.3) { const cc = pt(u, vc); ctx.save(); ctx.globalAlpha = 0.34 * tod.glow; this.ell(ctx, cc[0], cc[1], 5 * z, 4.2 * z, pal.window); ctx.restore(); }
        this.poly(ctx, [a, b, c, d], !on ? (cozy ? this.shade("#26344a", tod.amb) : "#1b2330") : this.rgbaA(pal.window, cozy ? (0.5 + 0.45 * tod.glow) : 0.82));
        ctx.strokeStyle = this.shade(rc, 0.6); ctx.lineWidth = 0.7 * z; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath(); ctx.stroke();
        if (cozy) { // cottage cross-frame muntins
          const mv0 = pt(u, vc - vh), mv1 = pt(u, vc + vh), mh0 = pt(u - uw, vc), mh1 = pt(u + uw, vc);
          ctx.strokeStyle = this.shade("#5b3f28", tod.amb); ctx.lineWidth = 0.6 * z; ctx.beginPath(); ctx.moveTo(mv0[0], mv0[1]); ctx.lineTo(mv1[0], mv1[1]); ctx.moveTo(mh0[0], mh0[1]); ctx.lineTo(mh1[0], mh1[1]); ctx.stroke();
          if (f === 0) { // window box with flowers
            const e0 = pt(u - uw, vc + vh), e1 = pt(u + uw, vc + vh);
            this.poly(ctx, [e0, e1, [e1[0], e1[1] + 3 * z], [e0[0], e0[1] + 3 * z]], this.shade("#6e4a2c", tod.amb));
            for (let fi = 0; fi < 3; fi++) { const fx = e0[0] + (e1[0] - e0[0]) * (0.22 + fi * 0.28), fy = e0[1] + (e1[1] - e0[1]) * (0.22 + fi * 0.28) + 1 * z; this.ell(ctx, fx, fy, 1 * z, 1 * z, this.shade(this.flowers[(fi + f + Math.round(u * 13)) % this.flowers.length], tod.amb * 1.05)); }
          }
        }
      }
    }
  }
  /* ---------- cozy freestanding cottage (Cozy Houses design) ---------- */
  // Iso point factory for a footprint sx×sy centred at screen (cx,cy); U = unit scale.
  Ucozy(sc) { return { x: 1.62 * sc, y: 0.81 * sc, z: 1.08 * sc }; }
  mkPCozy(cx, cy, U, sx, sy) { const hx = sx / 2, hy = sy / 2; return (gx, gy, gz) => [cx + ((gx - hx) - (gy - hy)) * U.x, cy + ((gx - hx) + (gy - hy)) * U.y - gz * U.z]; }

  // A whole gable cottage drawn at screen (cx,cy). Lit windows + smoking chimney when the
  // house is a work-house; dormer / porch / window-box variants come from the project hash.
  drawCottage(ctx, cx, cy, o, t) { const td = this.todParams(); const pal = this.cozyPal; const sc = o.sc, U = this.Ucozy(sc);
    const sx = o.sx || 5, sy = o.sy || 4.4, wH = o.wH || 3.5, gH = o.gH || 3.0;
    const P = this.mkPCozy(cx, cy, U, sx, sy);
    const wallShL = this.shade(o.wall || pal.wallA, td.amb * 0.74), wallShR = this.shade(o.wall || pal.wallA, td.amb * 0.96);
    const roof = o.roof || pal.roofA, roofL = this.shade(roof, td.amb * 1.0), roofGable = this.shade(roof, td.amb * 0.82);
    // ground shadow
    ctx.save(); ctx.globalAlpha = 0.26 * ctx.globalAlpha; const s0 = P(-0.4, -0.4, 0), s1 = P(sx + 0.6, -0.4, 0), s2 = P(sx + 0.8, sy + 0.8, 0), s3 = P(-0.4, sy + 0.6, 0);
    this.poly(ctx, [s0, s1, s2, s3], "#0a0d10"); ctx.restore();
    // base plinth
    this.poly(ctx, [P(0, sy, 0), P(sx, sy, 0), P(sx, sy, 0.4), P(0, sy, 0.4)], this.shade("#9a8a6a", td.amb * 0.7));
    this.poly(ctx, [P(sx, 0, 0), P(sx, sy, 0), P(sx, sy, 0.4), P(sx, 0, 0.4)], this.shade("#9a8a6a", td.amb * 0.55));
    // walls (front-left over gy=sy, gable wall over gx=sx)
    this.poly(ctx, [P(0, sy, 0.4), P(sx, sy, 0.4), P(sx, sy, wH), P(0, sy, wH)], wallShL);
    this.poly(ctx, [P(sx, 0, 0.4), P(sx, sy, 0.4), P(sx, sy, wH), P(sx, 0, wH)], wallShR);
    this.line(ctx, P(sx, sy, 0.4), P(sx, sy, wH), this.shade(pal.timber, td.amb), Math.max(1.5, sc * 0.28));
    this.line(ctx, P(sx, 0, wH * 0.52), P(sx, sy, wH * 0.52), this.rgbaA(pal.timber, 0.4 * td.amb), Math.max(1, sc * 0.16));
    this.line(ctx, P(0, sy, wH * 0.52), P(sx, sy, wH * 0.52), this.rgbaA(pal.timber, 0.4 * td.amb), Math.max(1, sc * 0.16));
    // door + windows on the gable wall (gx=sx)
    const V = (v, z) => P(sx, v, z);
    const rectV = (v0, v1, z0, z1, fill) => this.poly(ctx, [V(v0, z0), V(v1, z0), V(v1, z1), V(v0, z1)], fill);
    rectV(sy * 0.40, sy * 0.60, 0.4, wH * 0.6, this.shade(pal.door, td.amb));
    rectV(sy * 0.40, sy * 0.42, 0.4, wH * 0.6, this.shade(pal.doorTrim, td.amb * 0.9));
    rectV(sy * 0.58, sy * 0.60, 0.4, wH * 0.6, this.shade(pal.doorTrim, td.amb * 0.9));
    { const c = V(sy * 0.55, wH * 0.32); this.ell(ctx, c[0], c[1], Math.max(1, sc * 0.12), Math.max(1, sc * 0.12), "#e8d9a8"); }
    const lit = o.lit;
    const winV = (vc) => { const w = sy * 0.16, z0 = wH * 0.42, z1 = wH * 0.78;
      rectV(vc - w, vc + w, z0, z1, lit ? this.rgbaA(pal.win, 0.55 + 0.45 * td.glow) : this.shade(pal.winDk, td.amb));
      this.line(ctx, V(vc, z0), V(vc, z1), this.shade(pal.winFrame, td.amb), Math.max(1, sc * 0.12));
      this.line(ctx, V(vc - w, (z0 + z1) / 2), V(vc + w, (z0 + z1) / 2), this.shade(pal.winFrame, td.amb), Math.max(1, sc * 0.12));
      if (lit && td.glow > 0.05) { const c = V(vc, (z0 + z1) / 2); ctx.save(); ctx.globalAlpha = 0.5 * td.glow; this.ell(ctx, c[0], c[1], sc * 0.9, sc * 0.7, pal.win); ctx.globalAlpha = 0.22 * td.glow; this.ell(ctx, c[0], c[1], sc * 1.6, sc * 1.2, pal.win); ctx.restore(); }
      if (o.boxes) { const b0 = V(vc - w, z0), b1 = V(vc + w, z0); this.poly(ctx, [[b0[0], b0[1]], [b1[0], b1[1]], [b1[0], b1[1] + sc * 0.5], [b0[0], b0[1] + sc * 0.5]], this.shade("#6e4a2c", td.amb)); for (let i = 0; i < 3; i++) { const fx = b0[0] + (b1[0] - b0[0]) * (0.2 + i * 0.3); this.ell(ctx, fx, b0[1] + sc * 0.05, sc * 0.18, sc * 0.18, this.flowers[(i + Math.round(vc)) % this.flowers.length]); } }
    };
    winV(sy * 0.18); winV(sy * 0.82);
    // roof: ridge along gx at gy=sy/2
    const eaW = 0.55, eaH = 0.45;
    const eaveL = P(0, sy + eaW, wH), eaveR = P(sx + eaH, sy + eaW, wH);
    const ridB = P(0 - eaH, sy / 2, wH + gH), ridF = P(sx + eaH, sy / 2, wH + gH);
    this.poly(ctx, [eaveL, eaveR, ridF, ridB], roofL);
    ctx.save(); ctx.strokeStyle = this.rgbaA(pal.shingle, 0.5 * td.amb); ctx.lineWidth = Math.max(1, sc * 0.1);
    for (let i = 1; i < 4; i++) { const f = i / 4; ctx.beginPath(); ctx.moveTo(eaveL[0] + (ridB[0] - eaveL[0]) * f, eaveL[1] + (ridB[1] - eaveL[1]) * f); ctx.lineTo(eaveR[0] + (ridF[0] - eaveR[0]) * f, eaveR[1] + (ridF[1] - eaveR[1]) * f); ctx.stroke(); } ctx.restore();
    const gL = P(sx + eaH, 0 - eaW, wH - 0.1), gR = P(sx + eaH, sy + eaW, wH - 0.1), gTop = P(sx + eaH, sy / 2, wH + gH);
    this.poly(ctx, [gL, gR, gTop], roofGable);
    const pL = P(sx, 0.15, wH - 0.05), pR = P(sx, sy - 0.15, wH - 0.05), pTop = P(sx, sy / 2, wH + gH * 0.82);
    this.poly(ctx, [pL, pR, pTop], wallShR);
    { const c = V(sy / 2, wH + gH * 0.45); this.ell(ctx, c[0], c[1], sc * 0.3, sc * 0.3, this.shade(pal.timber, td.amb)); }
    this.line(ctx, ridB, ridF, this.shade(pal.roofRidge, td.amb), Math.max(1.4, sc * 0.22));
    // chimney + smoke
    if (o.chimney !== false) { const ch = this.chimneyPosCozy(o); this.drawChimneyCozy(ctx, P, ch.gx, ch.gy, wH + gH * 0.55, ch.h, td);
      if (o.smoke && td.smoke > 0.1) { const cp = P(ch.gx, ch.gy, wH + gH * 0.55 + ch.h); this.drawSmoke(ctx, cp[0], cp[1], t, sc, td.smoke); } }
    // dormer / porch variants
    if (o.dormer) this.drawDormerCozy(ctx, cx, cy, U, sx, sy, wH, gH, o, td);
    if (o.porch) { const aw = [V(sy * 0.33, wH * 0.62), V(sy * 0.67, wH * 0.62), P(sx + 1.3, sy * 0.67, wH * 0.42), P(sx + 1.3, sy * 0.33, wH * 0.42)]; this.poly(ctx, aw, this.shade(roof, td.amb * 0.78)); this.line(ctx, P(sx + 1.3, sy * 0.33, wH * 0.42), P(sx + 1.3, sy * 0.33, 0.4), this.shade(pal.timber, td.amb), Math.max(1.2, sc * 0.18)); this.line(ctx, P(sx + 1.3, sy * 0.67, wH * 0.42), P(sx + 1.3, sy * 0.67, 0.4), this.shade(pal.timber, td.amb), Math.max(1.2, sc * 0.18)); }
  }
  chimneyPosCozy(o) { return { gx: (o.sx || 5) * 0.72, gy: (o.sy || 4.4) * 0.30, h: o.chimH || 1.7 }; }
  drawChimneyCozy(ctx, P, gx, gy, zb, h, td) { const w = 0.32, d = 0.30, col = this.cozyPal.brick;
    this.poly(ctx, [P(gx + w, gy - d, zb), P(gx + w, gy + d, zb), P(gx + w, gy + d, zb + h), P(gx + w, gy - d, zb + h)], this.shade(col, td.amb * 0.7));
    this.poly(ctx, [P(gx - w, gy + d, zb), P(gx + w, gy + d, zb), P(gx + w, gy + d, zb + h), P(gx - w, gy + d, zb + h)], this.shade(col, td.amb * 0.9));
    this.poly(ctx, [P(gx - w, gy - d, zb + h), P(gx + w, gy - d, zb + h), P(gx + w, gy + d, zb + h), P(gx - w, gy + d, zb + h)], this.shade(this.cozyPal.brickDk, td.amb)); }
  drawSmoke(ctx, x, y, t, sc, amt) { ctx.save(); for (let i = 0; i < 4; i++) { const p = ((t * 0.35 + i * 0.27) % 1); const yy = y - p * sc * 7; const xx = x + Math.sin(t * 0.9 + i * 1.7) * sc * 1.1 * p; const al = (1 - p) * 0.42 * amt * ctx.globalAlpha; const rr = sc * (0.5 + p * 1.4); ctx.globalAlpha = al; ctx.fillStyle = "#e6e8ec"; ctx.beginPath(); ctx.arc(xx, yy, rr, 0, Math.PI * 2); ctx.fill(); } ctx.restore(); }
  drawDormerCozy(ctx, cx, cy, U, sx, sy, wH, gH, o, td) { const P = this.mkPCozy(cx, cy, U, sx, sy); const dv = sy * 0.5, z = wH + gH * 0.30, dw = 0.55, dz = 0.9;
    this.poly(ctx, [P(sx * 0.62, dv - dw, z), P(sx * 0.62, dv + dw, z), P(sx * 0.62, dv + dw, z + dz), P(sx * 0.62, dv - dw, z + dz)], this.shade(o.wall || this.cozyPal.wallA, td.amb * 0.92));
    const lit = o.lit; this.poly(ctx, [P(sx * 0.62, dv - dw * 0.6, z + 0.18), P(sx * 0.62, dv + dw * 0.6, z + 0.18), P(sx * 0.62, dv + dw * 0.6, z + dz - 0.12), P(sx * 0.62, dv - dw * 0.6, z + dz - 0.12)], lit ? this.rgbaA(this.cozyPal.win, 0.5 + 0.45 * td.glow) : this.shade(this.cozyPal.winDk, td.amb));
    this.poly(ctx, [P(sx * 0.50, dv - dw - 0.2, z + dz), P(sx * 0.74, dv - dw - 0.2, z + dz * 0.55), P(sx * 0.74, dv + dw + 0.2, z + dz * 0.55), P(sx * 0.50, dv + dw + 0.2, z + dz)], this.shade(o.roof || this.cozyPal.roofA, td.amb * 0.9)); }

  /* ---------- cozy plot dressing (Cozy Houses design) ---------- */
  drawHedge(ctx, x, y, sc, seg) { const td = this.todParams(); for (let i = 0; i < seg; i++) { this.ell(ctx, x + i * sc * 1.5, y - Math.sin(i) * sc * 0.2, sc * 1.05, sc * 0.8, this.shade(this.cozyPal.hedgeA, td.amb * 0.95)); this.ell(ctx, x + i * sc * 1.5, y - sc * 0.5, sc * 0.85, sc * 0.62, this.shade(this.cozyPal.hedgeC, td.amb)); } }
  drawTreeCozy(ctx, x, y, sc, t) { const td = this.todParams(); this.ell(ctx, x, y + sc * 0.6, sc * 1.2, sc * 0.45, "rgba(8,10,12,0.28)"); ctx.fillStyle = this.shade("#6b4a2e", td.amb); ctx.fillRect(x - sc * 0.22, y - sc * 2.0, sc * 0.44, sc * 2.2); const sw = Math.sin(t * 1.1 + x) * sc * 0.18; this.ell(ctx, x + sw, y - sc * 3.0, sc * 1.7, sc * 1.7, this.shade(this.cozyPal.hedgeA, td.amb * 0.85)); this.ell(ctx, x - sc * 0.9 + sw, y - sc * 2.4, sc * 1.25, sc * 1.25, this.shade(this.cozyPal.hedgeB, td.amb)); this.ell(ctx, x + sc * 0.9 + sw, y - sc * 2.6, sc * 1.15, sc * 1.15, this.shade(this.cozyPal.hedgeC, td.amb * 1.05)); }
  drawFence(ctx, a, b, sc) { const td = this.todParams(); const n = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / (sc * 0.9))); const rail = this.shade(this.cozyPal.fence, td.amb); for (let i = 0; i <= n; i++) { const x = a[0] + (b[0] - a[0]) * i / n, y = a[1] + (b[1] - a[1]) * i / n; ctx.fillStyle = rail; ctx.fillRect(x - sc * 0.13, y - sc * 1.1, sc * 0.26, sc * 1.25); ctx.fillStyle = this.shade(this.cozyPal.fence, td.amb * 1.08); ctx.fillRect(x - sc * 0.13, y - sc * 1.1, sc * 0.26, sc * 0.18); } this.line(ctx, [a[0], a[1] - sc * 0.7], [b[0], b[1] - sc * 0.7], this.shade(this.cozyPal.fenceDk, td.amb), Math.max(1, sc * 0.13)); }
  drawLanternCozy(ctx, x, y, sc, t) { const td = this.todParams(); ctx.fillStyle = this.shade("#3a2f24", td.amb); ctx.fillRect(x - sc * 0.12, y - sc * 2.4, sc * 0.24, sc * 2.5); const fl = 0.7 + 0.3 * Math.sin(t * 4 + x); if (td.lantern > 0.05) { ctx.save(); ctx.globalAlpha = td.lantern * 0.5 * fl * ctx.globalAlpha; this.ell(ctx, x, y - sc * 2.6, sc * 1.5, sc * 1.5, this.cozyPal.win); ctx.restore(); } this.ell(ctx, x, y - sc * 2.6, sc * 0.42, sc * 0.5, td.lantern > 0.05 ? this.rgbaA(this.cozyPal.win, 0.6 + 0.4 * td.lantern * fl) : this.shade("#caa86a", td.amb)); ctx.fillStyle = this.shade("#3a2f24", td.amb); ctx.fillRect(x - sc * 0.3, y - sc * 3.25, sc * 0.6, sc * 0.32); }
  drawFlowerBed(ctx, x, y, sc) { const td = this.todParams(); this.ell(ctx, x, y, sc * 1.3, sc * 0.7, this.shade("#5a4632", td.amb * 0.8)); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; this.ell(ctx, x + Math.cos(a) * sc * 0.8, y + Math.sin(a) * sc * 0.4, sc * 0.24, sc * 0.24, this.shade(this.flowers[i % this.flowers.length], td.amb * 1.05)); } }
  // A stone well at the heart of the village green.
  drawWell(ctx, x, y, sc, t) { const td = this.todParams(); this.ell(ctx, x, y + sc * 0.5, sc * 1.5, sc * 0.7, "rgba(8,10,12,0.25)"); const P = this.mkPCozy(x, y, this.Ucozy(sc), 2, 2);
    this.poly(ctx, [P(0, 2, 0), P(2, 2, 0), P(2, 2, 1), P(0, 2, 1)], this.shade(this.cozyPal.brick, td.amb * 0.7));
    this.poly(ctx, [P(2, 0, 0), P(2, 2, 0), P(2, 2, 1), P(2, 0, 1)], this.shade(this.cozyPal.brick, td.amb * 0.85));
    this.ell(ctx, x, y - sc * 0.5, sc * 1.0, sc * 0.5, this.shade("#2b4450", td.amb)); ctx.fillStyle = this.shade("#6b4a2e", td.amb); ctx.fillRect(x - sc * 0.1, y - sc * 3.4, sc * 0.2, sc * 3);
    this.poly(ctx, [[x - sc * 1.3, y - sc * 3.4], [x + sc * 1.3, y - sc * 3.4], [x + sc * 0.9, y - sc * 4.0], [x - sc * 0.9, y - sc * 4.0]], this.shade(this.cozyPal.roofA, td.amb * 0.9)); }
  // A worn dirt lane (used for the radial paths from the green to each cottage door).
  pathStrip(ctx, pts, w) { const td = this.todParams(); ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = this.shade(this.cozyPal.path, td.grassF); ctx.lineWidth = w; ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke();
    ctx.strokeStyle = this.shade(this.cozyPal.pathDk, td.grassF * 0.85); ctx.lineWidth = w; ctx.setLineDash([w * 0.5, w * 0.9]); ctx.globalAlpha = 0.4; ctx.stroke(); ctx.restore(); }

  // Render one project as a freestanding cottage on a grassy plot with citizens in the yard.
  // A cottage's world position: its cell, nudged outward from the town centre + a stable
  // jitter, so the village reads as an organic cluster around the central green rather than
  // a rigid one-house-per-tile lattice.
  cottagePos(p) { const wp = this.worldPos(p.cell);
    const ctr = this.worldPos(this.centroidCell()); let dx = wp.x - ctr.x, dy = wp.y - ctr.y; const d = Math.hypot(dx, dy) || 1;
    const h = this.hashStr(p.name + "jit"), jr = (((h % 100) / 100) - 0.5) * this.A * 0.46, jt = ((((h >> 7) % 100) / 100) - 0.5) * this.B * 0.46;
    return { x: wp.x + dx / d * 22 + jr, y: wp.y + dy / d * 22 + jt }; }
  // Stable cottage geometry/variant for a project (plain / dormer / porch by name hash).
  cottageOpts(p, active) { const z = this.cam.z, h = this.hashStr(p.name), variant = h % 3;
    return { sc: z * (5.4 + ((h >> 4) % 3) * 0.5), sx: 5, sy: 4.4, wH: 3.2 + ((h >> 2) % 3) * 0.25, gH: 2.7 + ((h >> 5) % 2) * 0.4,
      wall: this.cozyWalls[h % this.cozyWalls.length], roof: this.cozyRoofs[(h >> 1) % this.cozyRoofs.length],
      lit: active, smoke: active, boxes: (h % 2 === 0) || variant === 1,
      dormer: variant === 1, porch: variant === 2, chimney: true, chimH: variant === 2 ? 2.0 : 1.7 }; }
  // A quiet, dimmed cottage for an idle (dormant) project — no smoke, dark windows, Zzz.
  drawCozyDormant(ctx, p, t) { const z = this.cam.z, s = this.project(this.cottagePos(p)), o = this.cottageOpts(p, false);
    ctx.globalAlpha = Math.min(1, p.life * 1.2) * 0.66;
    this.drawCottage(ctx, s.x, s.y, o, t);
    ctx.fillStyle = "rgba(150,160,175," + (0.3 + 0.16 * Math.sin(t * 1.5)).toFixed(2) + ")"; ctx.font = "bold " + Math.round(7 * z) + "px 'JetBrains Mono',monospace"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.fillText("z", s.x + o.sc * 1.6, s.y - o.sc * 2.6); ctx.fillText("z", s.x + o.sc * 2.4, s.y - o.sc * 3.4);
    ctx.globalAlpha = 1; this.plotLabel(ctx, s.x, s.y - (o.wH + o.gH) * 1.08 * o.sc - 6 * z, p); }
  drawCozyParcel(ctx, p, t) {
    const z = this.cam.z, s = this.project(this.cottagePos(p));
    ctx.globalAlpha = Math.min(1, p.life * 1.2);
    const active = p.agents.some(a => a.act !== "idle"); // a "work-house": lit windows + smoke
    const o = this.cottageOpts(p, active), sc = o.sc;
    // yard dressing behind/around the house, then the cottage, then front dressing
    this.drawTreeCozy(ctx, s.x - sc * 5.4, s.y - sc * 0.6, sc * 0.78, t);
    this.drawHedge(ctx, s.x - sc * 4.0, s.y + sc * 2.7, sc * 0.7, 4);
    this.drawCottage(ctx, s.x, s.y, o, t);
    this.drawFlowerBed(ctx, s.x - sc * 2.6, s.y + sc * 3.1, sc * 0.7);
    this.drawLanternCozy(ctx, s.x + sc * 4.0, s.y + sc * 2.4, sc * 0.7, t);
    // citizens milling in the front yard (depth-sorted), activity glyph above
    const items = [];
    for (const a of p.agents) { if (a.commute) continue; items.push({ y: a.ly, fn: () => this.drawWalker(ctx, s.x + a.lx * z, s.y + a.ly * z, a, t) }); }
    items.sort((u, v) => u.y - v.y); for (const it of items) it.fn();
    this.plotLabel(ctx, s.x, s.y - (o.wH + o.gH) * 1.08 * sc - 6 * z, p);
    ctx.globalAlpha = 1;
  }
  // A point of interest on a commons tile (parks + beach). Cheap pixel props; some animate.
  drawPOI(ctx, kind, x, y, z, t, cell) { const ph = (cell.cx * 7 + cell.cy * 13);
    switch (kind) {
      case "tree": ctx.fillStyle = "#6b4a2e"; ctx.fillRect(x - 1.4 * z, y - 6 * z, 2.8 * z, 7 * z); this.ell(ctx, x, y - 9 * z, 7 * z, 7 * z, "#4d7a3a"); this.ell(ctx, x - 3 * z, y - 7 * z, 5 * z, 5 * z, "#5e8b4a"); this.ell(ctx, x + 3 * z, y - 8 * z, 4.5 * z, 4.5 * z, "#6f9a55"); break;
      case "lamp": { ctx.fillStyle = "#3a3026"; ctx.fillRect(x - 0.8 * z, y - 12 * z, 1.6 * z, 12 * z); const on = 0.6 + 0.35 * Math.sin(t * 2 + cell.cx); this.ell(ctx, x, y - 13 * z, 5 * z, 5 * z, this.rgbaA("#ffd98a", 0.12)); this.ell(ctx, x, y - 13 * z, 2.3 * z, 2.3 * z, this.rgbaA("#ffd98a", on)); break; }
      case "bench": this.ell(ctx, x, y + 1.5 * z, 6 * z, 2 * z, "rgba(0,0,0,0.18)"); ctx.fillStyle = "#4a3526"; ctx.fillRect(x - 5 * z, y - 0.5 * z, 1.4 * z, 3 * z); ctx.fillRect(x + 3.6 * z, y - 0.5 * z, 1.4 * z, 3 * z); this.poly(ctx, [[x - 6 * z, y - 1 * z], [x + 6 * z, y - 1 * z], [x + 5 * z, y + 0.5 * z], [x - 5 * z, y + 0.5 * z]], "#7a5a3a"); this.poly(ctx, [[x - 6 * z, y - 5 * z], [x + 6 * z, y - 5 * z], [x + 6 * z, y - 3.6 * z], [x - 6 * z, y - 3.6 * z]], "#8a6a46"); break;
      case "fountain": this.ell(ctx, x, y + 1 * z, 9 * z, 4.5 * z, "rgba(0,0,0,0.16)"); this.ell(ctx, x, y, 9 * z, 4.5 * z, "#9aa0a6"); this.ell(ctx, x, y, 7 * z, 3.4 * z, "#5fb0c8"); this.ell(ctx, x, y, 4.5 * z, 2.1 * z, "#7fd0e0"); ctx.fillStyle = "#b0b6bc"; ctx.fillRect(x - 1 * z, y - 6 * z, 2 * z, 6 * z); this.ell(ctx, x, y - 6.5 * z, 2.4 * z, 1.3 * z, "#8fdcec"); { for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2, dr = 2.4 + Math.abs(Math.sin(t * 3 + i)) * 2.2; this.ell(ctx, x + Math.cos(a) * dr * z, y - 7 * z - Math.abs(Math.sin(t * 3 + i)) * 3 * z, 0.9 * z, 0.9 * z, this.rgbaA("#cdeef6", 0.85)); } } break;
      case "garden": this.poly(ctx, [[x, y - 2.6 * z], [x + 4.5 * z, y], [x, y + 2.6 * z], [x - 4.5 * z, y]], "#4d7a3a"); { const cols = ["#e06a9a", "#ffd98a", "#f3efe6", "#e0664f", "#a07cf0"]; for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; this.ell(ctx, x + Math.cos(a) * 2.6 * z, y + Math.sin(a) * 1.5 * z - 1 * z, 1 * z, 1 * z, cols[(ph + i) % cols.length]); } } break;
      case "statue": this.box(ctx, x, y, 2.6 * z, 1.6 * z, 4 * z, "#8a8478", "#6f6a60", { win: false }); { const gx = x, gy = y - 4 * z; this.ell(ctx, gx, gy - 6 * z, 1.6 * z, 1.8 * z, "#b6b0a4"); ctx.fillStyle = "#aaa498"; ctx.fillRect(gx - 1.4 * z, gy - 5 * z, 2.8 * z, 5 * z); ctx.fillStyle = "#9a948a"; ctx.fillRect(gx - 2.6 * z, gy - 4.4 * z, 1.4 * z, 0.9 * z); } break;
      case "cafe": this.ell(ctx, x, y + 1.5 * z, 8 * z, 2.6 * z, "rgba(0,0,0,0.18)"); this.box(ctx, x, y, 5 * z, 3 * z, 7 * z, "#7a5a3a", "#5a3f28", { win: false }); for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? "#c0563f" : "#f3efe6"; this.poly(ctx, [[x - 6 * z + i * 3 * z, y - 9 * z], [x - 3 * z + i * 3 * z, y - 9 * z], [x - 3.8 * z + i * 3 * z, y - 6.6 * z], [x - 6.8 * z + i * 3 * z, y - 6.6 * z]], i % 2 ? "#c0563f" : "#e8d9b8"); } ctx.fillStyle = "#2a221a"; ctx.fillRect(x - 3.4 * z, y - 5.5 * z, 6.8 * z, 3 * z); ctx.fillStyle = "#ffd98a"; ctx.font = "bold " + Math.round(3 * z) + "px 'JetBrains Mono',monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("☕", x, y - 4 * z); break;
      case "umbrella": ctx.fillStyle = "#6b4a2e"; ctx.fillRect(x - 0.6 * z, y - 11 * z, 1.2 * z, 11 * z); this.poly(ctx, [[x - 8 * z, y - 10 * z], [x + 8 * z, y - 10 * z], [x, y - 14 * z]], "#e0664f"); this.poly(ctx, [[x - 8 * z, y - 10 * z], [x - 2.7 * z, y - 10 * z], [x - 1.3 * z, y - 13 * z], [x - 5.3 * z, y - 11.6 * z]], "#f3efe6"); this.poly(ctx, [[x + 2.7 * z, y - 10 * z], [x + 8 * z, y - 10 * z], [x + 5.3 * z, y - 11.6 * z], [x + 1.3 * z, y - 13 * z]], "#f3efe6"); break;
      case "sandcastle": ctx.fillStyle = "#c9a878"; this.box(ctx, x, y, 3 * z, 1.8 * z, 3 * z, "#cdb98f", "#b39a6a", { win: false }); this.box(ctx, x - 2.4 * z, y + 0.5 * z, 1.4 * z, 1 * z, 3 * z, "#cdb98f", "#b39a6a", { win: false }); this.box(ctx, x + 2.4 * z, y + 0.5 * z, 1.4 * z, 1 * z, 3 * z, "#cdb98f", "#b39a6a", { win: false }); ctx.fillStyle = "#6b4a2e"; ctx.fillRect(x - 0.3 * z, y - 6 * z, 0.6 * z, 3 * z); ctx.fillStyle = "#e0664f"; ctx.fillRect(x + 0.3 * z, y - 6 * z, 2 * z, 1.4 * z); break;
    }
  }

  /* ---------- room ---------- */
  drawParcel(ctx, p, t) { if (p.dormant) { this.drawDormant(ctx, p, t); return; } const z = this.cam.z; const s = this.project(this.worldPos(p.cell)); const a = this.A * z, b = this.B * z; const pal = this.world().pal, dark = this.world().dark;
    const cozy = this.world().style === "cozy", tod = cozy ? this.todParams() : null, amb = cozy ? tod.amb : 1;
    const active = !p.civic && p.agents.some(a2 => a2.act !== "idle"); // a "work-house" — lit windows + chimney smoke
    if (cozy && !p.civic) { this.drawCozyParcel(ctx, p, t); return; } // freestanding cottage + yard
    const ease = p.life * p.life * (3 - 2 * p.life); const grow = 0.62 + 0.38 * ease;
    ctx.globalAlpha = Math.min(1, p.life * 1.2);
    const fa = a * 0.66 * grow, fb = b * 0.66 * grow;
    const T = [s.x, s.y - fb], R = [s.x + fa, s.y], Bm = [s.x, s.y + fb], L = [s.x - fa, s.y];
    const rm = this.roomMats[(p.decorKind || 0) % 5];
    this.poly(ctx, [T, R, Bm, L], pal.plaza); this.poly(ctx, [T, R, Bm, L], this.rgbaA(rm.f, dark ? rm.a * 0.92 : rm.a)); this.poly(ctx, [T, R, Bm, L], this.rgbaA(p.color, dark ? 0.12 : 0.08));
    if (p.agents.length >= 4) this.ell(ctx, s.x, s.y, fa * 0.85, fb * 0.85, this.rgbaA(p.color, 0.05 * Math.min(1, p.agents.length / 6)));
    const floors = p.civic ? 1 : (p.floors || 1), fh = 12 * z * grow, wh = p.civic ? 13 * z * grow : fh * floors;
    this.poly(ctx, [L, T, [T[0], T[1] - wh], [L[0], L[1] - wh]], this.shade(pal.wallA, 0.66 * amb));
    this.poly(ctx, [T, R, [R[0], R[1] - wh], [T[0], T[1] - wh]], this.shade(pal.wallA, 0.84 * amb));
    if (!p.civic) { this.faceWindows(ctx, L, T, wh, floors, p, t, false, active, cozy); this.faceWindows(ctx, T, R, wh, floors, p, t, true, active, cozy); }
    ctx.strokeStyle = p.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(L[0], L[1] - wh); ctx.lineTo(T[0], T[1] - wh); ctx.lineTo(R[0], R[1] - wh); ctx.stroke();
    for (let f = 1; f < floors; f++) { const yy = wh * f / floors; ctx.strokeStyle = this.rgbaA(this.shade(pal.wallA, 0.5), 0.6); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(L[0], L[1] - yy); ctx.lineTo(T[0], T[1] - yy); ctx.lineTo(R[0], R[1] - yy); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(L[0], L[1]); ctx.lineTo(Bm[0], Bm[1]); ctx.lineTo(R[0], R[1]); ctx.stroke();
    if (!p.civic) {
      const f0 = 0.42, f1 = 0.6, dh = Math.min(wh * 0.8, fh * 0.78);
      const d0 = [T[0] + (R[0] - T[0]) * f0, T[1] + (R[1] - T[1]) * f0], d1 = [T[0] + (R[0] - T[0]) * f1, T[1] + (R[1] - T[1]) * f1];
      const d0t = [d0[0], d0[1] - dh], d1t = [d1[0], d1[1] - dh];
      this.poly(ctx, [d0, d1, d1t, d0t], dark ? "#0d1015" : "#241a12");
      this.poly(ctx, [d0, d1, [d1[0], d1[1] + 3.5 * z], [d0[0], d0[1] + 3.5 * z]], this.rgbaA(pal.window, 0.42));
      ctx.strokeStyle = this.shade(pal.wallA, 0.5); ctx.lineWidth = 1.5 * z; ctx.beginPath(); ctx.moveTo(d0[0], d0[1]); ctx.lineTo(d0t[0], d0t[1]); ctx.lineTo(d1t[0], d1t[1]); ctx.lineTo(d1[0], d1[1]); ctx.stroke();
      this.poly(ctx, [d0t, d1t, [d1t[0], d1t[1] - 1.8 * z], [d0t[0], d0t[1] - 1.8 * z]], p.color);
      const mx = Bm[0] + (s.x - Bm[0]) * 0.17, my = Bm[1] + (s.y - Bm[1]) * 0.17;
      this.poly(ctx, [[mx, my - 3 * z], [mx + 5.5 * z, my], [mx, my + 3 * z], [mx - 5.5 * z, my]], this.rgbaA(pal.window, dark ? 0.5 : 0.3)); }
    { const w0 = this.world(), st = w0.style, rc = w0.roof || pal.wallB, win = pal.window, Lr = [L[0], L[1] - wh], Tr = [T[0], T[1] - wh], Rr = [R[0], R[1] - wh], eh = 8 * z, ov = 4 * z;
      this.poly(ctx, [Lr, Tr, [Tr[0] - ov * 0.5, Tr[1] - eh], [Lr[0] - ov, Lr[1] - eh * 0.7]], this.shade(rc, 0.82));
      this.poly(ctx, [Tr, Rr, [Rr[0] + ov, Rr[1] - eh * 0.7], [Tr[0] + ov * 0.5, Tr[1] - eh]], rc);
      this.poly(ctx, [Lr, Tr, [Tr[0] - ov * 0.5, Tr[1] - eh], [Lr[0] - ov, Lr[1] - eh * 0.7]], this.rgbaA(p.color, 0.16));
      this.poly(ctx, [Tr, Rr, [Rr[0] + ov, Rr[1] - eh * 0.7], [Tr[0] + ov * 0.5, Tr[1] - eh]], this.rgbaA(p.color, 0.16));
      ctx.strokeStyle = (st === "neon" || st === "chip") ? win : this.shade(rc, 0.62); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(Lr[0] - ov, Lr[1] - eh * 0.7); ctx.lineTo(Tr[0], Tr[1] - eh); ctx.lineTo(Rr[0] + ov, Rr[1] - eh * 0.7); ctx.stroke();
      ctx.strokeStyle = (st === "cozy") ? this.rgbaA("#8a6a44", 0.22) : this.rgbaA(win, 0.07); ctx.lineWidth = 1; for (let i = 1; i < 4; i++) { const f = i / 4; ctx.beginPath(); ctx.moveTo(L[0] + (T[0] - L[0]) * f, L[1] + (T[1] - L[1]) * f); ctx.lineTo(Bm[0] + (R[0] - Bm[0]) * f, Bm[1] + (R[1] - Bm[1]) * f); ctx.stroke(); }
      const cxp = Tr[0] + (Rr[0] - Tr[0]) * 0.42, cyp = Tr[1] - eh, pl = [L[0] + (Bm[0] - L[0]) * 0.28, L[1] + (Bm[1] - L[1]) * 0.28], ln = [R[0] + (Bm[0] - R[0]) * 0.28, R[1] + (Bm[1] - R[1]) * 0.28];
      if (st === "cozy") { ctx.fillStyle = "#b5663f"; ctx.fillRect(pl[0] - 2 * z, pl[1] - 1 * z, 4 * z, 3 * z); this.ell(ctx, pl[0], pl[1] - 2.5 * z, 3 * z, 3 * z, "#5e8b4a"); this.ell(ctx, pl[0] - 1.4 * z, pl[1] - 3.4 * z, 2 * z, 2 * z, "#6f9a55");
        ctx.fillStyle = "#6b4a2e"; ctx.fillRect(ln[0] - 0.6 * z, ln[1] - 7 * z, 1.2 * z, 7 * z); this.ell(ctx, ln[0], ln[1] - 7.5 * z, 5 * z, 5 * z, this.rgbaA(win, 0.16)); this.ell(ctx, ln[0], ln[1] - 7.5 * z, 2.2 * z, 2.4 * z, this.rgbaA(win, 0.95));
      } else if (st === "space") { ctx.strokeStyle = "#9aa3b2"; ctx.lineWidth = 1.4 * z; ctx.beginPath(); ctx.moveTo(cxp, cyp); ctx.lineTo(cxp, cyp - 9 * z); ctx.stroke(); const bl = (Math.floor(t * 2) % 2) ? "#bfe6ff" : "#5b636f"; this.ell(ctx, cxp, cyp - 10 * z, 1.6 * z, 1.6 * z, bl);
        this.ell(ctx, Tr[0], Tr[1] - eh * 0.3, 5 * z, 2.6 * z, this.shade(rc, 1.06)); this.ell(ctx, Tr[0], Tr[1] - eh * 0.3, 5 * z, 2.6 * z, this.rgbaA(win, 0.14));
        this.box(ctx, pl[0], pl[1], 3 * z, 1.8 * z, 3 * z, "#9aa3b2", "#7e879a", { win: false });
      } else if (st === "neon") { ctx.strokeStyle = win; ctx.lineWidth = 1.6 * z; ctx.beginPath(); ctx.moveTo(Lr[0] - ov, Lr[1] - eh * 0.7); ctx.lineTo(Rr[0] + ov, Rr[1] - eh * 0.7); ctx.stroke();
        ctx.fillStyle = this.rgbaA(p.color, 0.45); ctx.fillRect(cxp - 3 * z, cyp - 9 * z, 6 * z, 4 * z); ctx.fillStyle = this.rgbaA(p.color, 0.95); ctx.fillRect(cxp - 3 * z, cyp - 9 * z, 6 * z, 1 * z);
        ctx.fillStyle = "#1b2030"; ctx.fillRect(pl[0] - 0.8 * z, pl[1] - 6 * z, 1.6 * z, 6 * z); this.ell(ctx, pl[0], pl[1] - 6.5 * z, 2.6 * z, 2.6 * z, this.rgbaA(win, 0.85));
      } else if (st === "chip") { for (let i = 0; i < 4; i++) { const f = i / 3, rx = (Lr[0] - ov) + ((Rr[0] + ov) - (Lr[0] - ov)) * f, ry = (Lr[1] - eh * 0.7) + ((Rr[1] - eh * 0.7) - (Lr[1] - eh * 0.7)) * f; const on = (Math.floor(t * 2 + i) % 2); this.ell(ctx, rx, ry, 1.4 * z, 1.4 * z, on ? win : "#0a160f"); }
        ctx.fillStyle = "#2a3a30"; ctx.fillRect(pl[0] - 1.6 * z, pl[1] - 5 * z, 3.2 * z, 5 * z); this.ell(ctx, pl[0], pl[1] - 5 * z, 1.6 * z, 1 * z, "#b87333");
      }
    }
    if (p.civic) this.drawCivic(ctx, p, s, fa, fb, z, t); else this.drawRoomDecor(ctx, p, s, fa, fb, z, t);
    const byA = {}; for (const a2 of p.agents) { if (a2.act === "idle" || a2.commute) continue; const key = a2.act === "error" ? "run" : a2.act; if (byA[key] === undefined || a2.act === "error") byA[key] = a2.act; }
    const items = [];
    for (const key in byA) { const an = this.anchors[key]; if (!an) continue; const act = byA[key]; items.push({ y: an.y, fn: () => this.drawFurniture(ctx, s.x + an.x * z, s.y + an.y * z, act, t) }); }
    for (const a2 of p.agents) { if (a2.commute) continue; items.push({ y: a2.ly, fn: () => this.drawWalker(ctx, s.x + a2.lx * z, s.y + a2.ly * z, a2, t) }); }
    items.sort((u, v) => u.y - v.y); for (const it of items) it.fn();
    this.plotLabel(ctx, s.x, T[1] - wh - 7 * z, p);
    ctx.globalAlpha = 1; }
  drawRoomDecor(ctx, p, s, fa, fb, z, t) { const col = p.color, k = (p.decorKind || 0) % 5, rm = this.roomMats[k];
    const rx = fa * 0.46, ry = fb * 0.46, T = [s.x, s.y - ry], R = [s.x + rx, s.y], B = [s.x, s.y + ry], L = [s.x - rx, s.y];
    this.poly(ctx, [T, R, B, L], this.rgbaA(this.shade(rm.f, 0.82), 0.62));
    if (k === 0) { ctx.strokeStyle = this.rgbaA(col, 0.55); ctx.lineWidth = 1.6 * z; ctx.beginPath(); ctx.moveTo(T[0], T[1]); ctx.lineTo(R[0], R[1]); ctx.lineTo(B[0], B[1]); ctx.lineTo(L[0], L[1]); ctx.closePath(); ctx.stroke(); }
    else if (k === 1) { ctx.strokeStyle = this.rgbaA(col, 0.4); ctx.lineWidth = 1.4 * z; for (let i = 1; i < 4; i++) { const f = i / 4; ctx.beginPath(); ctx.moveTo(T[0] + (L[0] - T[0]) * f, T[1] + (L[1] - T[1]) * f); ctx.lineTo(R[0] + (B[0] - R[0]) * f, R[1] + (B[1] - R[1]) * f); ctx.stroke(); } }
    else if (k === 2) { this.poly(ctx, [[s.x, s.y - ry * 0.5], [s.x + rx * 0.5, s.y], [s.x, s.y + ry * 0.5], [s.x - rx * 0.5, s.y]], this.rgbaA(col, 0.45)); }
    else if (k === 3) { ctx.strokeStyle = this.rgbaA(col, 0.4); ctx.lineWidth = 1.3 * z; ctx.beginPath(); ctx.moveTo((T[0] + L[0]) / 2, (T[1] + L[1]) / 2); ctx.lineTo((R[0] + B[0]) / 2, (R[1] + B[1]) / 2); ctx.moveTo((T[0] + R[0]) / 2, (T[1] + R[1]) / 2); ctx.lineTo((L[0] + B[0]) / 2, (L[1] + B[1]) / 2); ctx.stroke(); }
    const x = s.x - fa * 0.66, y = s.y - fb * 0.12;
    if (k === 0) { this.box(ctx, x, y, 3 * z, 4.2 * z, 16 * z, this.shade(col, 0.5), this.shade(col, 0.4), { win: false }); for (let r = 0; r < 4; r++) { ctx.fillStyle = r % 2 ? this.rgbaA(col, 0.7) : "#cdb98f"; ctx.fillRect(x - 2.4 * z, y - 15 * z + r * 3.4 * z, 4.8 * z, 2.4 * z); } }
    else if (k === 1) { this.box(ctx, x, y, 4 * z, 2.6 * z, 5 * z, "#7a5a3a", "#6b4a2e", { win: false }); this.box(ctx, x - 0.5 * z, y - 5 * z, 2.8 * z, 1.8 * z, 4 * z, "#8a6a46", "#7a5a3a", { win: false }); }
    else if (k === 2) { ctx.fillStyle = "#6b4a2e"; ctx.fillRect(x - 1.2 * z, y - 7 * z, 2.4 * z, 7 * z); this.ell(ctx, x, y - 9 * z, 6 * z, 6 * z, "#4d7a3a"); this.ell(ctx, x - 3 * z, y - 7.5 * z, 4.5 * z, 4.5 * z, "#5e8b4a"); this.ell(ctx, x + 3 * z, y - 8.5 * z, 4 * z, 4 * z, "#6f9a55"); }
    else if (k === 3) { this.box(ctx, x, y, 3.2 * z, 2 * z, 9 * z, this.shade(col, 0.45), this.shade(col, 0.35), { win: false }); this.ell(ctx, x, y - 10 * z, 2.2 * z, 2.2 * z, this.rgbaA(col, 0.85)); }
    else { this.box(ctx, x, y, 3.6 * z, 2.2 * z, 11 * z, "#3a4658", "#2b333f", { win: false }); for (let r = 0; r < 3; r++) { const on = (Math.floor(t * 2 + r) % 2); ctx.fillStyle = on ? "#5fb0ab" : "#27424a"; ctx.fillRect(x - 2.4 * z, y - 10 * z + r * 3 * z, 4.8 * z, 1.6 * z); } }
  }
  drawCivic(ctx, p, s, fa, fb, z, t) { p.slots.forEach((sl, i) => { const x = s.x + sl.x * z, y = s.y + sl.y * z;
      if (p.kind === "bash") { this.box(ctx, x, y, 4.4 * z, 2.6 * z, 7.5 * z, "#23282f", "#171b21", { win: false }); ctx.fillStyle = "#08120e"; ctx.fillRect(x - 3 * z, y - 11.5 * z, 6 * z, 4.4 * z); const on = (Math.floor(t * 3 + i) % 2); ctx.fillStyle = on ? "#46e07a" : "#2a7a4a"; ctx.fillRect(x - 2.4 * z, y - 10.6 * z, 1.8 * z, 0.9 * z); ctx.fillRect(x - 0.2 * z, y - 10.6 * z, 2.6 * z, 0.9 * z); ctx.fillStyle = "#2a7a4a"; ctx.fillRect(x - 2.4 * z, y - 9.2 * z, 4 * z, 0.9 * z); ctx.fillStyle = on ? "#46e07a" : "#2a7a4a"; ctx.fillRect(x - 2.4 * z, y - 7.8 * z, 2.2 * z, 0.9 * z); }
      else { this.box(ctx, x, y, 3.4 * z, 2.1 * z, 9.5 * z, "#3a2f20", "#241c12", { win: false }); const on = (Math.floor(t * 2 + i) % 2); ctx.strokeStyle = this.rgbaA("#c98a3c", 0.55); ctx.lineWidth = 1.2 * z; ctx.beginPath(); ctx.moveTo(x, y - 3 * z); ctx.lineTo(x, y - 11 * z); ctx.stroke(); this.ell(ctx, x, y - 12.5 * z, 2.4 * z, 2.4 * z, on ? "#e0a23c" : "#7a5a2a"); this.ell(ctx, x, y - 12.5 * z, 1.1 * z, 1.1 * z, on ? "#ffe6a0" : "#5a431f"); }
    }); }
  drawDormant(ctx, p, t) { if (this.world().style === "cozy" && !p.civic) { this.drawCozyDormant(ctx, p, t); return; }
    const z = this.cam.z, s = this.project(this.worldPos(p.cell)), a = this.A * z, b = this.B * z, pal = this.world().pal;
    ctx.globalAlpha = Math.min(1, p.life * 1.2) * 0.6;
    const fa = a * 0.66, fb = b * 0.66, T = [s.x, s.y - fb], R = [s.x + fa, s.y], Bm = [s.x, s.y + fb], L = [s.x - fa, s.y];
    this.poly(ctx, [T, R, Bm, L], this.shade(pal.plaza, 0.6)); this.poly(ctx, [T, R, Bm, L], "rgba(18,22,30,0.5)");
    const wh = 13 * z;
    this.poly(ctx, [L, T, [T[0], T[1] - wh], [L[0], L[1] - wh]], this.shade(pal.wallA, 0.42));
    this.poly(ctx, [T, R, [R[0], R[1] - wh], [T[0], T[1] - wh]], this.shade(pal.wallA, 0.52));
    ctx.strokeStyle = this.rgbaA(p.color, 0.4); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(L[0], L[1] - wh); ctx.lineTo(T[0], T[1] - wh); ctx.lineTo(R[0], R[1] - wh); ctx.stroke();
    const rc = this.world().roof || pal.wallB, Lr = [L[0], L[1] - wh], Tr = [T[0], T[1] - wh], Rr = [R[0], R[1] - wh], eh = 8 * z, ov = 4 * z;
    this.poly(ctx, [Lr, Tr, [Tr[0] - ov * 0.5, Tr[1] - eh], [Lr[0] - ov, Lr[1] - eh * 0.7]], this.shade(rc, 0.5));
    this.poly(ctx, [Tr, Rr, [Rr[0] + ov, Rr[1] - eh * 0.7], [Tr[0] + ov * 0.5, Tr[1] - eh]], this.shade(rc, 0.62));
    ctx.fillStyle = "rgba(150,160,175," + (0.3 + 0.16 * Math.sin(t * 1.5)).toFixed(2) + ")"; ctx.font = "bold " + Math.round(7 * z) + "px 'JetBrains Mono',monospace"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.fillText("z", s.x - 1 * z, s.y - 2 * z); ctx.fillText("z", s.x + 4 * z, s.y - 6 * z);
    ctx.globalAlpha = 1; this.plotLabel(ctx, s.x, T[1] - wh - 7 * z, p); }
  plotLabel(ctx, sx, sy, p) { if (p._soloVillage && !p.civic) return; // its village banner is the only label
    ctx.font = "700 10px 'JetBrains Mono',monospace"; ctx.textBaseline = "middle"; ctx.textAlign = "left";
    if (p.civic) { const nm2 = p.name, nw2 = ctx.measureText(nm2).width, w2 = nw2 + 14, x2 = sx - w2 / 2, y2 = sy - 8, h2 = 16; ctx.fillStyle = "rgba(12,13,18,0.88)"; ctx.fillRect(x2, y2, w2, h2); ctx.fillStyle = p.color; ctx.fillRect(x2, y2, 3, h2); ctx.fillStyle = "#e7edf2"; ctx.fillText(nm2, x2 + 8, y2 + h2 / 2 + 0.5); return; }
    if (p.dormant) { const nm3 = p.name, nw3 = ctx.measureText(nm3).width, ex = "idle", ew = ctx.measureText(ex).width, w3 = nw3 + ew + 22, x3 = sx - w3 / 2, y3 = sy - 8, h3 = 16; ctx.fillStyle = "rgba(12,13,18,0.7)"; ctx.fillRect(x3, y3, w3, h3); ctx.fillStyle = this.rgbaA(p.color, 0.45); ctx.fillRect(x3, y3, 3, h3); ctx.fillStyle = "#8b93a0"; ctx.fillText(nm3, x3 + 8, y3 + h3 / 2 + 0.5); ctx.fillStyle = "#5b636f"; ctx.font = "700 9px 'JetBrains Mono',monospace"; ctx.fillText(ex, x3 + 12 + nw3, y3 + h3 / 2 + 0.5); return; }
    const nm = p.name, cnt = String(p.agents.length); const nw = ctx.measureText(nm).width; const w = nw + 14 + 13 + 6, x = sx - w / 2, y = sy - 8, h = 16;
    ctx.fillStyle = "rgba(12,13,18,0.84)"; ctx.fillRect(x, y, w, h); ctx.fillStyle = p.color; ctx.fillRect(x, y, 3, h);
    ctx.fillStyle = "#e7edf2"; ctx.fillText(nm, x + 7, y + h / 2 + 0.5); this.ell(ctx, x + 7 + nw + 9, y + h / 2, 6.5, 6.5, p.color);
    ctx.fillStyle = "#0c0d12"; ctx.font = "700 9px 'JetBrains Mono',monospace"; ctx.textAlign = "center"; ctx.fillText(cnt, x + 7 + nw + 9, y + h / 2 + 0.5); }

  /* ---------- houses (decorative, scaled to repo size) ---------- */
  // Stable cottage geometry/variant for one decorative house, keyed by its hash seed.
  houseOpts(seed, active) { const z = this.cam.z, h = seed >>> 0, variant = h % 3;
    return { sc: z * (4.4 + ((h >> 4) % 3) * 0.5), sx: 5, sy: 4.4, wH: 3.0 + ((h >> 2) % 3) * 0.25, gH: 2.6 + ((h >> 5) % 2) * 0.4,
      wall: this.cozyWalls[h % this.cozyWalls.length], roof: this.cozyRoofs[(h >> 1) % this.cozyRoofs.length],
      lit: active, smoke: active, boxes: (h % 2 === 0) || variant === 1, dormer: variant === 1, porch: variant === 2, chimney: true, chimH: variant === 2 ? 2.0 : 1.7 }; }
  drawHouse(ctx, sx, sy, h, v, t) {
    const active = v.working && !v.dormant && ((h.seed % 3) !== 0); // some windows glow when the repo is busy
    ctx.globalAlpha = Math.min(1, v.life * 1.2) * (v.dormant ? 0.66 : 1);
    if (this.world().style === "cozy") this.drawCottage(ctx, sx, sy, this.houseOpts(h.seed, active), t);
    else this.drawDarkHouse(ctx, sx, sy, h, active, t);
    ctx.globalAlpha = 1;
  }
  // A sci-fi box dwelling for the dark worlds (Cyber/Orbital/Silicon).
  drawDarkHouse(ctx, sx, sy, h, active, t) { const z = this.cam.z, w = this.world(), pal = w.pal;
    const bw = this.A * 0.2 * z, bh = this.B * 0.2 * z, ht = (8 + (h.seed % 3) * 5) * z;
    this.box(ctx, sx, sy, bw, bh, ht, pal.wallA, w.roof || pal.wallB, { win: active });
    if (active) { ctx.fillStyle = this.rgbaA(pal.window, 0.85); ctx.fillRect(sx - 1.4 * z, sy - ht - 2 * z, 2.8 * z, 2 * z); } }

  /* ---------- roads (linking the villages) ---------- */
  // Nearest-neighbour edges between village anchors → a connected lane network.
  buildRoads() {
    const vs = [...this.villages.values()].filter((v) => v.cells && v.cells.length);
    const sig = vs.map((v) => v.id).sort().join("|");
    if (sig === this._roadSig) return; this._roadSig = sig; this.roads = [];
    if (vs.length < 2) return;
    const edges = new Set();
    for (const v of vs) {
      const wv = this.worldPos(v.anchor);
      const near = vs.filter((o) => o !== v).map((o) => { const w = this.worldPos(o.anchor); return { o, d: (w.x - wv.x) ** 2 + ((w.y - wv.y) * 2) ** 2 }; }).sort((a, b) => a.d - b.d);
      for (const { o } of near.slice(0, 2)) { const key = [v.id, o.id].sort().join("→"); if (!edges.has(key)) { edges.add(key); this.roads.push([v.anchor, o.anchor]); } }
    }
  }
  drawRoads(ctx, t) {
    this.buildRoads(); if (!this.roads.length) return;
    const z = this.cam.z, cozy = this.world().cozy, pal = this.world().pal;
    const wRoad = Math.max(3, z * 7);
    for (const [a, b] of this.roads) {
      const pts = this.gridPath(a, b).map((c) => { const s = this.project(this.worldPos(c)); return [s.x, s.y]; });
      if (pts.length < 2) continue;
      ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
      // bed
      ctx.strokeStyle = cozy ? this.rgbaA("#8a6a44", 0.5) : this.rgbaA(pal.road, 0.35); ctx.lineWidth = wRoad + 2;
      ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke();
      // surface
      ctx.strokeStyle = cozy ? this.rgbaA(this.cozyPal.path, 0.92) : this.rgbaA(pal.road, 0.7); ctx.lineWidth = wRoad;
      ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke();
      // centre dashes
      ctx.strokeStyle = cozy ? this.rgbaA(this.cozyPal.pathDk, 0.5) : this.rgbaA(pal.window, 0.4); ctx.lineWidth = Math.max(1, z); ctx.setLineDash([z * 5, z * 6]);
      ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke();
      ctx.restore();
    }
  }

  /* ---------- villages: borders, banners & caravans ---------- */
  // The four iso edges of a tile whose neighbour isn't in the village → the cluster outline.
  drawVillageBorders(ctx, t) {
    if (this.villages.size < 1) return;
    const z = this.cam.z, a = this.A * z, b = this.B * z;
    for (const v of this.villages.values()) {
      if (!v.cells || !v.cells.length) continue;
      if (v.life <= 0.02) continue;
      const al = Math.min(1, v.life * 1.2);
      const has = (cx, cy) => v.cellSet.has(cx + "," + cy);
      const path = new Path2D();
      for (const cell of v.cells) {
        const s = this.project(this.worldPos(cell));
        const T = [s.x, s.y - b], R = [s.x + a, s.y], Bm = [s.x, s.y + b], L = [s.x - a, s.y];
        if (!has(cell.cx, cell.cy - 1)) { path.moveTo(T[0], T[1]); path.lineTo(R[0], R[1]); } // top-right
        if (!has(cell.cx + 1, cell.cy)) { path.moveTo(R[0], R[1]); path.lineTo(Bm[0], Bm[1]); } // bottom-right
        if (!has(cell.cx, cell.cy + 1)) { path.moveTo(Bm[0], Bm[1]); path.lineTo(L[0], L[1]); } // bottom-left
        if (!has(cell.cx - 1, cell.cy)) { path.moveTo(L[0], L[1]); path.lineTo(T[0], T[1]); } // top-left
      }
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.strokeStyle = this.rgbaA("#0a0d10", 0.4 * al); ctx.lineWidth = Math.max(2.4, 3 * z); ctx.stroke(path); // shadow for contrast on grass
      ctx.strokeStyle = this.rgbaA(this.tint(v.accent, 0.12), 0.85 * al); ctx.lineWidth = Math.max(1.4, 1.8 * z); ctx.stroke(path);
      ctx.lineCap = "butt"; ctx.lineJoin = "miter";
    }
  }
  // A banner above each village: repo name (+ agent count) + tier + git stats + resource pips.
  drawVillageBanners(ctx, t) {
    const z = this.cam.z;
    for (const v of this.villages.values()) {
      if (!v.cells || !v.cells.length || v.life <= 0.02) continue;
      // Float above the highest house of the cluster, centred over the footprint.
      let minY = 1e9, sumX = 0, n = 0;
      const pts = (v.houses && v.houses.length) ? v.houses : [v.green];
      for (const h of pts) { const s = this.project({ x: h.wx, y: h.wy }); if (s.y < minY) minY = s.y; sumX += s.x; n++; }
      const al = Math.min(1, v.life * 1.2);
      this.drawBanner(ctx, sumX / n, minY - 30 * z, v, al, v.agents.length);
    }
  }
  drawBanner(ctx, sx, sy, v, al, agents) {
    const info = v.info, tier = v.tier;
    ctx.save(); ctx.globalAlpha = al;
    const name = v.name || v.id;
    const cnt = agents > 0 ? "·" + agents : "";
    const tierTxt = tier.name + (info.real ? "" : " ~");
    const ny = info.real ? `${info.commits}c·${this.ageStr(info.ageDays)}·${info.contributors}d` : `${info.commits}c·${this.ageStr(info.ageDays)}`;
    ctx.font = "800 11px 'JetBrains Mono',monospace"; ctx.textBaseline = "middle";
    const nameW = ctx.measureText(name).width, cntW = cnt ? ctx.measureText(cnt).width + 6 : 0;
    ctx.font = "700 9px 'JetBrains Mono',monospace"; const subW = ctx.measureText(tierTxt).width + 12 + ctx.measureText(ny).width;
    const top = this.resKeys.map((k) => ({ k, n: v.stock[k] })).filter((r) => r.n >= 1).sort((a2, b2) => b2.n - a2.n).slice(0, 4);
    const pipW = top.length ? top.length * 34 : 0;
    const w = Math.max(nameW + cntW + 30, subW + 16, pipW + 12, 96), h = top.length ? 42 : 30;
    const x = Math.round(sx - w / 2), y = Math.round(sy - h);
    // plaque + accent header
    ctx.fillStyle = "rgba(12,13,18,0.9)"; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = this.rgbaA(v.accent, 0.95); ctx.fillRect(x, y, w, 3);
    // name + agent count + tier rank pips (gold squares, top-right)
    ctx.textAlign = "left"; ctx.fillStyle = "#f1ede4"; ctx.font = "800 11px 'JetBrains Mono',monospace"; ctx.fillText(name, x + 8, y + 12);
    if (cnt) { ctx.fillStyle = this.rgbaA(v.accent, 0.95); ctx.fillText(cnt, x + 8 + nameW + 6, y + 12); }
    for (let i = 0; i <= tier.rank; i++) { ctx.fillStyle = "#e0c24a"; ctx.fillRect(x + w - 7 - (tier.rank - i) * 5 - 3, y + 7, 3, 3); }
    // tier + git stat line
    ctx.font = "700 9px 'JetBrains Mono',monospace"; ctx.fillStyle = "#9aa6b4"; ctx.fillText(tierTxt, x + 8, y + 23);
    ctx.fillStyle = "#5b636f"; ctx.textAlign = "right"; ctx.fillText(ny, x + w - 8, y + 23); ctx.textAlign = "left";
    // resource pips
    if (top.length) { let bx = x + 8; for (const r of top) { ctx.fillStyle = this.resMeta[r.k].color; ctx.fillRect(bx, y + 31, 7, 7); ctx.fillStyle = "#cdd3dc"; ctx.font = "700 9px 'JetBrains Mono',monospace"; ctx.fillText(String(Math.round(r.n)), bx + 10, y + 35); bx += 34; } }
    ctx.restore();
  }
  ageStr(days) { if (days >= 365) return (days / 365).toFixed(days >= 730 ? 0 : 1) + "y"; if (days >= 30) return Math.round(days / 30) + "mo"; return Math.max(0, days) + "d"; }
  // A trader hauling a sack of one resource between villages (reuses the pixel-person sprite).
  drawCaravan(ctx, x, y, c, t) {
    const z = this.cam.z, sc = Math.max(0.85, Math.min(1.4, z)), walking = c.state === "go";
    ctx.save(); ctx.globalAlpha = c.fade;
    const bob = walking ? Math.abs(Math.sin(c.phase)) * -1.6 * sc : 0;
    this.drawPerson(ctx, x, y, c, sc, c.phase, "think", c.faceLeft, bob);
    // a sack of goods on the back, tinted by resource
    const col = this.resMeta[c.res].color, side = c.faceLeft ? 1 : -1, hx = x + side * 6 * z, hy = y - 12 * sc + bob;
    this.ell(ctx, hx, hy + 5 * z, 4 * z, 2 * z, "rgba(0,0,0,0.25)");
    this.poly(ctx, [[hx - 3.4 * z, hy], [hx + 3.4 * z, hy], [hx + 2.6 * z, hy + 5 * z], [hx - 2.6 * z, hy + 5 * z]], this.shade(col, 0.85));
    this.poly(ctx, [[hx - 3.4 * z, hy], [hx + 3.4 * z, hy], [hx + 2.2 * z, hy - 1.6 * z], [hx - 2.2 * z, hy - 1.6 * z]], col);
    ctx.fillStyle = this.rgbaA("#1a1410", 0.6); ctx.fillRect(hx - 0.6 * z, hy - 1.6 * z, 1.2 * z, 1.6 * z);
    if (c.say && t < c.sayUntil && !walking) this.speech(ctx, x, y - 20 * sc + bob, c.say);
    else if (c.say && t < c.sayUntil) this.speech(ctx, x, y - 22 * sc + bob, c.say);
    ctx.restore();
  }

  /* ---------- HUD ---------- */
  drawHUD(ctx) { const pw = 224, px = this._W - pw - 14, py = 14, ph = this._H - 28;
    ctx.fillStyle = "rgba(13,15,20,0.9)"; ctx.fillRect(px, py, pw, ph); ctx.strokeStyle = "#262d38"; ctx.lineWidth = 1; ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
    const live = this.simPool(); let tot = 0; for (const p of live) tot += p.agents.length;
    ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillStyle = "#cdd3dc"; ctx.font = "700 11px 'JetBrains Mono',monospace"; ctx.fillText("VILLAGES", px + 12, py + 18);
    ctx.fillStyle = "#5b636f"; ctx.font = "10px 'JetBrains Mono',monospace"; ctx.textAlign = "right"; ctx.fillText(this.world().label.toLowerCase() + " · " + live.filter(p => !p.dormant).length + " active", px + pw - 12, py + 18); ctx.textAlign = "left";
    const rows = [...live].sort((a, b) => b.agents.length - a.agents.length); const rowH = 34, top = py + 36, max = Math.floor((ph - 58 - 22) / rowH);
    for (let i = 0; i < Math.min(rows.length, max); i++) { const p = rows[i], y = top + i * rowH; this.ell(ctx, px + 18, y + 9, 5, 5, p.dormant ? this.rgbaA(p.color, 0.4) : p.color);
      ctx.fillStyle = p.dormant ? "#7e8794" : "#e2e7ee"; ctx.font = "600 11px 'JetBrains Mono',monospace"; let nm = p.name; if (ctx.measureText(nm).width > 100) nm = nm.slice(0, 13); ctx.fillText(nm, px + 30, y + 9);
      const tierTxt = p.tier ? p.tier.name : ""; ctx.fillStyle = p.dormant ? "#5b636f" : "#7e8794"; ctx.font = "10px 'JetBrains Mono',monospace"; ctx.textAlign = "right"; ctx.fillText(p.dormant ? "idle" : (p.agents.length + "a · " + tierTxt), px + pw - 12, y + 9); ctx.textAlign = "left";
      const counts = {}; for (const ag of p.agents) counts[ag.act] = (counts[ag.act] || 0) + 1; let bx = px + 30; const sy = y + 20;
      for (const act in counts) { if (bx > px + pw - 16) break; ctx.fillStyle = (this.acts[act] || this.acts.edit).color; for (let c = 0; c < counts[act] && bx < px + pw - 16; c++) { ctx.fillRect(bx, sy, 7, 7); bx += 9; } bx += 4; } }
    if (rows.length > max) { ctx.fillStyle = "#5b636f"; ctx.font = "10px 'JetBrains Mono',monospace"; ctx.fillText("+" + (rows.length - max) + " more", px + 12, top + max * rowH + 6); }
    // Stores: total resources held across all villages (the Ploutos economy).
    const eco = { timber: 0, iron: 0, lore: 0, spice: 0, grain: 0 }; for (const v of this.villages.values()) for (const k of this.resKeys) eco[k] += v.stock[k];
    const ey = py + ph - 26 - 21;
    ctx.fillStyle = "#141922"; ctx.fillRect(px + 1, ey, pw - 2, 21);
    ctx.fillStyle = "#7e8794"; ctx.font = "700 9px 'JetBrains Mono',monospace"; ctx.textAlign = "left"; ctx.fillText("STORES", px + 12, ey + 11);
    let bx = px + 58; for (const k of this.resKeys) { ctx.fillStyle = this.resMeta[k].color; ctx.fillRect(bx, ey + 6, 7, 7); ctx.fillStyle = "#cdd3dc"; ctx.font = "700 9px 'JetBrains Mono',monospace"; ctx.fillText(String(Math.round(eco[k])), bx + 10, ey + 11); bx += 32; }
    ctx.fillStyle = "#1b2029"; ctx.fillRect(px + 1, py + ph - 26, pw - 2, 25); ctx.fillStyle = "#7fd0cb"; ctx.font = "700 11px 'JetBrains Mono',monospace"; ctx.fillText(tot + " citizens", px + 12, py + ph - 13);
    const car = this.caravans.length;
    ctx.fillStyle = "#56b870"; ctx.textAlign = "right"; ctx.fillText(car ? car + " caravan" + (car > 1 ? "s" : "") : "live", px + pw - 12, py + ph - 13); ctx.textAlign = "left"; }

  /* ---------- main render ---------- */
  resize() { const cv = this.canvas; if (!cv) return; const r = cv.getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); this._townW = r.width; this._townH = r.height; this._dpr = dpr; this.useTownViewport(); }
  useTownViewport() { this._W = this._townW; this._H = this._townH; this._vcx = this.leftGutter + (this._townW - this.leftGutter - 250) / 2; this._vcy = this._townH / 2; }
  setLeftGutter(px) { this.leftGutter = px || 0; }
  drawTown(t) { const cv = this.canvas; if (!cv) return; this.useTownViewport(); const ctx = cv.getContext("2d");
    this.ensureStaticBg();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
    if (this._sbg) ctx.drawImage(this._sbg, 0, 0);
    ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0); ctx.imageSmoothingEnabled = false;
    this.drawAnimatedBg(ctx);
    const live = this.projects.filter(p => p.life > 0.02);
    // Land/beach structure only changes when the set of live footprint cells changes — cache it.
    const sig = live.flatMap(p => (p.cells || [p.cell]).map(c => c.cx + "," + c.cy)).sort().join("|");
    if (sig !== this._landSig) { this._land = this.computeLand(live).land; this._landSig = sig; }
    this.drawGround(ctx, this._land);
    this.drawRoads(ctx, t);          // lanes linking the villages
    this.drawVillageBorders(ctx, t); // faint palisade tracing each repo's footprint
    const cozyTown = this.world().style === "cozy";
    const liveV = [...this.villages.values()].filter(v => v.life > 0.02);
    // Village green: a well + worn radial lanes out to each house (cozy worlds).
    if (cozyTown) for (const v of liveV) { const cs = this.project({ x: v.green.wx, y: v.green.wy + this.B * 0.4 });
      ctx.globalAlpha = Math.min(1, v.life * 1.2);
      for (const h of (v.houses || [])) { const ho = this.project({ x: h.wx, y: h.wy + 8 }); this.pathStrip(ctx, [[cs.x, cs.y], [ho.x, ho.y]], Math.max(2, this.cam.z * 2)); }
      ctx.globalAlpha = 1; }
    // Depth = feet position (wy/B). Walkers get only a hair of forward bias so they sort by
    // their feet against the houses — enough to stand in a front yard, not enough to render
    // over a house they're actually behind. `_hov` collects hover hit-boxes (screen space).
    const z = this.cam.z, rl = [], hov = this._hov = [];
    const personBox = (s, d, c) => hov.push({ x0: s.x - 9 * z, x1: s.x + 9 * z, y0: s.y - 22 * z, y1: s.y + 4 * z, d, ...c });
    const houseBox = (s, d, c) => hov.push({ x0: s.x - 32 * z, x1: s.x + 32 * z, y0: s.y - 48 * z, y1: s.y + 6 * z, d, ...c });
    for (const v of liveV) {
      if (cozyTown) { const wy = v.green.wy; rl.push({ d: wy / this.B - 0.3, fn: () => { const cs = this.project({ x: v.green.wx, y: v.green.wy + this.B * 0.4 }); ctx.globalAlpha = Math.min(1, v.life * 1.2); this.drawWell(ctx, cs.x, cs.y, this.cam.z * 3.6, t); ctx.globalAlpha = 1; } }); }
      for (const h of (v.houses || [])) { const s = this.project({ x: h.wx, y: h.wy }); const d = h.wy / this.B; rl.push({ d, fn: () => this.drawHouse(ctx, s.x, s.y, h, v, t) }); houseBox(s, d, { title: (h.portion || "src") + "/", sub: "part of " + v.name + " · " + v.tier.name, accent: v.accent }); }
      for (const a of v.agents) { const s = this.project({ x: a.wx, y: a.wy }); const d = a.wy / this.B + 0.05; rl.push({ d, fn: () => this.drawWalker(ctx, s.x, s.y, a, t) }); personBox(s, d, { title: this.factionLabel(a.faction) + " agent", sub: (this.acts[a.act] ? this.acts[a.act].label : a.act) + " · " + v.name, accent: this.factions[a.faction] || v.accent }); }
      for (const n of v.residents) { const s = this.project({ x: n.wx, y: n.wy }); const d = n.wy / this.B + 0.05; rl.push({ d, fn: () => this.drawNPC(ctx, s.x, s.y, n, t) }); personBox(s, d, { title: "Villager", sub: "resident of " + v.name, accent: v.accent }); }
    }
    for (const p of this.projects) { if (!p.civic || p.life <= 0.02) continue; rl.push({ d: p.cell.cx + p.cell.cy, fn: () => this.drawParcel(ctx, p, t) }); }
    for (const n of this.npcs) { const sc = this.project({ x: n.wx, y: n.wy }); const d = n.wy / this.B + 0.05; rl.push({ d, fn: () => this.drawNPC(ctx, sc.x, sc.y, n, t) }); personBox(sc, d, { title: "Townsfolk", sub: "wandering the commons", accent: "#7fd0cb" }); }
    for (const c of this.caravans) { const sc = this.project({ x: c.wx, y: c.wy }); const d = c.wy / this.B + 0.12; rl.push({ d, fn: () => this.drawCaravan(ctx, sc.x, sc.y, c, t) }); personBox(sc, d, { title: "Trade caravan", sub: "hauling " + this.resMeta[c.res].label, accent: this.resMeta[c.res].color }); }
    rl.sort((u, v) => u.d - v.d); for (const it of rl) it.fn();
    this.drawVillageBanners(ctx, t); // repo name + tier + stockpile, above each cluster
    this.drawHUD(ctx);
    this.drawHover(ctx); }

  factionLabel(f) { return ({ claude: "Claude", codex: "Codex", grok: "Grok", custom: "Local / other" })[f] || "Agent"; }
  // Tooltip for whatever the cursor is over (the front-most hit-box from the last frame).
  drawHover(ctx) {
    const hp = this._hoverPos, hov = this._hov;
    let best = null;
    if (hp && hov) for (const c of hov) { if (hp.x >= c.x0 && hp.x <= c.x1 && hp.y >= c.y0 && hp.y <= c.y1 && (!best || c.d > best.d)) best = c; }
    if (this.canvas) this.canvas.style.cursor = best ? "help" : "default";
    if (!best) return;
    ctx.font = "700 11px 'JetBrains Mono',monospace"; ctx.textBaseline = "alphabetic";
    const titleW = ctx.measureText(best.title).width;
    ctx.font = "600 10px 'JetBrains Mono',monospace"; const subW = best.sub ? ctx.measureText(best.sub).width : 0;
    const w = Math.max(titleW, subW) + 18, h = best.sub ? 34 : 22;
    let x = hp.x + 14, y = hp.y + 14;
    if (x + w > this._W - 4) x = hp.x - w - 14; if (x < 4) x = 4;
    if (y + h > this._H - 4) y = hp.y - h - 14; if (y < 4) y = 4;
    ctx.fillStyle = "rgba(12,13,18,0.94)"; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = best.accent || "#7fd0cb"; ctx.fillRect(x, y, 3, h);
    ctx.textAlign = "left"; ctx.fillStyle = "#f1ede4"; ctx.font = "700 11px 'JetBrains Mono',monospace"; ctx.fillText(best.title, x + 9, y + (best.sub ? 14 : 15));
    if (best.sub) { ctx.fillStyle = "#9aa6b4"; ctx.font = "600 10px 'JetBrains Mono',monospace"; ctx.fillText(best.sub, x + 9, y + 27); }
  }

  start() {
    this.resize(); this.rebuildBg();
    window.addEventListener("resize", () => this.resize());
    const frameMs = 1000 / 30; // ambient scene — 30fps is plenty and halves render cost
    let last = performance.now();
    const loop = (now) => {
      this._raf = requestAnimationFrame(loop); // schedule first so one bad frame never stops the city
      now = now || performance.now();
      const elapsed = now - last;
      if (elapsed < frameMs - 2) return; // frame-rate cap
      last = now;
      const dt = Math.max(0, Math.min(0.05, elapsed / 1000));
      const t = now / 1000;
      try { this.useTownViewport(); this.update(dt, t); if (!this.userControlled) this.updateCamera(dt); this.drawTown(t); }
      catch (err) { console.error("city loop:", err && err.message); }
    };
    this._raf = requestAnimationFrame(loop);
  }
}
