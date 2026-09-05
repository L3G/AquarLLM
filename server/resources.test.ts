import { describe, expect, test } from "bun:test";
import { Atlas, cpuUsage, diskUsage, memoryUsage } from "./resources.ts";

const core = (user: number, idle: number, model = "test CPU") => ({
  model, times: { user, idle, nice: 0, sys: 0, irq: 0 },
});
const disk = { bsize: 4_096, blocks: 100, bfree: 40, bavail: 30 };
const fixture = () => ({
  cpus: () => [core(100, 100)],
  totalmem: () => 1_000,
  freemem: () => 250,
  hostname: () => "atlas-test",
  homedir: () => "/home/atlas",
  statfs: async (_path: string) => disk,
  now: () => 1_000,
});

describe("CPU time deltas", () => {
  test("weights all logical cores by elapsed time", () => {
    expect(cpuUsage([core(100, 900), core(100, 900)], [core(150, 950), core(100, 1_100)]))
      .toBeCloseTo(100 / 6);
    expect(cpuUsage([core(100, 100)], [core(100, 200)])).toBe(0);
    expect(cpuUsage([core(100, 100)], [core(200, 100)])).toBe(100);
  });

  test("warm-up, no progress, and unavailable counters stay unknown", () => {
    expect(cpuUsage(null, [core(100, 100)])).toBeNull();
    expect(cpuUsage([], [])).toBeNull();
    expect(cpuUsage([core(100, 100)], [core(100, 100)])).toBeNull();
    expect(cpuUsage([core(100, 100)], [core(NaN, 200)])).toBeNull();
    expect(cpuUsage([core(100, 100)], [core(Infinity, 200)])).toBeNull();
    expect(cpuUsage([core(-1, 100)], [core(100, 200)])).toBeNull();
  });

  test("resets and CPU changes require a new baseline", () => {
    // The total counter rises, but an individual counter has reset.
    expect(cpuUsage([core(100, 100)], [core(50, 200)])).toBeNull();
    expect(cpuUsage([core(100, 100)], [core(200, 200), core(200, 200)])).toBeNull();
    expect(cpuUsage([core(100, 100)], [core(200, 200, "replacement CPU")])).toBeNull();
  });
});

describe("memory and filesystem arithmetic", () => {
  test("memory includes everything the OS does not report as free", () => {
    expect(memoryUsage(1_000, 250)).toEqual({ totalBytes: 1_000, usedBytes: 750, usagePercent: 75 });
    expect(memoryUsage(1_000, 1_000)?.usagePercent).toBe(0);
    expect(memoryUsage(1_000, 0)?.usagePercent).toBe(100);
    for (const [total, free] of [[0, 0], [-1, 0], [1_000, -1], [1_000, 1_001], [Infinity, 0], [1_000, NaN]]) {
      expect(memoryUsage(total, free)).toBeNull();
    }
  });

  test("disk distinguishes used space from reserved free blocks", () => {
    expect(diskUsage(disk, "/home/atlas", 123)).toEqual({
      totalBytes: 409_600, usedBytes: 245_760, availableBytes: 122_880,
      usagePercent: 60, volume: "/home/atlas", sampledAt: 123,
    });
    expect(diskUsage({ ...disk, bavail: -10 }, "/", 123)?.availableBytes).toBe(0);
    expect(diskUsage({ ...disk, blocks: 0 }, "/", 123)).toBeNull();
    expect(diskUsage({ ...disk, bfree: 101 }, "/", 123)).toBeNull();
    expect(diskUsage({ ...disk, bavail: NaN }, "/", 123)).toBeNull();
  });
});

describe("Atlas lifecycle and partial availability", () => {
  test("disk reads are cached while CPU and memory continue updating", async () => {
    let now = 1_000;
    let user = 100;
    let reads = 0;
    const atlas = new Atlas({ sources: {
      ...fixture(), now: () => now, cpus: () => [core(user, 100)],
      statfs: async (path) => { expect(path).toBe("/home/atlas"); reads++; return disk; },
    } });
    try {
      expect(atlas.snapshot().cpu.usagePercent).toBeNull();
      await Bun.sleep(0);
      expect(atlas.snapshot().disk?.sampledAt).toBe(1_000);
      now = 3_000; user = 200;
      expect(atlas.sample().cpu.usagePercent).toBe(100);
      expect(atlas.snapshot().sampledAt).toBe(3_000);
      expect(reads).toBe(1);
      now = 31_000;
      atlas.sample();
      await Bun.sleep(0);
      expect(reads).toBe(2);
      expect(atlas.snapshot().disk?.sampledAt).toBe(31_000);
    } finally { atlas.stop(); }
  });

  test("unavailable metrics do not disable the others, and disk retries after its cache interval", async () => {
    let now = 1_000;
    let unavailable = true;
    const atlas = new Atlas({ sources: {
      ...fixture(), now: () => now,
      cpus: () => { if (unavailable) throw new Error("no CPU data"); return [core(now, 100)]; },
      statfs: async () => { if (unavailable) throw new Error("unsupported filesystem"); return disk; },
    } });
    try {
      await Bun.sleep(0);
      expect(atlas.snapshot().cpu).toEqual({ usagePercent: null, cores: 0 });
      expect(atlas.snapshot().memory?.usagePercent).toBe(75);
      expect(atlas.snapshot().disk).toBeNull();
      unavailable = false; now = 31_000;
      atlas.sample();
      await Bun.sleep(0);
      expect(atlas.snapshot().cpu.usagePercent).toBeNull();
      expect(atlas.snapshot().disk?.usagePercent).toBe(60);
      now += 2_000;
      expect(atlas.sample().cpu.usagePercent).toBe(100);
    } finally { atlas.stop(); }

    const noMemory = new Atlas({ sources: { ...fixture(), freemem: () => { throw new Error("no memory data"); } } });
    try {
      await Bun.sleep(0);
      expect(noMemory.snapshot().memory).toBeNull();
      expect(noMemory.snapshot().cpu.cores).toBe(1);
      expect(noMemory.snapshot().disk?.usagePercent).toBe(60);
    } finally { noMemory.stop(); }
  });

  test("slow disk requests neither overlap nor publish after shutdown", async () => {
    let finish!: (value: typeof disk) => void;
    let reads = 0;
    let updates = 0;
    let now = 1_000;
    const pending = new Promise<typeof disk>((resolve) => { finish = resolve; });
    const atlas = new Atlas({ sources: {
      ...fixture(), now: () => now,
      statfs: () => { reads++; return pending; },
    } });
    atlas.start(() => { updates++; });
    now = 61_000;
    atlas.sample();
    expect(atlas.snapshot().sampledAt).toBe(61_000);
    expect(reads).toBe(1);
    atlas.stop();
    const before = updates;
    finish(disk);
    await Bun.sleep(0);
    expect(updates).toBe(before);
    expect(atlas.snapshot().disk).toBeNull();
  });

  test("a failed refresh clears old disk data and resets an established CPU baseline", async () => {
    let now = 1_000;
    let unavailable = false;
    const atlas = new Atlas({ sources: {
      ...fixture(), now: () => now,
      cpus: () => { if (unavailable) throw new Error("CPU read failed"); return [core(now, 100)]; },
      statfs: async () => { if (unavailable) throw new Error("volume unmounted"); return disk; },
    } });
    try {
      await Bun.sleep(0);
      expect(atlas.snapshot().disk).not.toBeNull();
      now = 3_000;
      expect(atlas.sample().cpu.usagePercent).toBe(100);
      unavailable = true; now = 31_000;
      expect(atlas.sample().cpu.usagePercent).toBeNull();
      await Bun.sleep(0);
      expect(atlas.snapshot().disk).toBeNull();
      unavailable = false; now = 33_000;
      expect(atlas.sample().cpu.usagePercent).toBeNull();
      now = 35_000;
      expect(atlas.sample().cpu.usagePercent).toBe(100);
    } finally { atlas.stop(); }
  });

  test("publishes periodically and clears its interval when stopped", async () => {
    let updates = 0;
    const atlas = new Atlas({ sources: fixture(), sampleIntervalMs: 5 });
    try {
      atlas.start(() => { updates++; });
      await Bun.sleep(25);
      expect(updates).toBeGreaterThan(2);
      atlas.stop();
      const before = updates;
      await Bun.sleep(20);
      expect(updates).toBe(before);
      atlas.sample();
      expect(updates).toBe(before);
    } finally { atlas.stop(); }
  });
});
