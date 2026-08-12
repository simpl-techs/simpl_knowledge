---
name: simpl-hook-protocol
description: Normalized hook payload between Cursor and Claude Code for simpl_knowledge shared scripts under scripts/shared-hooks/. Consult when debugging secret-scan.js, session-refresh.js, or writing a new shared hook.
---

# Hook protocol

## Shared scripts

- Location: `simpl_knowledge/scripts/shared-hooks/*.js`.
- Cursor: `adapter.js` (project `.cursor/hooks/` or global `~/.cursor/hooks/`) maps events → synthetic Claude-like payload, then runs e.g. `node …/secret-scan.js` or `node …/session-refresh.js`.
- Claude Code: same scripts; PreToolUse hooks use native stdin JSON. SessionStart refresh calls `session-refresh.js` with empty stdin (see `session-start-refresh.sh`).

## Wired today

| Script | Role |
|--------|------|
| `secret-scan.js` | `beforeShellExecution`, `afterFileEdit`, `beforeSubmitPrompt` → block obvious secrets (exit 2). |
| `session-refresh.js` | `sessionStart` / SessionStart → fetch + `reset --hard` of simpl_knowledge cache, sync org `simpl-*.mdc`, write `~/.simpl_knowledge/state.json`, emit Cursor `additional_context` / Claude `additionalContext` with sha (or failure warning). |
| `plugin-refresh.js` | Claude `simpl-standards` SessionStart → heal marketplace clone; warn when installed plugin versions lag. |
| `repo-context-check.js` | After refresh (worker) or sync hook path (`--claude-session-hook`): compare repo to `library-repo-template/` when opted-in; write `.claude/.simpl-repo-report.json` on drift. |

## Adding a hook (DRY)

1. Add `my-hook.js` under `scripts/shared-hooks/`.
2. Cursor: register the Cursor event in `.cursor/hooks.json` (or merge via `install-cursor-global-hooks.sh` pattern for globals) → `node …/adapter.js my-hook`.
3. Claude: register the matching hook in `.claude/settings.json` → invoke the same script with appropriate stdin (or a one-line shell shim that pipes JSON).

## Adapter output shape (simplified)

```json
{
  "hook_event_name": "PreToolUse",
  "tool_name": "<cursor event>",
  "tool_input": { "command": "..." } | { "file_path": "...", "content": "..." } | { "prompt": "..." },
  "_harness": "cursor"
}
```

## Exit codes

- `0` — allow tool.
- `2` — block tool (Claude Code convention for PreToolUse).

## Env

- `SIMPL_SHARED_HOOKS` — override path to `shared-hooks/` when not using default plugin cache layout.
