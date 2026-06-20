/** DOM sidebar legend listing live agents (crisper than in-canvas text). */
import type { AgentState } from "@aquarllm/shared";
import { ACTIVITY_ICON } from "./character.ts";

const KIND_DOT: Record<string, string> = {
  claude: "#d97757",
  codex: "#10a37f",
  grok: "#9aa0a6",
  custom: "#9b7cf0",
};

export function renderLegend(agents: AgentState[]): void {
  const el = document.getElementById("legend");
  if (!el) return;

  const sorted = agents
    .slice()
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  const rows = sorted
    .map((a) => {
      const dot = KIND_DOT[a.agentKind] ?? "#999";
      const icon = ACTIVITY_ICON[a.activity] ?? "";
      const parts: string[] = [];
      // Don't repeat the folder when it's already the character's name.
      if (a.project && a.project !== a.displayName) parts.push(escapeHtml(a.project));
      if (a.detail) parts.push(escapeHtml(a.detail));
      const detail = parts.join(" · ");
      return (
        `<div class="row${a.parentId ? " sub" : ""}">` +
        `<span class="dot" style="background:${dot}"></span>` +
        `<span class="name">${escapeHtml(a.displayName)}</span>` +
        `<span class="act">${icon} ${a.activity}</span>` +
        `<span class="detail">${detail}</span>` +
        `</div>`
      );
    })
    .join("");

  el.innerHTML = `<div class="legend-title">Agents · ${agents.length}</div>${rows}`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
}
