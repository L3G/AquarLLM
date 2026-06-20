#!/usr/bin/env bash
# Iris — forward a Claude Code hook payload (read from stdin) to Hermes.
# Fire-and-forget: never blocks the session, never fails the hook.
#
# Optional: use this instead of the inline curl in hooks.settings.json by pointing
# each hook's "command" at the absolute path of this file. Override the target with
#   AQUARLLM_HERMES=http://host:port
HERMES="${AQUARLLM_HERMES:-http://localhost:8787}"
curl -s -X POST "$HERMES/ingest/claude-hook" \
  -H "Content-Type: application/json" \
  -d @- >/dev/null 2>&1 || true
