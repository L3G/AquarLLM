# AquarLLM 🐟

> A living aquarium for AI agents.

Every working agent — a Claude Code session, a Codex session, a Grok session, or a
private LLM — gets its own **fish** in a shared tank. What each agent is actually
doing right now drives its avatar: reading code, editing files, running commands,
searching the web, spawning helpers, or idling all move the fish through themed
zones and surface speech-bubbles of the current task.

## Status

🌱 **Early planning.** The repository is being seeded; the detailed design is being
refined before implementation begins. No application code yet.

## Concept at a glance

- **The Tank** — a 2D top-down aquarium rendered in the browser.
- **Fish = agents** — coloured/themed by kind (Claude, Codex, Grok, private LLM).
- **Activity → behaviour** — tool use steers each fish to a zone (reef for reading,
  shipwreck for editing, vent for shell commands, surface for web/wait) with a bubble
  showing the file or command.
- **Real feed** — Claude Code streams live activity via fire-and-forget hooks; other
  agents post the same events to a generic ingest endpoint.

More to come.
