/** The left panel: a live activity feed + a legend of what agents are doing. */
import type { LogEntry } from "@aquarllm/shared";

/** Activity → [label, colour, workspace] — matches the city's design tokens. */
export const ACT_STYLE: Record<string, [string, string, string]> = {
  reading: ["reading", "#5fb0ab", "bookshelf"],
  editing: ["editing", "#e0a23c", "desk"],
  running: ["running", "#56b870", "terminal"],
  searching: ["searching", "#5a8fd6", "map table"],
  thinking: ["thinking", "#9b7cf0", "whiteboard"],
  waiting: ["waiting on you", "#e07a4a", "help desk"],
  idle: ["idle", "#7e8794", "asleep in bed"],
  error: ["error", "#d96b5a", "broke something"],
  joined: ["joined", "#56b870", "arrived"],
  left: ["left", "#7e8794", "session ended"],
  spawning: ["spawning", "#9b7cf0", "launched a helper"],
};

/** Agent kind → [label, colour]. */
export const KIND_STYLE: Record<string, [string, string]> = {
  claude: ["Claude", "#d97757"],
  codex: ["Codex", "#10a37f"],
  grok: ["Grok", "#9aa0a6"],
  custom: ["Local / other", "#9b7cf0"],
};

function esc(s: string): string {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
}

function hhmmss(ts: number): string {
  const d = new Date(ts);
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":");
}

export class ActivityLog {
  private el: HTMLElement;
  private max = 200;

  constructor(listEl: HTMLElement) {
    this.el = listEl;
  }

  add(entries: LogEntry[]): void {
    for (const e of entries) this.row(e);
    while (this.el.childElementCount > this.max) this.el.lastElementChild?.remove();
  }

  private row(e: LogEntry): void {
    const [label, color] = ACT_STYLE[e.activity] ?? [e.activity, "#9aa6b4", ""];
    const [, dot] = KIND_STYLE[e.agentKind] ?? ["", "#999"];
    const row = document.createElement("div");
    row.className = "lg-row";
    row.innerHTML =
      `<span class="lg-t">${hhmmss(e.ts)}</span>` +
      `<span class="lg-dot" style="background:${dot}"></span>` +
      `<span class="lg-p">${esc(e.project || e.displayName || "")}</span>` +
      `<span class="lg-a" style="color:${color}">${label}</span>` +
      (e.detail ? `<span class="lg-d">${esc(e.detail)}</span>` : "");
    this.el.prepend(row);
  }
}

/** Build the static legend into the activities + agents containers. */
export function renderLegend(actsEl: HTMLElement, factionsEl: HTMLElement): void {
  const order = ["reading", "editing", "running", "searching", "thinking", "waiting", "idle", "error"];
  actsEl.innerHTML = order
    .map((k) => {
      const [label, color, where] = ACT_STYLE[k]!;
      return (
        `<div class="lg-key" title="${where}">` +
        `<span class="lg-sw" style="background:${color}"></span>` +
        `<span class="lg-kl">${label}</span>` +
        `<span class="lg-kw">${where}</span></div>`
      );
    })
    .join("");
  factionsEl.innerHTML = Object.values(KIND_STYLE)
    .map(([label, color]) =>
      `<div class="lg-key"><span class="lg-dot" style="background:${color}"></span>` +
      `<span class="lg-kl">${label}</span></div>`,
    )
    .join("");
}
