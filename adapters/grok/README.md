# Grok adapter

Streams a **Grok CLI** session into AquarLLM. Grok has a hooks system (same JSON schema
as Claude Code, with `type:"http"` support) and reads **global, always-trusted** hook
files from `~/.grok/hooks/*.json` — so this is zero per-project setup.

## Enable it (dev)

With Hermes running on `:8787`, drop [`hooks.json`](./hooks.json) at:

```
~/.grok/hooks/aquarllm.json
```

Start (or restart) a Grok session — its activity streams to AquarLLM as a `grok` citizen.
(The **desktop app installs this for you automatically** when it detects `~/.grok`, and
the tray has a toggle.)

### Hooked events → behavior

`SessionStart`→joined, `UserPromptSubmit`→thinking, `PreToolUse`→ activity by tool
(`run_terminal_command`→running, `read_file`/`grep`/`list_dir`→reading,
`search_replace`/`write`→editing, `web_search`→searching, `spawn_subagent`→spawning),
`PostToolUseFailure`→error, `Stop`→idle, `SessionEnd`→left. Grok POSTs its event envelope
(`hookEventName`, `sessionId`, `cwd`, `toolName`, `toolInput`) to `/ingest/grok-hook`,
normalized server-side in [`server/normalize-grok.ts`](../../server/normalize-grok.ts).

## Zero-touch presence

Even without hooks, AquarLLM (and the desktop app) reads `~/.grok/active_sessions.json`
to show **open-but-idle Grok sessions** asleep in the city — no interaction needed.

## Change host/port

Edit the `url` in `hooks.json` (the app uses `http://localhost:8787`).
