/** Atlas — a small, portable view of the machine carrying the city. */
import { cpus, freemem, homedir, hostname, totalmem, type CpuInfo } from "node:os";
import { statfs } from "node:fs/promises";
import type { SystemResourcesMessage } from "@aquarllm/shared";

type CpuReading = Pick<CpuInfo, "model" | "times">;
type DiskReading = { bsize: number; blocks: number; bfree: number; bavail: number };
const CPU_TIMES = ["user", "nice", "sys", "idle", "irq"] as const;

/** Cumulative counters must be differenced per core, including idle time. */
export function cpuUsage(previous: CpuReading[] | null, current: CpuReading[]): number | null {
  if (!previous || !current.length || previous.length !== current.length) return null;
  let elapsed = 0;
  let idle = 0;
  for (let i = 0; i < current.length; i++) {
    if (previous[i].model !== current[i].model) return null;
    for (const key of CPU_TIMES) {
      const before = previous[i].times[key];
      const after = current[i].times[key];
      // A reset or CPU hotplug needs a fresh baseline, not a misleading spike.
      if (!Number.isFinite(before) || !Number.isFinite(after) || before < 0 || after < before) return null;
      const delta = after - before;
      elapsed += delta;
      if (key === "idle") idle += delta;
    }
  }
  if (!Number.isFinite(elapsed) || elapsed <= 0) return null;
  return Math.max(0, Math.min(100, (1 - idle / elapsed) * 100));
}

export function memoryUsage(totalBytes: number, freeBytes: number): SystemResourcesMessage["memory"] {
  if (!Number.isFinite(totalBytes) || totalBytes <= 0 || !Number.isFinite(freeBytes) || freeBytes < 0 || freeBytes > totalBytes) return null;
  const usedBytes = totalBytes - freeBytes;
  return { usedBytes, totalBytes, usagePercent: usedBytes / totalBytes * 100 };
}

export function diskUsage(stats: DiskReading, volume: string, sampledAt: number): SystemResourcesMessage["disk"] {
  if (![stats.bsize, stats.blocks, stats.bfree, stats.bavail].every(Number.isFinite)
    || stats.bsize <= 0 || stats.blocks <= 0 || stats.bfree < 0 || stats.bfree > stats.blocks || stats.bavail > stats.bfree) return null;
  const totalBytes = stats.blocks * stats.bsize;
  const usedBytes = (stats.blocks - stats.bfree) * stats.bsize;
  // Some filesystems return negative available space when reserved blocks are in use.
  const availableBytes = Math.max(0, stats.bavail) * stats.bsize;
  if (![totalBytes, usedBytes, availableBytes].every(Number.isFinite)) return null;
  return { usedBytes, totalBytes, availableBytes, usagePercent: usedBytes / totalBytes * 100, volume, sampledAt };
}

interface ResourceSources {
  cpus(): CpuReading[];
  totalmem(): number;
  freemem(): number;
  hostname(): string;
  homedir(): string;
  statfs(path: string): Promise<DiskReading>;
  now(): number;
}

/** One shared sampler per server, independent of agent traffic and client count. */
export class Atlas {
  private readonly sources: ResourceSources;
  private readonly sampleIntervalMs: number;
  private readonly diskIntervalMs: number;
  private previousCpu: CpuReading[] | null = null;
  private current: SystemResourcesMessage;
  private timer: ReturnType<typeof setInterval> | null = null;
  private listener: ((snapshot: SystemResourcesMessage) => void) | null = null;
  private diskPending = false;
  private nextDiskSample = 0;
  private stopped = false;

  constructor(options: { sources?: Partial<ResourceSources>; sampleIntervalMs?: number; diskIntervalMs?: number } = {}) {
    this.sources = { cpus, freemem, homedir, hostname, totalmem, statfs, now: Date.now, ...options.sources };
    this.sampleIntervalMs = options.sampleIntervalMs ?? 2_000;
    this.diskIntervalMs = options.diskIntervalMs ?? 30_000;
    let host = "This machine";
    try { host = this.sources.hostname() || host; } catch { /* hostname can be unavailable independently */ }
    this.current = { type: "resources", sampledAt: this.sources.now(), hostname: host, cpu: { usagePercent: null, cores: 0 }, memory: null, disk: null };
    this.sample();
  }

  snapshot(): SystemResourcesMessage { return this.current; }

  start(listener: (snapshot: SystemResourcesMessage) => void): void {
    if (this.stopped || this.timer) return;
    this.listener = listener;
    this.timer = setInterval(() => this.sample(), this.sampleIntervalMs);
    this.timer.unref?.();
    listener(this.current);
  }

  sample(): SystemResourcesMessage {
    if (this.stopped) return this.current;
    let cpu: SystemResourcesMessage["cpu"] = { usagePercent: null, cores: 0 };
    let memory: SystemResourcesMessage["memory"] = null;
    try {
      const cores = this.sources.cpus();
      cpu = { usagePercent: cpuUsage(this.previousCpu, cores), cores: cores.length };
      this.previousCpu = cores;
    } catch { this.previousCpu = null; }
    try { memory = memoryUsage(this.sources.totalmem(), this.sources.freemem()); } catch { /* keep CPU and disk available */ }
    this.current = { ...this.current, sampledAt: this.sources.now(), cpu, memory };
    this.listener?.(this.current);
    this.refreshDisk();
    return this.current;
  }

  private refreshDisk(): void {
    const now = this.sources.now();
    if (this.diskPending || now < this.nextDiskSample) return;
    this.diskPending = true;
    this.nextDiskSample = now + this.diskIntervalMs;
    // Disk I/O never holds up CPU/memory updates or WebSocket connections.
    void (async () => {
      let disk: SystemResourcesMessage["disk"] = null;
      try {
        const volume = this.sources.homedir();
        disk = diskUsage(await this.sources.statfs(volume), volume, this.sources.now());
      } catch { /* unsupported filesystem or permissions: this metric is unavailable */ }
      this.diskPending = false;
      if (this.stopped) return;
      this.current = { ...this.current, disk };
      this.listener?.(this.current);
    })();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.listener = null;
  }
}
