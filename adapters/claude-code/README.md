# Iris — the Claude Code adapter

Iris streams a **real Claude Code session** into AquarLLM. It's just hook
configuration: each hook fires a tiny, async, fire-and-forget `curl` that forwards the
raw hook payload to Hermes, which normalizes it server-side. Nothing is installed and
the session is never blocked.

## Enable it

1. Make sure **Hermes is running** (`bun run server`, listening on `:8787`) and Agora
   is open in a browser.

2. Merge [`hooks.settings.json`](./hooks.settings.json) into your Claude Code settings:
   - **All projects:** `~/.claude/settings.json`
   - **One project:** `<repo>/.claude/settings.json` (shareable) or
     `.claude/settings.local.json` (gitignored)

   If a `"hooks"` key already exists, merge the event arrays rather than overwriting.

3. Start (or restart) a Claude Code session in any repo. Your character walks into the
   town and moves between districts as you read / edit / run / search — with a speech
   bubble of the current file or command.

### Hooked events → behavior

| Hook | Becomes | Where the avatar goes |
|---|---|---|
| `SessionStart` | joined | walks in via the **Gate** |
| `UserPromptSubmit` | thinking | **Forum** |
| `PreToolUse` (Read/Glob/Grep) | reading | **Library** |
| `PreToolUse` (Edit/Write) | editing | **Workshop** |
| `PreToolUse` (Bash / MCP) | running | **Terminal** |
| `PreToolUse` (WebFetch/WebSearch) | searching | **Gateway** |
| `PreToolUse` (Agent/Task) | spawning | companion appears |
| `Notification` | waiting | **Help Desk** |
| `PostToolUseFailure` | error | flashes, **Repair** |
| `Stop` | idle | **Stoa** |
| `SubagentStart` / `SubagentStop` | join / leave | tethered companion |
| `SessionEnd` | left | exits via the Gate |

The tool→activity mapping lives in [`shared/logos.ts`](../../shared/logos.ts)
(`toolToActivity`) and normalization in [`server/normalize.ts`](../../server/normalize.ts).

### Different host/port

Edit the URL in `hooks.settings.json`, or use [`iris.sh`](./iris.sh) (which reads
`AQUARLLM_HERMES`) by pointing each hook's `command` at its absolute path:

```json
{ "type": "command", "command": "/ABS/PATH/adapters/claude-code/iris.sh", "async": true, "timeout": 5 }
```

## Other agents (Codex, Grok, private/local LLMs)

There's no Claude-specific magic — any agent can join by POSTing a **canonical Logos
event** to Hermes' generic endpoint:

```
POST http://localhost:8787/ingest
Content-Type: application/json

{
  "agentKind": "codex",          // "claude" | "codex" | "grok" | "custom"
  "agentId": "session-or-pid",   // stable per agent; identifies the avatar
  "displayName": "Codex-7",      // optional
  "activity": "editing",         // see Activity in shared/logos.ts
  "detail": "main.rs",           // optional bubble text
  "project": "rustlang",         // optional
  "parentId": "parent-agentId",  // optional; renders as a tethered companion
  "ts": 1718800000000            // optional; server fills if omitted
}
```

Quick test:

```bash
curl -X POST http://localhost:8787/ingest -H 'Content-Type: application/json' \
  -d '{"agentKind":"grok","agentId":"grok-1","activity":"searching","detail":"rust async","project":"xai"}'
```

Wire this into whatever hook/log mechanism your agent has (Codex notify/hooks, a
log-tailer, a wrapper script). Emit `{"activity":"left"}` for that `agentId` when it
finishes so its avatar leaves. Until a native adapter exists, **Eidolon** (`sim/`) is
the reference producer for this contract.

### Safety

Every hook is `"async": true` with a short `timeout` and a trailing `|| true`, so a
slow or down Hermes can never block or fail your Claude session — events are simply
dropped.
