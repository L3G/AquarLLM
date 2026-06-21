/**
 * Claude Code hooks installer (cross-platform). Uses `type:"http"` hooks (no shell, no
 * curl) pointing at the app's local server, merged non-destructively into the user's
 * global settings. Tagged so we can detect/remove our own hooks cleanly.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

const SETTINGS = join(homedir(), ".claude", "settings.json");
const TAG = "aquarllm"; // marker so we recognise our own hooks
const EVENTS_ANY = ["SessionStart", "SessionEnd", "UserPromptSubmit", "Stop", "Notification", "SubagentStart", "SubagentStop"];
const EVENTS_TOOL = ["PreToolUse", "PostToolUseFailure"];

function hookEntry(port: number) {
  return { type: "http", url: `http://localhost:${port}/ingest/claude-hook`, timeout: 3, _src: TAG };
}
function group(port: number, withMatcher: boolean) {
  const g: any = { hooks: [hookEntry(port)] };
  if (withMatcher) g.matcher = "*";
  return g;
}
function readSettings(): any {
  try { return existsSync(SETTINGS) ? JSON.parse(readFileSync(SETTINGS, "utf8")) : {}; } catch { return {}; }
}
function isOurs(g: any): boolean {
  return Array.isArray(g?.hooks) && g.hooks.some((h: any) =>
    h?._src === TAG ||
    (typeof h?.url === "string" && h.url.includes("/ingest/claude-hook")) ||
    (typeof h?.command === "string" && h.command.includes("/ingest/claude-hook")));
}

export function hooksStatus(port: number): { installed: boolean; settingsPath: string } {
  const s = readSettings();
  const installed = !!s.hooks?.PreToolUse?.some?.(isOurs);
  return { installed, settingsPath: SETTINGS };
}

export function installHooks(port: number): void {
  mkdirSync(dirname(SETTINGS), { recursive: true });
  if (existsSync(SETTINGS)) { try { copyFileSync(SETTINGS, SETTINGS + ".aquarllm.bak"); } catch { /* ignore */ } }
  const s = readSettings();
  s.hooks = s.hooks || {};
  const add = (ev: string, withMatcher: boolean) => {
    const arr = Array.isArray(s.hooks[ev]) ? s.hooks[ev].filter((g: any) => !isOurs(g)) : [];
    arr.push(group(port, withMatcher));
    s.hooks[ev] = arr;
  };
  for (const ev of EVENTS_ANY) add(ev, false);
  for (const ev of EVENTS_TOOL) add(ev, true);
  writeFileSync(SETTINGS, JSON.stringify(s, null, 2) + "\n");
}

export function uninstallHooks(): void {
  if (!existsSync(SETTINGS)) return;
  const s = readSettings();
  if (!s.hooks) return;
  for (const ev of Object.keys(s.hooks)) {
    if (!Array.isArray(s.hooks[ev])) continue;
    s.hooks[ev] = s.hooks[ev].filter((g: any) => !isOurs(g));
    if (!s.hooks[ev].length) delete s.hooks[ev];
  }
  if (!Object.keys(s.hooks).length) delete s.hooks;
  writeFileSync(SETTINGS, JSON.stringify(s, null, 2) + "\n");
}

/* ---------- Grok CLI hooks ---------- */
// Grok reads global, always-trusted hook files from ~/.grok/hooks/*.json (same schema
// as Claude, with type:"http" support). We own a single file so install = overwrite.
const GROK_DIR = join(homedir(), ".grok");
const GROK_HOOKS = join(GROK_DIR, "hooks", "aquarllm.json");

export function grokAvailable(): boolean {
  return existsSync(GROK_DIR);
}

export function grokHooksStatus(): { installed: boolean; hooksPath: string } {
  return { installed: existsSync(GROK_HOOKS), hooksPath: GROK_HOOKS };
}

export function installGrokHooks(port: number): void {
  if (!grokAvailable()) return;
  mkdirSync(dirname(GROK_HOOKS), { recursive: true });
  const http = () => ({ type: "http", url: `http://localhost:${port}/ingest/grok-hook`, timeout: 3 });
  const hooks: Record<string, unknown> = {};
  for (const ev of [...EVENTS_ANY, ...EVENTS_TOOL]) hooks[ev] = [{ hooks: [http()] }]; // empty matcher = all tools
  writeFileSync(GROK_HOOKS, JSON.stringify({ hooks }, null, 2) + "\n");
}

export function uninstallGrokHooks(): void {
  try { if (existsSync(GROK_HOOKS)) rmSync(GROK_HOOKS); } catch { /* ignore */ }
}
