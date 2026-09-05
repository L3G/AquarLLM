/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import type { AgentState, SystemResourcesMessage } from "@aquarllm/shared";
import { AtlasDistrict } from "./atlas-world.ts";
import { LivingCity } from "./city.ts";

function reading(overrides: Partial<SystemResourcesMessage> = {}): SystemResourcesMessage {
  return {
    type: "resources", sampledAt: 1_000_000, hostname: "town-computer",
    cpu: { usagePercent: 20, cores: 8 },
    memory: { usagePercent: 50, usedBytes: 8 * 1024 ** 3, totalBytes: 16 * 1024 ** 3 },
    disk: { usagePercent: 25, usedBytes: 100 * 1024 ** 3, totalBytes: 400 * 1024 ** 3, availableBytes: 300 * 1024 ** 3, volume: "/home", sampledAt: 1_000_000 },
    ...overrides,
  };
}

// Observe the rendered sail angle without requiring a browser or pixel snapshots.
function sailAngle(district: AtlasDistrict): number {
  const angles: number[] = [];
  const ctx = {
    save() {}, restore() {}, translate() {}, scale() {}, fillRect() {},
    rotate(angle: number) { angles.push(angle); },
  } as unknown as CanvasRenderingContext2D;
  const painter = { poly() {}, line() {}, ell() {}, shade(hex: string) { return hex; } };
  district.draw(ctx, painter, "cpu", 0, 0, 1, 1);
  return angles[0]!;
}

function scene() {
  // Construct the real city model with only its browser event hooks stubbed.
  const globals = globalThis as unknown as { window?: Window };
  const previous = globals.window;
  globals.window = { matchMedia: () => ({ matches: false }), addEventListener() {} } as unknown as Window;
  try {
    // The procedural renderer declares its model fields at runtime (@ts-nocheck).
    return new LivingCity({ addEventListener() {} }) as LivingCity & Record<string, any> & { atlasDistrict: AtlasDistrict };
  } finally {
    if (previous) globals.window = previous;
    else delete globals.window;
  }
}

function agent(repo: string): AgentState {
  return { agentId: `agent:${repo}`, agentKind: "codex", displayName: "Codex", activity: "editing", district: "workshop", repo, lastUpdate: 1_000_000 };
}

describe("Atlas public works", () => {
  test("CPU changes alter sail speed without jumping their angle", () => {
    const district = new AtlasDistrict({ now: () => 0, reducedMotion: () => false });
    district.setConnected(true); district.setResources(reading());
    const initial = sailAngle(district);
    district.update(0.1, false);
    const afterLow = sailAngle(district), lowStep = afterLow - initial;
    expect(lowStep).toBeGreaterThan(0);
    district.setResources(reading({ sampledAt: 1_002_000, cpu: { usagePercent: 90, cores: 8 } }));
    expect(sailAngle(district)).toBe(afterLow);
    district.update(0.1, false);
    expect(sailAngle(district) - afterLow).toBeGreaterThan(lowStep);
  });

  test("stale readings, disconnects and reconnects freeze sails until fresh data arrives", () => {
    let now = 0;
    const district = new AtlasDistrict({ now: () => now, reducedMotion: () => false });
    district.setConnected(true); district.setResources(reading()); district.update(0.1, false);
    const stopped = sailAngle(district);
    now = 8_001; district.update(0.1, false);
    expect(sailAngle(district)).toBe(stopped);
    expect(district.hover("cpu").sub).toContain("readings paused");
    // A disk refresh alone cannot make an old CPU/RAM reading fresh again.
    district.setResources(reading({ disk: { ...reading().disk!, sampledAt: 1_009_000 } }));
    district.update(0.1, false); expect(sailAngle(district)).toBe(stopped);
    district.setConnected(false); expect(district.hover("cpu").sub).toContain("disconnected");
    district.setConnected(true); district.update(0.1, false);
    expect(sailAngle(district)).toBe(stopped);
    expect(district.hover("cpu").sub).toContain("waiting for Hermes");
    district.setResources(reading({ sampledAt: 1_009_000 })); district.update(0.1, false);
    expect(sailAngle(district)).toBeGreaterThan(stopped);
    expect(district.hover("cpu").sub).toContain("town-computer");
  });

  test("reduced motion freezes art while percentage readings keep updating", () => {
    let reducedMotion = true;
    const district = new AtlasDistrict({ now: () => 0, reducedMotion: () => reducedMotion });
    district.setConnected(true); district.setResources(reading());
    const stopped = sailAngle(district);
    district.update(0.5, false); expect(sailAngle(district)).toBe(stopped);
    district.setResources(reading({ cpu: { usagePercent: 80, cores: 8 } }));
    expect(district.hover("cpu").title).toContain("80%");
    district.update(0.5, false); expect(sailAngle(district)).toBe(stopped);
    reducedMotion = false; district.update(0.1, false);
    expect(sailAngle(district)).toBeGreaterThan(stopped);
  });

  test("unavailable metrics remain unavailable and disk readings age independently", () => {
    const district = new AtlasDistrict({ now: () => 0, reducedMotion: () => false });
    district.setConnected(true);
    district.setResources(reading({ sampledAt: 1_070_000, cpu: { usagePercent: null, cores: 8 }, memory: null }));
    expect(district.hover("cpu").title).toContain("CPU —");
    expect(district.hover("memory").title).toContain("RAM —");
    expect(district.hover("disk").title).toContain("25%");
    expect(district.hover("disk").sub).toContain("last check over 1m ago");
    const stopped = sailAngle(district); district.update(1, false);
    expect(sailAngle(district)).toBe(stopped);
  });

  test("camera fits the district and a village between panels on a small window", () => {
    const district = new AtlasDistrict({ now: () => 0, reducedMotion: () => false });
    // Exercise the actual camera against scene data without starting a browser loop.
    const city = Object.assign(Object.create(LivingCity.prototype), {
      A: 98, B: 49, MIN_ZOOM: 0.18, _W: 800, _H: 560, leftGutter: 314,
      _vcx: 432, _vcy: 280, cam: { x: 0, y: 0, z: 0.85 },
      projects: [...district.parcels, { life: 1, cells: [{ cx: 4, cy: 0 }, { cx: 8, cy: 0 }, { cx: 6, cy: -2 }, { cx: 6, cy: 2 }] }],
    });
    city.updateCamera(1); city.updateCamera(1);
    for (const parcel of city.projects) for (const cell of parcel.cells ?? [parcel.cell]) {
      const screen = city.project(city.worldPos(cell));
      expect(screen.x - 100 * city.cam.z).toBeGreaterThanOrEqual(314);
      expect(screen.x + 100 * city.cam.z).toBeLessThanOrEqual(550);
      expect(screen.y - 122 * city.cam.z).toBeGreaterThanOrEqual(0);
      expect(screen.y + 74 * city.cam.z).toBeLessThanOrEqual(560);
    }
    const before = city.cam.z;
    city.zoomAt(city._vcx, city._vcy, 0.85);
    expect(city.cam.z).toBeLessThanOrEqual(before);
  });

  test("hiding the empty island removes its terrain, buildings, labels and banner", () => {
    const city = scene(), draws: string[] = [];
    Object.assign(city, {
      _townW: 1200, _townH: 800, _dpr: 1,
      canvas: { getContext: () => ({ setTransform() {} }) },
      ensureStaticBg() {}, drawAnimatedBg() {}, drawGround() {}, drawHUD() {}, drawHover() {},
    });
    city.atlasDistrict.draw = (_ctx, _art, resource) => { draws.push(resource); };
    city.atlasDistrict.drawLabel = (_ctx, resource) => { draws.push(`${resource}:label`); };
    city.atlasDistrict.drawBanner = () => { draws.push("banner"); };
    city.drawTown(0);
    expect(draws).toHaveLength(7);
    expect(Object.keys(city._land).length).toBeGreaterThan(3);
    expect(city.simPool()).toHaveLength(0);

    city.setResourceIslandVisible(false);
    draws.length = 0;
    city.drawTown(0);
    expect(draws).toEqual([]);
    expect(city.projects).toHaveLength(0);
    expect(city._land).toEqual({});
    expect(city.npcWalkable()).toEqual([]);

    city.setResourceIslandVisible(true);
    city.drawTown(0);
    expect(draws).toHaveLength(7);
    expect(city.projects).toHaveLength(3);
    expect(city.simPool()).toHaveLength(0);
  });

  test("repeated toggles preserve agents and reserve room for Atlas when villages arrive hidden", () => {
    const city = scene(), first = agent("/repos/first"), second = agent("/repos/second");
    city.syncAgents([first]);
    const village = city.villages.get(first.repo!)!;
    village.life = 1;
    const resident = city.newAgent(); village.residents.push(resident);
    const originalAgent = village.agents[0], originalAnchor = { ...village.anchor };
    const originalAgentPosition = { wx: originalAgent.wx, wy: originalAgent.wy, tx: originalAgent.tx, ty: originalAgent.ty };
    const originalHouses = village.houses, originalStock = village.stock;
    for (const visible of [false, true, false, false, true, false]) {
      city.setResourceIslandVisible(visible);
      expect(city.villages.get(first.repo!)).toBe(village);
      expect(village.agents[0]).toBe(originalAgent);
      expect(village.anchor).toEqual(originalAnchor);
      expect(village.houses).toBe(originalHouses);
      expect(village.stock).toBe(originalStock);
      expect(village.residents[0]).toBe(resident);
      expect({ wx: originalAgent.wx, wy: originalAgent.wy, tx: originalAgent.tx, ty: originalAgent.ty }).toEqual(originalAgentPosition);
    }
    city.syncAgents([first, second]);
    const secondVillage = city.villages.get(second.repo!)!;
    secondVillage.life = 1;
    const secondAnchor = { ...secondVillage.anchor };
    expect(city.projects).toHaveLength(2);
    const hiddenLand = city.computeLand(city.projects).land as Record<string, { p?: { resource?: string } }>;
    for (const parcel of city.atlasDistrict.parcels) {
      const key = `${parcel.cell.cx},${parcel.cell.cy}`;
      expect(city.occ[key]).toBe(parcel.id);
      expect(secondVillage.cellSet.has(key)).toBe(false);
      expect(hiddenLand[key]?.p?.resource).toBeUndefined();
    }
    city.setResourceIslandVisible(true);
    expect(city.projects).toHaveLength(5);
    expect(city.simPool()).toHaveLength(2);
    expect(city.simPool().reduce((sum, v) => sum + v.agents.length, 0)).toBe(2);
    expect(secondVillage.anchor).toEqual(secondAnchor);
  });

  test("hiding clears vanished NPC routes and excludes Atlas from automatic camera bounds", () => {
    const city = scene();
    city.syncAgents([agent("/repos/first")]);
    const village = [...city.villages.values()][0]; village.life = 1;
    const villageLand = city.computeLand([village]).land as Record<string, { park?: boolean }>;
    const safeKey = Object.keys(villageLand).find(k => villageLand[k].park)!;
    const [cx, cy] = safeKey.split(",").map(Number);
    const safe = city.worldPos({ cx, cy }), gone = city.worldPos({ cx: -2, cy: 0 });
    const staying = { wx: safe.x, wy: safe.y, tx: gone.x, ty: gone.y };
    city.npcs = [staying, { wx: gone.x, wy: gone.y, tx: gone.x, ty: gone.y }];
    city._land = city.computeLand(city.projects).land;
    city._landSig = "before-toggle"; city.npcWalkable();
    Object.assign(city, { _W: 1200, _H: 800, leftGutter: 300 });

    city.setResourceIslandVisible(false);
    expect(city._land).toEqual(villageLand);
    expect(city.npcs).toEqual([staying]);
    const target = city.worldToCell(staying.tx, staying.ty);
    expect(city.npcWalkable()).toContain(`${target.cx},${target.cy}`);
    city.updateCamera(1); city.updateCamera(1);
    expect(city.cam.x).toBeCloseTo(village.green.wx, 3);
    expect(city.cam.y).toBeCloseTo(village.green.wy, 3);
  });

  test("hidden island animation pauses but fresh resource readings are ready when shown", () => {
    const city = scene();
    city.setResourcesConnected(true); city.setSystemResources(reading());
    city.update(0.1, 0);
    const stopped = sailAngle(city.atlasDistrict);
    city.setResourceIslandVisible(false);
    city.setSystemResources(reading({ sampledAt: 1_002_000, cpu: { usagePercent: 85, cores: 8 } }));
    city.update(0.5, 0.5);
    expect(sailAngle(city.atlasDistrict)).toBe(stopped);
    city.setResourceIslandVisible(true);
    expect(city.atlasDistrict.hover("cpu").title).toContain("85%");
    city.update(0.1, 0.6);
    expect(sailAngle(city.atlasDistrict)).toBeGreaterThan(stopped);
  });
});
