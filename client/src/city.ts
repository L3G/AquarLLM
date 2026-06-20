// @ts-nocheck
/**
 * AquarLLM — The Living City.
 *
 * Ported from the Claude Design canvas prototype (high-fidelity procedural pixel-art
 * isometric city). The original's auto-simulation is replaced by the real agent feed:
 * `syncAgents()` maps Hermes' AgentState[] onto the prototype's project/citizen model,
 * keyed by folder (project) and agentId (citizen) so walk/animation state persists.
 * All rendering, camera, ground/streets, rooms, furniture, citizens and HUD are kept
 * verbatim from the design. Raw 2D canvas (sanctioned by the handoff README).
 */
import type { AgentState } from "@aquarllm/shared";

// Hermes Activity → design activity.
const ACT_MAP: Record<string, string> = {
  reading: "read",
  editing: "edit",
  running: "run",
  searching: "search",
  thinking: "think",
  waiting: "wait",
  idle: "idle",
  error: "error",
  joined: "think",
  spawning: "think",
  left: "idle",
};

export class LivingCity {
  constructor(canvas) {
    this.canvas = canvas;
    this.state = { world: "harbor" };
    this.cam = { x: 0, y: 0, z: 0.85 };
    this._cache = {};
    this.userControlled = false;
    this.leftGutter = 0; // px reserved on the left for the activity panel

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
    };
    this.body = ["...HHHHHH...", "..HHHHHHHH..", ".HHHHHHHHHH.", ".HKKKKKKKKH.", ".HKKWKKWKKH.", ".HKKKKKKKKH.", ".HKKkkkkKKH.", "..KKKKKKKK..", "...SSSSSS...", "..SSSSSSSS..", ".sSSSSSSSSs.", "KsSSSSSSSSsK", "KsSSSSSSSSsK", ".sSSSSSSSSs.", "..PPPPPPPP..", "..PPP..PPP..", "..PPP..PPP..", "..BB....BB.."];

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
    this.anchors = { read: { x: -44, y: -10 }, think: { x: -15, y: -18 }, edit: { x: 15, y: -18 }, run: { x: 44, y: -10 }, search: { x: 34, y: 14 }, wait: { x: -34, y: 14 } };
    this.bedSlots = [{ x: -18, y: 26 }, { x: 4, y: 30 }, { x: 24, y: 24 }, { x: -2, y: 18 }];
    this.phrases = { read: ["reading…", "utils.go", "config.rs", "what is this?"], edit: ["fixing it", "refactor", "+ tests", "almost…"], run: ["$ build", "$ test", "npm ci", "deploying"], search: ["docs?", "grep -r", "how do I…", "found it!"], think: ["hmm…", "planning", "let me think", "what if…"], wait: ["your call?", "review pls", "blocked", "waiting…"], error: ["uh oh", "✗ failed", "retrying", "broken!"] };

    this.projects = []; this.occ = {}; this.projByName = new Map();
    this._pid = 0;
    this.edge4 = [[1, 0], [0, 1], [-1, 0], [0, -1]];

    this._initControls();
  }
  world() { return this.worlds[this.state.world]; }
  get worldKey() { return this.state.world; }
  setWorld(k) { if (!this.worlds[k]) return; this.state.world = k; this.rebuildBg(); }

  hx(h) { h = h.replace("#", ""); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  shade(h, f) { const c = this.hx(h); return "rgb(" + Math.round(c[0] * f) + "," + Math.round(c[1] * f) + "," + Math.round(c[2] * f) + ")"; }
  tint(h, f) { const c = this.hx(h); return "rgb(" + Math.round(c[0] + (255 - c[0]) * f) + "," + Math.round(c[1] + (255 - c[1]) * f) + "," + Math.round(c[2] + (255 - c[2]) * f) + ")"; }
  rgbaA(h, a) { const c = this.hx(h); return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + Math.max(0, a) + ")"; }
  rnd(a, b) { return a + Math.random() * (b - a); }
  pickArr(a) { return a[Math.floor(Math.random() * a.length)]; }
  hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }

  buildCanvas(map, pal, scale) { const h = map.length, w = map[0].length; const cv = document.createElement("canvas"); cv.width = w * scale; cv.height = h * scale; const c = cv.getContext("2d"); c.imageSmoothingEnabled = false; for (let r = 0; r < h; r++)for (let x = 0; x < w; x++) { const ch = map[r][x]; if (!ch || ch === "." || ch === " ") continue; const col = (typeof pal === "string") ? (ch === "1" ? pal : null) : pal[ch]; if (!col) continue; c.fillStyle = col; c.fillRect(x * scale, r * scale, scale, scale); } return cv; }
  glyphCv(name, color, scale) { const k = "g" + name + color + scale; if (this._cache[k]) return this._cache[k]; return this._cache[k] = this.buildCanvas(this.glyphs[name], color, scale); }
  sprite(fk) { const k = "sp" + fk; if (this._cache[k]) return this._cache[k]; const f = this.factions[fk]; const pal = { H: "#52402f", K: "#e8b48c", k: "#c9926a", W: "#241f2e", S: f, s: this.shade(f, 0.68), P: "#3a4658", B: "#23272f" }; return this._cache[k] = this.buildCanvas(this.body, pal, 2); }

  poly(ctx, pts, fill) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); }
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
  centroidCell() { const a = this.projects.filter(p => !p.removing); if (!a.length) return { cx: 0, cy: 0 }; let sx = 0, sy = 0; for (const p of a) { sx += p.cell.cx; sy += p.cell.cy; } return { cx: sx / a.length, cy: sy / a.length }; }
  placeCell() { const keys = Object.keys(this.occ); if (!keys.length) return { cx: 0, cy: 0 }; const ctr = this.centroidCell(); const cand = {};
    for (const key of keys) { const [cx, cy] = key.split(",").map(Number); for (const d of this.edge4) { const nx = cx + d[0], ny = cy + d[1], nk = nx + "," + ny; if (this.occ[nk]) continue; const dist = Math.hypot(nx - ctr.cx, ny - ctr.cy) + Math.random() * 1.2; if (cand[nk] === undefined || dist < cand[nk].d) cand[nk] = { d: dist, cx: nx, cy: ny }; } }
    let best = null; for (const nk in cand) { if (!best || cand[nk].d < best.d) best = cand[nk]; } return best ? { cx: best.cx, cy: best.cy } : { cx: 0, cy: 0 }; }
  retarget(p, a, i) { if (a.act === "idle") { const bs = this.bedSlots[i % this.bedSlots.length]; a.tx = bs.x; a.ty = bs.y; a.bed = true; return; } const an = this.anchors[a.act === "error" ? "run" : a.act] || this.anchors.edit; a.tx = an.x + this.rnd(-9, 9); a.ty = an.y + this.rnd(3, 9); a.bed = false; }
  layoutAgents(p) { p.agents.forEach((a, i) => this.retarget(p, a, i)); }
  newAgent(kind, act) { return { faction: this.factions[kind] ? kind : "custom", act, phase: Math.random() * 6, lx: this.rnd(-12, 12), ly: 34, tx: 0, ty: 0, walking: true, faceLeft: false, wanderT: this.rnd(2, 5), sayT: this.rnd(1, 5), say: "", sayUntil: 0, detail: "" }; }

  createProject(name) {
    const cell = this.placeCell(); this.occ[cell.cx + "," + cell.cy] = 1;
    const color = this.colorPool[this.hashStr(name) % this.colorPool.length];
    const p = { id: ++this._pid, name, color, cell, agents: [], agentById: new Map(), life: 0, target: 1, removing: false, born: performance.now() };
    this.projects.push(p); this.projByName.set(name, p);
    return p;
  }
  retireProject(p) { p.removing = true; p.target = 0; }

  /** Map the live agent feed onto the project/citizen model. */
  syncAgents(states: AgentState[]) {
    const byProj = new Map();
    for (const s of states) { const key = s.project || "·"; if (!byProj.has(key)) byProj.set(key, []); byProj.get(key).push(s); }

    const seen = new Set();
    for (const [name, list] of byProj) {
      seen.add(name);
      let p = this.projByName.get(name);
      if (!p) p = this.createProject(name);
      p.target = 1; p.removing = false;

      const agentSeen = new Set();
      list.forEach((st, idx) => {
        agentSeen.add(st.agentId);
        const act = ACT_MAP[st.activity] || "think";
        let a = p.agentById.get(st.agentId);
        if (!a) {
          a = this.newAgent(st.agentKind, act); a.__id = st.agentId;
          p.agents.push(a); p.agentById.set(st.agentId, a);
          this.retarget(p, a, p.agents.length - 1);
        } else if (a.act !== act) {
          a.act = act; this.retarget(p, a, p.agents.indexOf(a)); a.sayT = 0.4;
        }
        a.faction = this.factions[st.agentKind] ? st.agentKind : "custom";
        a.detail = st.detail ? String(st.detail).slice(0, 20) : "";
      });

      for (let i = p.agents.length - 1; i >= 0; i--) {
        const a = p.agents[i];
        if (a.__id && !agentSeen.has(a.__id)) { p.agents.splice(i, 1); p.agentById.delete(a.__id); }
      }
      if (!p.agents.length) this.retireProject(p);
    }

    for (const [name, p] of this.projByName) { if (!seen.has(name)) this.retireProject(p); }
  }

  /* ---------- physics (per frame) ---------- */
  update(dt, t) {
    for (let i = this.projects.length - 1; i >= 0; i--) {
      const p = this.projects[i]; p.life += (p.target - p.life) * Math.min(1, dt * 3);
      p.agents.forEach((a, ai) => {
        if (p.removing) { a.tx = this.rnd(-8, 8); a.ty = 36; a.bed = false; }
        const dx = a.tx - a.lx, dy = a.ty - a.ly, d = Math.hypot(dx, dy);
        if (d > 1.6) { const step = Math.min(d, this.walkSpeed * dt); a.lx += dx / d * step; a.ly += dy / d * step; a.walking = true; if (dx < -0.3) a.faceLeft = true; else if (dx > 0.3) a.faceLeft = false; }
        else { a.walking = false; a.wanderT -= dt; if (a.wanderT <= 0) { if (a.act !== "idle") this.retarget(p, a, ai); a.wanderT = this.rnd(3, 7); } }
        a.phase += dt * (a.walking ? 7 : (a.act === "idle" ? 1.2 : 3));
        if (!a.walking && a.act !== "idle") { a.sayT -= dt; if (a.sayT <= 0) { a.say = a.detail || this.pickArr(this.phrases[a.act === "error" ? "error" : a.act] || ["…"]); a.sayUntil = t + 2.6; a.sayT = this.rnd(4, 9); } }
      });
      if (p.removing && p.life < 0.02) { delete this.occ[p.cell.cx + "," + p.cell.cy]; this.projects.splice(i, 1); this.projByName.delete(p.name); }
    }
  }

  /* ---------- camera ---------- */
  project(w) { return { x: this._vcx + (w.x - this.cam.x) * this.cam.z, y: this._vcy + (w.y - this.cam.y) * this.cam.z }; }
  updateCamera(dt) { const live = this.projects.filter(p => p.life > 0.05); if (!live.length) return; let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    for (const p of live) { const w = this.worldPos(p.cell); minx = Math.min(minx, w.x); maxx = Math.max(maxx, w.x); miny = Math.min(miny, w.y); maxy = Math.max(maxy, w.y); }
    const pad = 150; const bw = (maxx - minx) + pad * 2, bh = (maxy - miny) + pad * 2; const availW = this._W - 250 - this.leftGutter, availH = this._H - 30;
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
    cv.addEventListener("pointerdown", (e) => { drag = true; lx = e.clientX; ly = e.clientY; try { cv.setPointerCapture(e.pointerId); } catch {} });
    cv.addEventListener("pointermove", (e) => { if (!drag) return; this.userControlled = true; this.cam.x -= (e.clientX - lx) / this.cam.z; this.cam.y -= (e.clientY - ly) / this.cam.z; lx = e.clientX; ly = e.clientY; });
    const end = () => (drag = false); cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
    window.addEventListener("keydown", (e) => {
      if (e.key === "f" || e.key === "F") { this.userControlled = false; return; }
      const f = (e.key === "+" || e.key === "=") ? 1.18 : (e.key === "-" || e.key === "_") ? 0.85 : 0;
      if (!f) return; this.userControlled = true; this.zoomAt((this._W - 250) / 2, this._H / 2, f);
    });
  }
  zoomAt(sx, sy, factor) { const z = this.cam.z, z2 = Math.max(0.3, Math.min(2.5, z * factor)); this.cam.x += (sx - this._vcx) * (1 / z - 1 / z2); this.cam.y += (sy - this._vcy) * (1 / z - 1 / z2); this.cam.z = z2; }

  /* ---------- background ---------- */
  rebuildBg() { const w = this.world(); this._bg = {};
    if (w.bg.stars) { const s = []; for (let i = 0; i < 150; i++)s.push({ x: Math.random(), y: Math.random(), r: Math.random() < 0.85 ? 1 : 2, a: this.rnd(0.3, 1), tw: Math.random() * 6 }); this._bg.stars = s; }
    if (w.bg.board) { const tr = []; for (let i = 0; i < 28; i++)tr.push({ x: Math.random(), y: Math.random(), len: this.rnd(0.06, 0.22), dir: Math.random() < 0.5 ? 0 : 1, bend: Math.random() < 0.5 }); this._bg.traces = tr; } }
  drawBackground(ctx) { const w = this.world(); ctx.fillStyle = w.bg.top; ctx.fillRect(0, 0, this._W, this._H);
    if (w.bg.sky) { const g = ctx.createLinearGradient(0, 0, 0, this._H); g.addColorStop(0, "#20335a"); g.addColorStop(0.6, "#16233c"); g.addColorStop(1, "#101a2e"); ctx.fillStyle = g; ctx.fillRect(0, 0, this._W, this._H); }
    if (w.bg.stars && this._bg.stars) { const tt = performance.now() / 1000; for (const s of this._bg.stars) { const a = s.a * (0.6 + 0.4 * Math.sin(tt + s.tw)); ctx.fillStyle = "rgba(220,230,255," + a.toFixed(2) + ")"; ctx.fillRect(Math.round(s.x * this._W), Math.round(s.y * this._H), s.r, s.r); } }
    if (w.bg.board && this._bg.traces) { ctx.strokeStyle = "rgba(60,150,90,0.18)"; ctx.lineWidth = 2; for (const tr of this._bg.traces) { const x = tr.x * this._W, y = tr.y * this._H, L = tr.len * this._W; ctx.beginPath(); if (tr.dir === 0) { ctx.moveTo(x, y); ctx.lineTo(x + L, y); if (tr.bend) ctx.lineTo(x + L, y + L * 0.5); } else { ctx.moveTo(x, y); ctx.lineTo(x, y + L); if (tr.bend) ctx.lineTo(x + L * 0.5, y + L); } ctx.stroke(); ctx.fillStyle = "rgba(120,200,140,0.22)"; ctx.fillRect(x - 2, y - 2, 4, 4); } }
    if (w.bg.grid) { ctx.strokeStyle = "rgba(120,80,170,0.07)"; ctx.lineWidth = 1; const g = 64; for (let i = -this._H; i < this._W + this._H; i += g) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + this._H, this._H); ctx.stroke(); ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i - this._H, this._H); ctx.stroke(); } }
    this.ell(ctx, (this._W - 250) / 2, this._H * 0.5, this._W * 0.5, this._H * 0.42, w.bg.glow);
    if (this.state.world === "harbor") { const cx = (this._W - 250) / 2, cy = this._H * 0.52, tt = performance.now() / 1000;
      this.ell(ctx, cx, cy + 24, this._W * 0.46, this._H * 0.34, "rgba(46,110,120,0.16)");
      this.ell(ctx, cx, cy + 24, this._W * 0.33, this._H * 0.23, "rgba(64,138,142,0.14)");
      ctx.strokeStyle = "rgba(150,205,208,0.09)"; ctx.lineWidth = 1.5;
      for (let i = 0; i < 7; i++) { const yy = cy - 66 + i * 34 + Math.sin(tt + i) * 3, xw = this._W * 0.30 * (1 - Math.abs(i - 3) / 5.5); ctx.beginPath(); ctx.moveTo(cx - xw, yy); ctx.lineTo(cx - xw * 0.45, yy); ctx.moveTo(cx + xw * 0.45, yy); ctx.lineTo(cx + xw, yy); ctx.stroke(); }
      this.drawBoat(ctx, cx - this._W * 0.33, cy + 6, tt, 0); this.drawBoat(ctx, cx + this._W * 0.31, cy + 44, tt, 1); this.drawBoat(ctx, cx - this._W * 0.10, cy + this._H * 0.33, tt, 2);
      ctx.strokeStyle = "rgba(222,227,232,0.5)"; ctx.lineWidth = 1.6; for (let i = 0; i < 3; i++) { const gx = cx - this._W * 0.22 + ((tt * 16 + i * 150) % (this._W * 0.5)), gy = this._H * 0.13 + i * 24 + Math.sin(tt * 1.5 + i) * 5; ctx.beginPath(); ctx.moveTo(gx - 5, gy); ctx.quadraticCurveTo(gx, gy - 3.5, gx + 1, gy); ctx.quadraticCurveTo(gx + 2, gy - 3.5, gx + 7, gy); ctx.stroke(); } } }
  drawBoat(ctx, x, y, t, i) { const sc = 1.15, bob = Math.sin(t * 1.2 + i) * 2; y += bob;
    this.ell(ctx, x, y + 5 * sc, 12 * sc, 3 * sc, "rgba(0,0,0,0.14)");
    this.poly(ctx, [[x - 11 * sc, y], [x + 11 * sc, y], [x + 7 * sc, y + 5 * sc], [x - 7 * sc, y + 5 * sc]], "#8a5a3a"); this.poly(ctx, [[x - 11 * sc, y], [x + 11 * sc, y], [x + 9 * sc, y - 1.5 * sc], [x - 9 * sc, y - 1.5 * sc]], "#a06a44");
    ctx.fillStyle = "#6b4a2e"; ctx.fillRect(x - 0.8 * sc, y - 16 * sc, 1.6 * sc, 16 * sc);
    this.poly(ctx, [[x + 1 * sc, y - 15 * sc], [x + 1 * sc, y - 2 * sc], [x + 9 * sc, y - 3.5 * sc]], "#f0e6d2");
    ctx.fillStyle = "#d97757"; ctx.fillRect(x - 0.8 * sc, y - 18 * sc, 4 * sc, 2 * sc); }

  /* ---------- ground (connected) ---------- */
  computeLand(live) { const occ = {}; for (const p of live)occ[p.cell.cx + "," + p.cell.cy] = p; const land = {}; for (const k in occ)land[k] = { park: false, p: occ[k] };
    const cand = new Set(); for (const k in occ) { const [cx, cy] = k.split(",").map(Number); for (const d of this.edge4) { const nk = (cx + d[0]) + "," + (cy + d[1]); if (!occ[nk]) cand.add(nk); } }
    for (const nk of cand) { const [cx, cy] = nk.split(",").map(Number); let c = 0; for (const d of this.edge4) { if (occ[(cx + d[0]) + "," + (cy + d[1])]) c++; } if (c >= 3) land[nk] = { park: true, p: null }; }
    return { occ, land }; }
  drawGround(ctx, land) { const w = this.world(), pal = w.pal, z = this.cam.z, a = this.A * z, b = this.B * z, Td = 8 * z;
    const keys = Object.keys(land).sort((u, v) => { const A = u.split(",").map(Number), B = v.split(",").map(Number); return (A[0] + A[1]) - (B[0] + B[1]); });
    for (const k of keys) { const cell = { cx: +k.split(",")[0], cy: +k.split(",")[1] }; const e = land[k]; const s = this.project(this.worldPos(cell)); const al = e.p ? Math.min(1, e.p.life * 1.2) : 1; ctx.globalAlpha = al;
      const T = [s.x, s.y - b], R = [s.x + a, s.y], Bm = [s.x, s.y + b], L = [s.x - a, s.y];
      const isLand = (dx, dy) => land[(cell.cx + dx) + "," + (cell.cy + dy)];
      if (!isLand(1, 0)) this.poly(ctx, [R, Bm, [Bm[0], Bm[1] + Td], [R[0], R[1] + Td]], this.shade(pal.gSide, 0.85));
      if (!isLand(0, 1)) this.poly(ctx, [Bm, L, [L[0], L[1] + Td], [Bm[0], Bm[1] + Td]], pal.gSide);
      this.poly(ctx, [T, R, Bm, L], e.park ? this.shade(pal.gTop, 0.9) : pal.gTop);
      if (e.park) { if (w.cozy) { ctx.fillStyle = "#6b4a2e"; ctx.fillRect(s.x - 1.4 * z, s.y - 6 * z, 2.8 * z, 7 * z); this.ell(ctx, s.x, s.y - 9 * z, 7 * z, 7 * z, "#4d7a3a"); this.ell(ctx, s.x - 3 * z, s.y - 7 * z, 5 * z, 5 * z, "#5e8b4a"); this.ell(ctx, s.x + 3 * z, s.y - 8 * z, 4.5 * z, 4.5 * z, "#6f9a55"); } else { this.ell(ctx, s.x, s.y, 4 * z, 3 * z, this.shade(pal.gTop, 0.7)); this.ell(ctx, s.x, s.y - 4 * z, 5 * z, 5 * z, this.tint(pal.gTop, 0.15)); } }
      const street = (p1, p2) => { if (w.road === "neon") { ctx.strokeStyle = this.rgbaA(pal.road, 0.7); ctx.lineWidth = 2 * z; } else if (w.road === "copper") { ctx.strokeStyle = pal.road; ctx.lineWidth = 2.5 * z; } else { ctx.strokeStyle = this.rgbaA(pal.road, 0.85); ctx.lineWidth = 3.2 * z; } ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke(); };
      if (isLand(1, 0)) street(R, Bm); if (isLand(0, 1)) street(Bm, L);
      ctx.globalAlpha = 1; } }

  /* ---------- citizens ---------- */
  drawWalker(ctx, x, y, a, t) { const z = this.cam.z, ac = this.acts[a.act].color;
    if (a.act === "idle" && !a.walking) { this.drawBed(ctx, x, y, a, t, z); return; }
    const sc = Math.max(0.85, Math.min(1.45, z));
    const bob = a.walking ? Math.abs(Math.sin(a.phase)) * -1.7 * sc : Math.sin(a.phase) * -0.7 * sc;
    this.drawPerson(ctx, x, y, a.faction, sc, a.phase, a.act, a.faceLeft, bob);
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
  drawPerson(ctx, x, feet, fk, scale, phase, act, faceLeft, bobO) { const sp = this.sprite(fk); const w = sp.width * scale / 2, h = sp.height * scale / 2; const bob = (bobO != null) ? bobO : ((act === "think") ? Math.sin(phase) * -1 * scale : Math.abs(Math.sin(phase * 1.3)) * -1.4 * scale);
    this.ell(ctx, x, feet, w * 0.42, 2.4 * scale, "rgba(0,0,0,0.28)"); const dx = Math.round(x - w / 2), dy = Math.round(feet - h + bob);
    if (faceLeft) { ctx.save(); ctx.translate(2 * x, 0); ctx.scale(-1, 1); ctx.drawImage(sp, dx, dy, Math.round(w), Math.round(h)); ctx.restore(); } else ctx.drawImage(sp, dx, dy, Math.round(w), Math.round(h)); }
  drawBed(ctx, x, y, a, t, z) { const pc = this.factions[a.faction];
    this.ell(ctx, x, y + 2 * z, 11 * z, 4 * z, "rgba(0,0,0,0.26)");
    this.box(ctx, x, y, 9 * z, 5 * z, 3 * z, "#6b4a2e", "#5a3f28", { win: false });
    this.poly(ctx, [[x - 9 * z, y - 3 * z], [x, y - 3 * z + 2.5 * z], [x + 2 * z, y - 3 * z + 1.5 * z], [x - 3 * z, y - 6 * z]], this.shade(pc, 0.8));
    this.poly(ctx, [[x - 3 * z, y - 6 * z], [x + 2 * z, y - 1.5 * z], [x + 9 * z, y - 3 * z], [x + 5 * z, y - 7 * z]], pc);
    this.ell(ctx, x + 6 * z, y - 4.5 * z, 3 * z, 2.2 * z, "#f0e6d2"); this.ell(ctx, x + 6 * z, y - 5.5 * z, 2 * z, 2 * z, "#e8b48c");
    ctx.fillStyle = "rgba(180,190,205," + (0.5 + 0.4 * Math.sin(t * 3)).toFixed(2) + ")"; ctx.font = "bold " + Math.round(7 * z) + "px 'JetBrains Mono',monospace"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    const zb = (Math.sin(t * 2) * 2); ctx.fillText("z", x + 8 * z, y - 9 * z + zb); ctx.fillText("z", x + 11 * z, y - 13 * z + zb * 0.6); }

  /* ---------- room ---------- */
  drawParcel(ctx, p, t) { const z = this.cam.z; const s = this.project(this.worldPos(p.cell)); const a = this.A * z, b = this.B * z; const pal = this.world().pal, dark = this.world().dark;
    const ease = p.life * p.life * (3 - 2 * p.life); const grow = 0.62 + 0.38 * ease;
    ctx.globalAlpha = Math.min(1, p.life * 1.2);
    const fa = a * 0.84 * grow, fb = b * 0.84 * grow;
    const T = [s.x, s.y - fb], R = [s.x + fa, s.y], Bm = [s.x, s.y + fb], L = [s.x - fa, s.y];
    this.poly(ctx, [T, R, Bm, L], pal.plaza); this.poly(ctx, [T, R, Bm, L], this.rgbaA(p.color, dark ? 0.20 : 0.13));
    if (p.agents.length >= 4) this.ell(ctx, s.x, s.y, fa * 0.85, fb * 0.85, this.rgbaA(p.color, 0.05 * Math.min(1, p.agents.length / 6)));
    const wh = 13 * z * grow;
    this.poly(ctx, [L, T, [T[0], T[1] - wh], [L[0], L[1] - wh]], this.shade(pal.wallA, 0.66));
    this.poly(ctx, [T, R, [R[0], R[1] - wh], [T[0], T[1] - wh]], this.shade(pal.wallA, 0.84));
    ctx.strokeStyle = p.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(L[0], L[1] - wh); ctx.lineTo(T[0], T[1] - wh); ctx.lineTo(R[0], R[1] - wh); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(L[0], L[1]); ctx.lineTo(Bm[0], Bm[1]); ctx.lineTo(R[0], R[1]); ctx.stroke();
    { const w0 = this.world(), st = w0.style, rc = w0.roof || pal.wallB, win = pal.window, Lr = [L[0], L[1] - wh], Tr = [T[0], T[1] - wh], Rr = [R[0], R[1] - wh], eh = 8 * z, ov = 4 * z;
      this.poly(ctx, [Lr, Tr, [Tr[0] - ov * 0.5, Tr[1] - eh], [Lr[0] - ov, Lr[1] - eh * 0.7]], this.shade(rc, 0.82));
      this.poly(ctx, [Tr, Rr, [Rr[0] + ov, Rr[1] - eh * 0.7], [Tr[0] + ov * 0.5, Tr[1] - eh]], rc);
      ctx.strokeStyle = (st === "neon" || st === "chip") ? win : this.shade(rc, 0.62); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(Lr[0] - ov, Lr[1] - eh * 0.7); ctx.lineTo(Tr[0], Tr[1] - eh); ctx.lineTo(Rr[0] + ov, Rr[1] - eh * 0.7); ctx.stroke();
      const wx = (Tr[0] + Rr[0]) / 2 + 1 * z, wy = (Tr[1] + Rr[1]) / 2 + wh * 0.42; ctx.fillStyle = this.shade(rc, 0.7); ctx.fillRect(wx - 2.4 * z, wy - 3 * z, 4.8 * z, 4.2 * z); ctx.fillStyle = win; ctx.fillRect(wx - 1.8 * z, wy - 2.4 * z, 3.6 * z, 3 * z); ctx.strokeStyle = this.shade(rc, 0.55); ctx.lineWidth = 0.7 * z; ctx.beginPath(); ctx.moveTo(wx, wy - 2.4 * z); ctx.lineTo(wx, wy + 0.6 * z); ctx.moveTo(wx - 1.8 * z, wy - 0.9 * z); ctx.lineTo(wx + 1.8 * z, wy - 0.9 * z); ctx.stroke();
      if (w0.dark) this.ell(ctx, wx, wy - 0.9 * z, 5 * z, 4 * z, this.rgbaA(win, 0.16));
      ctx.strokeStyle = (st === "cozy") ? this.rgbaA("#8a6a44", 0.22) : this.rgbaA(win, 0.07); ctx.lineWidth = 1; for (let i = 1; i < 4; i++) { const f = i / 4; ctx.beginPath(); ctx.moveTo(L[0] + (T[0] - L[0]) * f, L[1] + (T[1] - L[1]) * f); ctx.lineTo(Bm[0] + (R[0] - Bm[0]) * f, Bm[1] + (R[1] - Bm[1]) * f); ctx.stroke(); }
      const cxp = Tr[0] + (Rr[0] - Tr[0]) * 0.42, cyp = Tr[1] - eh, pl = [L[0] + (Bm[0] - L[0]) * 0.28, L[1] + (Bm[1] - L[1]) * 0.28], ln = [R[0] + (Bm[0] - R[0]) * 0.28, R[1] + (Bm[1] - R[1]) * 0.28];
      if (st === "cozy") { ctx.fillStyle = "#9a6a4a"; ctx.fillRect(cxp - 1.4 * z, cyp - 7 * z, 3 * z, 7 * z);
        for (let i = 0; i < 3; i++) { const ph = (t * 0.5 + i * 0.4) % 1; this.ell(ctx, cxp - ph * 3 * z, cyp - 8 * z - ph * 12 * z, 2 * z + ph * 2 * z, 2 * z + ph * 2 * z, "rgba(214,208,202," + (0.42 - ph * 0.38).toFixed(2) + ")"); }
        ctx.fillStyle = "#b5663f"; ctx.fillRect(pl[0] - 2 * z, pl[1] - 1 * z, 4 * z, 3 * z); this.ell(ctx, pl[0], pl[1] - 2.5 * z, 3 * z, 3 * z, "#5e8b4a"); this.ell(ctx, pl[0] - 1.4 * z, pl[1] - 3.4 * z, 2 * z, 2 * z, "#6f9a55");
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
    const byA = {}; for (const a2 of p.agents) { if (a2.act === "idle") continue; const key = a2.act === "error" ? "run" : a2.act; if (byA[key] === undefined || a2.act === "error") byA[key] = a2.act; }
    const items = [];
    for (const key in byA) { const an = this.anchors[key]; if (!an) continue; const act = byA[key]; items.push({ y: an.y, fn: () => this.drawFurniture(ctx, s.x + an.x * z, s.y + an.y * z, act, t) }); }
    for (const a2 of p.agents) { items.push({ y: a2.ly, fn: () => this.drawWalker(ctx, s.x + a2.lx * z, s.y + a2.ly * z, a2, t) }); }
    items.sort((u, v) => u.y - v.y); for (const it of items) it.fn();
    this.plotLabel(ctx, s.x, T[1] - wh - 7 * z, p);
    ctx.globalAlpha = 1; }
  plotLabel(ctx, sx, sy, p) { ctx.font = "700 10px 'JetBrains Mono',monospace"; ctx.textBaseline = "middle"; ctx.textAlign = "left";
    const nm = p.name, cnt = String(p.agents.length); const nw = ctx.measureText(nm).width; const w = nw + 14 + 13 + 6, x = sx - w / 2, y = sy - 8, h = 16;
    ctx.fillStyle = "rgba(12,13,18,0.84)"; ctx.fillRect(x, y, w, h); ctx.fillStyle = p.color; ctx.fillRect(x, y, 3, h);
    ctx.fillStyle = "#e7edf2"; ctx.fillText(nm, x + 7, y + h / 2 + 0.5); this.ell(ctx, x + 7 + nw + 9, y + h / 2, 6.5, 6.5, p.color);
    ctx.fillStyle = "#0c0d12"; ctx.font = "700 9px 'JetBrains Mono',monospace"; ctx.textAlign = "center"; ctx.fillText(cnt, x + 7 + nw + 9, y + h / 2 + 0.5); }

  /* ---------- HUD ---------- */
  drawHUD(ctx) { const pw = 224, px = this._W - pw - 14, py = 14, ph = this._H - 28;
    ctx.fillStyle = "rgba(13,15,20,0.9)"; ctx.fillRect(px, py, pw, ph); ctx.strokeStyle = "#262d38"; ctx.lineWidth = 1; ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
    const live = this.projects.filter(p => !p.removing); let tot = 0; for (const p of live) tot += p.agents.length;
    ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillStyle = "#cdd3dc"; ctx.font = "700 11px 'JetBrains Mono',monospace"; ctx.fillText("PROJECTS", px + 12, py + 18);
    ctx.fillStyle = "#5b636f"; ctx.font = "10px 'JetBrains Mono',monospace"; ctx.textAlign = "right"; ctx.fillText(this.world().label.toLowerCase() + " · " + live.length + " live", px + pw - 12, py + 18); ctx.textAlign = "left";
    const rows = [...live].sort((a, b) => b.agents.length - a.agents.length); const rowH = 34, top = py + 36, max = Math.floor((ph - 58) / rowH);
    for (let i = 0; i < Math.min(rows.length, max); i++) { const p = rows[i], y = top + i * rowH; this.ell(ctx, px + 18, y + 9, 5, 5, p.color);
      ctx.fillStyle = "#e2e7ee"; ctx.font = "600 11px 'JetBrains Mono',monospace"; let nm = p.name; if (ctx.measureText(nm).width > 118) nm = nm.slice(0, 15); ctx.fillText(nm, px + 30, y + 9);
      ctx.fillStyle = "#7e8794"; ctx.font = "10px 'JetBrains Mono',monospace"; ctx.textAlign = "right"; ctx.fillText(p.agents.length + "a", px + pw - 12, y + 9); ctx.textAlign = "left";
      const counts = {}; for (const ag of p.agents) counts[ag.act] = (counts[ag.act] || 0) + 1; let bx = px + 30; const sy = y + 20;
      for (const act in counts) { if (bx > px + pw - 16) break; ctx.fillStyle = this.acts[act].color; for (let c = 0; c < counts[act] && bx < px + pw - 16; c++) { ctx.fillRect(bx, sy, 7, 7); bx += 9; } bx += 4; } }
    if (rows.length > max) { ctx.fillStyle = "#5b636f"; ctx.font = "10px 'JetBrains Mono',monospace"; ctx.fillText("+" + (rows.length - max) + " more", px + 12, top + max * rowH + 6); }
    ctx.fillStyle = "#1b2029"; ctx.fillRect(px + 1, py + ph - 26, pw - 2, 25); ctx.fillStyle = "#7fd0cb"; ctx.font = "700 11px 'JetBrains Mono',monospace"; ctx.fillText(tot + " citizens", px + 12, py + ph - 13);
    ctx.fillStyle = "#56b870"; ctx.textAlign = "right"; ctx.fillText("live", px + pw - 12, py + ph - 13); ctx.textAlign = "left"; }

  /* ---------- main render ---------- */
  resize() { const cv = this.canvas; if (!cv) return; const r = cv.getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); this._townW = r.width; this._townH = r.height; this._dpr = dpr; this.useTownViewport(); }
  useTownViewport() { this._W = this._townW; this._H = this._townH; this._vcx = this.leftGutter + (this._townW - this.leftGutter - 250) / 2; this._vcy = this._townH / 2; }
  setLeftGutter(px) { this.leftGutter = px || 0; }
  drawTown(t) { const cv = this.canvas; if (!cv) return; this.useTownViewport(); const ctx = cv.getContext("2d"); ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0); ctx.imageSmoothingEnabled = false;
    this.drawBackground(ctx); const live = this.projects.filter(p => p.life > 0.02); const { land } = this.computeLand(live);
    this.drawGround(ctx, land);
    const sorted = [...live].sort((a, b) => (a.cell.cx + a.cell.cy) - (b.cell.cx + b.cell.cy)); for (const p of sorted) this.drawParcel(ctx, p, t);
    this.drawHUD(ctx); }

  start() {
    this.resize(); this.rebuildBg();
    window.addEventListener("resize", () => this.resize());
    let last = performance.now(); this._lastFrame = last;
    const loop = (now) => { now = now || performance.now(); const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; this._lastFrame = now; const t = now / 1000;
      try { this.useTownViewport(); this.update(dt, t); if (!this.userControlled) this.updateCamera(dt); this.drawTown(t); } catch (err) { console.error("city loop:", err && err.message, err && err.stack); return; }
      if (document.hidden) { this._to = setTimeout(loop, 180); } else { this._raf = requestAnimationFrame(loop); } };
    loop(performance.now());
    this._watch = setInterval(() => { if (performance.now() - this._lastFrame > 350) loop(performance.now()); }, 300);
  }
}
