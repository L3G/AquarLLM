/** A pixel-person avatar: drawn with Graphics (placeholder art), billboarded. */
import { Container, Graphics, Text } from "pixi.js";
import type { Activity, AgentKind } from "@aquarllm/shared";
import { depth, isoToScreen, type Tile } from "./iso.ts";

const KIND_COLOR: Record<AgentKind, number> = {
  claude: 0xd97757, // clay
  codex: 0x10a37f, // green
  grok: 0x9aa0a6, // grey
  custom: 0x9b7cf0, // violet
};

export const ACTIVITY_ICON: Record<Activity, string> = {
  joined: "🚪",
  left: "👋",
  thinking: "💭",
  reading: "📖",
  editing: "🔨",
  running: "⌨️",
  searching: "🔭",
  waiting: "❓",
  spawning: "✨",
  error: "❗",
  idle: "💤",
};

const SPEED = 3.2; // tiles / second

export class Character {
  readonly container = new Container();
  col: number;
  row: number;

  private path: Tile[] = [];
  private body = new Graphics();
  private bed = new Graphics();
  private sleeping = false;
  private icon: Text;
  private nameText: Text;
  private bubble = new Container();
  private bubbleBg = new Graphics();
  private bubbleText: Text;
  private t = Math.random() * 10; // desync bobbing
  private flash = 0;

  constructor(
    public agentId: string,
    kind: AgentKind,
    name: string,
    start: Tile,
    isSub = false,
  ) {
    this.col = start.col;
    this.row = start.row;

    const shadow = new Graphics();
    shadow.ellipse(0, 0, 9, 4).fill({ color: 0x000000, alpha: 0.28 });

    this.drawBody(KIND_COLOR[kind]);
    this.drawBed();

    this.icon = new Text({ text: "", style: { fontFamily: "sans-serif", fontSize: 14 } });
    this.icon.anchor.set(0.5, 1);
    this.icon.position.set(0, -30);

    this.nameText = new Text({
      text: name,
      style: {
        fontFamily: "monospace",
        fontSize: 10,
        fill: 0xcfd8e3,
        stroke: { color: 0x000000, width: 3 },
      },
    });
    this.nameText.anchor.set(0.5, 0);
    this.nameText.position.set(0, 4);

    this.bubbleText = new Text({
      text: "",
      style: { fontFamily: "monospace", fontSize: 10, fill: 0x16181d },
    });
    this.bubbleText.anchor.set(0.5, 0.5);
    this.bubble.addChild(this.bubbleBg, this.bubbleText);
    this.bubble.position.set(0, -42);
    this.bubble.visible = false;

    this.container.addChild(shadow, this.bed, this.body, this.icon, this.nameText, this.bubble);
    this.container.scale.set(isSub ? 0.7 : 1);
    this.sync();
  }

  private drawBody(color: number): void {
    const g = this.body;
    g.clear();
    g.rect(-5, -8, 4, 8).fill(0x2b2f38); // legs
    g.rect(1, -8, 4, 8).fill(0x2b2f38);
    g.roundRect(-7, -22, 14, 16, 4).fill(color); // torso
    g.circle(0, -26, 6).fill(0xf0d9b5); // head
    g.stroke({ width: 1, color: 0x000000, alpha: 0.35 });
  }

  private drawBed(): void {
    const g = this.bed;
    g.clear();
    g.roundRect(-15, -3, 30, 11, 2).fill(0x4a3a2a); // wooden frame
    g.roundRect(-14, -6, 28, 8, 2).fill(0x6b7a8f); // mattress
    g.roundRect(-13, -6, 9, 7, 2).fill(0xeef2f7); // pillow
    g.roundRect(-4, -6, 17, 8, 2).fill(0x8a5a6a); // blanket
    g.stroke({ width: 1, color: 0x000000, alpha: 0.3 });
    g.visible = false;
  }

  setActivity(activity: Activity, detail?: string): void {
    this.icon.text = ACTIVITY_ICON[activity] ?? "";
    if (activity === "error") this.flash = 0.8;

    // Idle agents are open-but-not-working instances — they lie down in a bed.
    this.sleeping = activity === "idle";
    this.bed.visible = this.sleeping;
    this.body.rotation = this.sleeping ? -1.5 : 0;
    this.body.position.set(this.sleeping ? 11 : 0, this.sleeping ? -6 : 0);

    if (detail) {
      this.bubbleText.text = detail;
      const w = this.bubbleText.width + 12;
      const h = this.bubbleText.height + 8;
      this.bubbleBg
        .clear()
        .roundRect(-w / 2, -h / 2, w, h, 5)
        .fill({ color: 0xf5f7fa })
        .stroke({ width: 1, color: 0x000000, alpha: 0.3 });
      this.bubble.visible = true;
    } else {
      this.bubble.visible = false;
    }
  }

  setPath(path: Tile[]): void {
    this.path = path;
  }

  update(dt: number): void {
    this.t += dt;

    if (this.path.length) {
      const next = this.path[0]!;
      const dx = next.col - this.col;
      const dy = next.row - this.row;
      const dist = Math.hypot(dx, dy);
      const step = SPEED * dt;
      if (dist <= step) {
        this.col = next.col;
        this.row = next.row;
        this.path.shift();
      } else {
        this.col += (dx / dist) * step;
        this.row += (dy / dist) * step;
      }
    }

    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt);
      this.body.tint = this.flash > 0.4 ? 0xff5555 : 0xffffff;
    } else {
      this.body.tint = 0xffffff;
    }

    this.sync();
  }

  private sync(): void {
    const { x, y } = isoToScreen(this.col, this.row);
    const moving = this.path.length > 0;
    const bob = this.sleeping
      ? 0
      : moving
        ? Math.abs(Math.sin(this.t * 10)) * 3
        : Math.sin(this.t * 2) * 1.5;
    this.container.position.set(x, y - bob);
    // Keep avatars above all floor tiles; sort among themselves by grid depth.
    this.container.zIndex = 10_000 + depth(this.col, this.row);
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
