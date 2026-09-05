/** Atlas keeps watch over the real computer beneath the town. */
import type { SystemResourcesMessage } from "@aquarllm/shared";
import "./atlas.css";

let nextPanelId = 0;
const STALE_AFTER_MS = 8_000;
const DISK_STALE_AFTER_MS = 65_000;

function percent(value: number): number {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

function bytes(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "—";
  const gib = value / 1024 ** 3;
  return gib >= 1 ? `${gib.toFixed(gib >= 100 ? 0 : 1)} GiB` : `${(value / 1024 ** 2).toFixed(0)} MiB`;
}

function ageLabel(age: number): string {
  const seconds = Math.max(0, Math.floor(age / 1000));
  return seconds < 60 ? `${seconds}s ago` : `${Math.floor(seconds / 60)}m ago`;
}

const windmill = `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
  <path fill="#263c36" d="M2 42h44v4H2z"/>
  <path fill="#d5bd91" d="M18 23h12l4 20H14z"/>
  <path fill="#ae845a" d="M27 23h3l4 20h-7z"/>
  <path fill="#5c4239" d="M14 23l10-11 10 11zM21 35h6v8h-6z"/>
  <path fill="#efdbb4" d="M19 29h4v4h-4z"/>
  <g class="atlas-mill-sails">
    <path fill="#d9ac66" d="M22 3h5v17h-5zM26 20h17v5H26zM21 24h5v17h-5zM5 19h17v5H5z"/>
    <path fill="#f3e6c8" d="M23 3h4v12h-4zM31 20h12v4H31zM21 29h4v12h-4zM5 20h12v4H5z"/>
    <path fill="#9c7348" d="M22 17h2v11h-2zM18 21h12v2H18z"/>
    <path fill="#f3dca3" d="M21 19h6v6h-6z"/>
    <path fill="#755a45" d="M23 21h2v2h-2z"/>
  </g>
</svg>`;

function reservoir(id: string): string {
  return `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <defs><clipPath id="${id}"><path d="M10 12h28v28H10z"/></clipPath></defs>
    <path fill="#263c36" d="M2 42h44v4H2z"/>
    <path fill="#607b84" d="M6 9h36v34H6z"/>
    <path fill="#a7b2aa" d="M6 9h36v4H6zM6 17h4v4H6zM38 27h4v4h-4zM6 37h4v4H6z"/>
    <path fill="#152f39" d="M10 13h28v27H10z"/>
    <g clip-path="url(#${id})"><rect class="atlas-water" x="10" y="40" width="28" height="0" fill="#5fb0ab"/>
      <path class="atlas-water-shine" fill="#a5e0d6" d="M12 0h9v2h-9zM29 0h7v2h-7z"/>
    </g>
    <path fill="#9faeaa" d="M10 40h28v3H10z"/>
    <path fill="#668f79" d="M3 38h3v5H3zM42 40h3v3h-3z"/>
  </svg>`;
}

const storehouse = `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
  <path fill="#263c36" d="M2 42h44v4H2z"/>
  <path fill="#bc956a" d="M5 15h38v28H5z"/>
  <path fill="#684d3e" d="M9 18h30v23H9z"/>
  <path fill="#955d43" d="M2 15L24 3l22 12v3H2z"/>
  <path fill="#c47b4f" d="M2 15L24 3l22 12h-7L24 7 9 15z"/>
  ${Array.from({ length: 12 }, (_, index) => {
    const x = 11 + (index % 4) * 7;
    const y = 35 - Math.floor(index / 4) * 7;
    return `<g class="atlas-crate" transform="translate(${x} ${y})"><path class="atlas-crate-box" d="M0 0h6v6H0z"/><path class="atlas-crate-brace" d="M1 1h1v1H1zM2 2h1v1H2zM3 3h1v1H3zM4 4h1v1H4z"/></g>`;
  }).join("")}
  <path fill="#d2ae79" d="M5 40h38v3H5z"/>
</svg>`;

function metric(key: string, title: string, label: string, art: string): string {
  return `<div class="atlas-metric" data-metric="${key}" data-available="false">
    <div class="atlas-art">${art}</div>
    <div class="atlas-reading">
      <div class="atlas-metric-head"><span>${title}</span><strong class="atlas-value">—</strong></div>
      <div class="atlas-detail">Waiting for a reading</div>
      <meter min="0" max="100" value="0" aria-label="${label}" hidden></meter>
      <div class="atlas-track" aria-hidden="true"><span></span></div>
      <div class="atlas-caption">${key === "cpu" ? "Waiting for the breeze…" : key === "memory" ? "Checking the reservoir…" : "Counting the crates…"}</div>
    </div>
  </div>`;
}

export class AtlasPanel {
  private el: HTMLElement;
  private sample: SystemResourcesMessage | null = null;
  private readingReceivedAt = 0;
  private connected = false;
  private awaitingReading = true;
  private collapsed = false;
  private freshnessTimer: ReturnType<typeof setInterval>;
  private toggle: HTMLButtonElement;
  private body: HTMLElement;

  constructor(element: HTMLElement) {
    this.el = element;
    const id = `atlas-${++nextPanelId}`;
    element.classList.add("atlas");
    element.setAttribute("aria-label", "Atlas: system resources on the server computer");
    element.dataset.freshness = "waiting";
    element.innerHTML = `
      <div class="atlas-heading">
        <div><span class="atlas-name">ATLAS</span><span class="atlas-subtitle">TOWN VITALS</span></div>
        <button type="button" class="atlas-toggle" aria-expanded="true" aria-controls="${id}-body" title="Collapse town vitals" aria-label="Collapse town vitals">−</button>
      </div>
      <div class="atlas-body" id="${id}-body">
        <div class="atlas-host">Server computer · <span>connecting…</span></div>
        <div class="atlas-metrics">
          ${metric("cpu", "Windmill · CPU", "System CPU utilization", windmill)}
          ${metric("memory", "Reservoir · RAM", "System memory occupancy", reservoir(`${id}-water`))}
          ${metric("disk", "Storehouse · Disk", "Disk space used", storehouse)}
        </div>
        <div class="atlas-status"><span class="atlas-beacon" aria-hidden="true"></span><span class="atlas-status-label" role="status">Waiting for Hermes</span><span class="atlas-age"></span></div>
        <p class="atlas-note">RAM is total − free, including caches;<br>occupancy, not memory pressure.</p>
      </div>`;
    this.toggle = this.find<HTMLButtonElement>(".atlas-toggle");
    this.body = this.find(".atlas-body");
    this.toggle.addEventListener("click", this.toggleCollapsed);
    this.freshnessTimer = setInterval(() => this.refreshFreshness(), 1000);
  }

  update(sample: SystemResourcesMessage): void {
    // Server and browser may have different wall clocks. Only a new CPU/RAM
    // sample resets this local clock; a disk-only refresh retains its age.
    if (!this.sample || sample.sampledAt !== this.sample.sampledAt) {
      this.readingReceivedAt = performance.now();
    }
    this.sample = sample;
    this.awaitingReading = false;
    const host = this.find(".atlas-host span");
    host.textContent = sample.hostname || "this computer";
    this.find(".atlas-host").title = `Resources measured on the server computer: ${sample.hostname || "this computer"}`;

    const cpu = sample.cpu;
    const cpuPercent = cpu.usagePercent == null ? null : percent(cpu.usagePercent);
    this.updateMetric("cpu", cpuPercent, cpu.cores > 0 ? `${cpu.cores} logical ${cpu.cores === 1 ? "core" : "cores"}` : "No CPU reading", cpuPercent == null
      ? cpu.cores > 0 ? "Measuring the breeze…" : "Windmill unavailable"
      : cpuPercent < 25 ? "A gentle breeze" : cpuPercent < 60 ? "The mill is humming" : cpuPercent < 85 ? "A lively wind" : "All sails spinning");
    this.el.style.setProperty("--mill-duration", `${(22 / (0.5 + (cpuPercent ?? 0) / 10)).toFixed(2)}s`);
    this.el.dataset.milling = String(cpuPercent != null && cpuPercent > 0);

    const memory = sample.memory;
    const memoryPercent = memory ? percent(memory.usagePercent) : null;
    this.updateMetric("memory", memoryPercent, memory ? `${bytes(memory.usedBytes)} / ${bytes(memory.totalBytes)}` : "No memory reading", memoryPercent == null
      ? "Reservoir unavailable"
      : memoryPercent < 55 ? "Room in the reservoir" : memoryPercent < 80 ? "The reservoir is filling" : "A high waterline");
    const waterHeight = (memoryPercent ?? 0) * 0.27;
    const water = this.find<SVGRectElement>(".atlas-water");
    water.setAttribute("y", String(40 - waterHeight));
    water.setAttribute("height", String(waterHeight));
    const shine = this.find<SVGPathElement>(".atlas-water-shine");
    shine.setAttribute("transform", `translate(0 ${40 - waterHeight})`);
    shine.style.opacity = memoryPercent == null || memoryPercent === 0 ? "0" : "1";

    const disk = sample.disk;
    const diskPercent = disk ? percent(disk.usagePercent) : null;
    this.updateMetric("disk", diskPercent, disk ? `${bytes(disk.usedBytes)} / ${bytes(disk.totalBytes)}` : "No disk reading", diskPercent == null
      ? "Storehouse unavailable"
      : diskPercent < 75 ? "Space for more supplies" : diskPercent < 90 ? "The shelves are filling" : "Shelves nearly full");
    this.find('[data-metric="disk"]').title = disk
      ? `Volume: ${disk.volume}\n${bytes(disk.availableBytes)} available · checked about every 30 seconds`
      : "Disk capacity is unavailable on this server computer.";
    this.find('[data-metric="disk"] meter').setAttribute("aria-label", disk ? `Disk space used on ${disk.volume}` : "Disk space used");
    this.el.querySelectorAll(".atlas-crate").forEach((crate, index) => {
      crate.classList.toggle("filled", diskPercent != null && index < Math.ceil(diskPercent * 12 / 100));
    });
    this.refreshFreshness();
  }

  setConnected(connected: boolean): void {
    if (connected && !this.connected) this.awaitingReading = true;
    this.connected = connected;
    this.refreshFreshness();
  }

  destroy(): void {
    clearInterval(this.freshnessTimer);
    this.toggle.removeEventListener("click", this.toggleCollapsed);
  }

  private find<T extends Element = HTMLElement>(selector: string): T {
    return this.el.querySelector<T>(selector)!;
  }

  private updateMetric(key: string, value: number | null, detail: string, caption: string): void {
    const row = this.find(`[data-metric="${key}"]`);
    row.dataset.available = String(value != null);
    row.querySelector(".atlas-value")!.textContent = value == null ? "—" : `${Math.round(value)}%`;
    row.querySelector(".atlas-detail")!.textContent = detail;
    row.querySelector(".atlas-caption")!.textContent = caption;
    row.querySelector<HTMLElement>(".atlas-track span")!.style.width = `${value ?? 0}%`;
    const meter = row.querySelector<HTMLMeterElement>("meter")!;
    meter.hidden = value == null;
    meter.value = value ?? 0;
    meter.setAttribute("aria-valuetext", value == null ? "No reading" : `${Math.round(value)} percent, ${detail}`);
  }

  private refreshFreshness(): void {
    const age = this.sample ? Math.max(0, performance.now() - this.readingReceivedAt) : 0;
    const state = !this.connected ? (this.sample ? "offline" : "waiting")
      : !this.sample || this.awaitingReading ? "waiting" : age > STALE_AFTER_MS ? "stale" : "live";
    this.el.dataset.freshness = state;
    const label = this.find(".atlas-status-label");
    const message = state === "live" ? "Live · every 2s" : state === "offline" ? "Disconnected" : state === "stale" ? "Readings paused" : "Waiting for Hermes";
    if (label.textContent !== message) label.textContent = message;
    this.find(".atlas-age").textContent = this.sample && state !== "live" ? `Last ${ageLabel(age)}` : "";
    const disk = this.sample?.disk;
    const diskAge = disk && this.sample ? Math.max(0, this.sample.sampledAt - disk.sampledAt) + age : 0;
    const diskStale = disk != null && diskAge > DISK_STALE_AFTER_MS;
    this.find('[data-metric="disk"]').dataset.stale = String(diskStale);
    if (diskStale) {
      this.find('[data-metric="disk"] .atlas-caption').textContent = `Last check ${ageLabel(diskAge)}`;
    }
    this.el.setAttribute("aria-label", `Atlas: system resources on the server computer. ${message}.`);
  }

  private toggleCollapsed = (): void => {
    this.collapsed = !this.collapsed;
    this.body.hidden = this.collapsed;
    this.el.dataset.collapsed = String(this.collapsed);
    this.toggle.setAttribute("aria-expanded", String(!this.collapsed));
    const action = this.collapsed ? "Expand town vitals" : "Collapse town vitals";
    this.toggle.setAttribute("aria-label", action);
    this.toggle.title = action;
    this.toggle.textContent = this.collapsed ? "+" : "−";
  };
}
