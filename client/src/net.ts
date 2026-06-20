/** WebSocket client to Hermes with auto-reconnect. */
import type { WorldSnapshot } from "@aquarllm/shared";

export function connect(url: string, onSnapshot: (snap: WorldSnapshot) => void): void {
  let retry = 500;

  const open = (): void => {
    const ws = new WebSocket(url);

    ws.onopen = () => {
      retry = 500;
      setStatus(true);
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string);
        if (msg?.type === "snapshot") onSnapshot(msg as WorldSnapshot);
      } catch {
        // ignore non-JSON frames
      }
    };
    ws.onclose = () => {
      setStatus(false);
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
