# simpl-memory — privacy & data

## What is stored locally

- **Path**: `~/.claude/simpl-memory/<repo-basename>/instincts.jsonl`
- **Content**: short JSON lines (`pattern`, `suggestion`, `category`, `count`, `hash`, flags). **Not** full transcripts.

## Extraction (on-demand, owner-only)

- **Who**: only the github_login values listed under `simpl_memory.instinct_owners` in [`config/simpl.json`](../../config/simpl.json) (`Len378`, `n3ural`, `not-Karot`).
- **How**: slash command `/extract-instincts` — the **same agent session** (Cursor or Claude Code) reads a transcript path, applies redaction rules, emits structured JSON, then [`scripts/persist-instincts.js`](scripts/persist-instincts.js) merges into `instincts.jsonl`.
- **No API keys**: this plugin does not call Anthropic/OpenAI/DeepSeek HTTP endpoints. Uninstalling or skipping `/extract-instincts` means no new local rows.

## Opt-out

- Uninstall plugin **or** never run `/extract-instincts` → no new local rows.
- Delete `~/.claude/simpl-memory/` to wipe local data.

## Team feed (optional, owner-driven)

- **Local stays private** until an instinct owner runs `/share-instincts`. That opens a PR adding or replacing `team-instincts/raw/<github-login>.jsonl` in `simpl-techs/simpl_knowledge`.
- **The same owners** run `/aggregate-team-instincts` to merge all `raw/*.jsonl` into `team-instincts/instincts.jsonl` and open another PR.
- After merge, every dev receives the aggregated file via marketplace cache; `load-instincts.js` injects it as **Team-wide patterns** at session start (unless the same `hash` already exists in that dev’s local store for the repo — local wins).

## Redaction

- The `/extract-instincts` command instructs the agent to strip common secret/email patterns **before** reasoning over transcript text.
- [Inference] This reduces accidental leakage; it is not a substitute for never pasting secrets into the agent.
