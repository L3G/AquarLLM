/** WebSocket client to Hermes with auto-reconnect. */
import type { LogEntry, RepoInfo, SystemResourcesMessage, WorldSnapshot } from "@aquarllm/shared";

interface Handlers {
  snapshot: (snap: WorldSnapshot) => void;
  log?: (entries: LogEntry[]) => void;
  repos?: (repos: RepoInfo[]) => void;
  resources?: (resources: SystemResourcesMessage) => void;
  connection?: (connected: boolean) => void;
}

export function connect(url: string, handlers: Handlers): void {
  let retry = 500;

  const open = (): void => {
    const ws = new WebSocket(url);

    ws.onopen = () => {
      retry = 500;
      setStatus(true);
      handlers.connection?.(true);
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string);
        if (msg?.type === "snapshot") handlers.snapshot(msg as WorldSnapshot);
        else if (msg?.type === "log") handlers.log?.((msg as { entries: LogEntry[] }).entries);
        else if (msg?.type === "repos") handlers.repos?.((msg as { repos: RepoInfo[] }).repos);
        else if (msg?.type === "resources") handlers.resources?.(msg as SystemResourcesMessage);
      } catch {
        // ignore non-JSON frames
      }
    };
    ws.onclose = () => {
      setStatus(false);
      handlers.connection?.(false);
      setTimeout(open, retry);
      retry = Math.min(retry * 2, 5000);
    };
    ws.onerror = () => ws.close();
  };

  open();
}

function setStatus(connected: boolean): void {
  const el = document.getElementById("status");
  if (!el) return;
  el.textContent = connected ? "● connected" : "○ reconnecting…";
  el.className = connected ? "ok" : "bad";
}
