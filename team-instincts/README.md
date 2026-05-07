# Team instincts

Live database of **aggregated** patterns shared across the org. Instinct **owners** publish **one file each under `raw/`**; they merge raw files into `instincts.jsonl` via `/aggregate-team-instincts` in Cursor or Claude Code.

## Layout

| Path | Role |
|------|------|
| `raw/<github-handle>.jsonl` | One file per developer. Overwritten on each new `/share-instincts` PR from that dev. |
| `instincts.jsonl` | Merged, deduplicated feed consumed by `load-instincts.js` at session start (from marketplace cache). |
| `state.json` | Last aggregation run metadata (`last_aggregated_at`, `aggregator`, `raw_files_seen`). |

## Raw row schema

Same shape as the local store (`~/.claude/simpl-memory/<repo>/instincts.jsonl`): `hash`, `pattern`, `suggestion`, `category`, `count`, timestamps, etc. Only rows the dev explicitly keeps after `/share-instincts` filtering should land here.

## Aggregated row schema

Compatible with the local schema, plus:

- `team_count` — summed `count` across contributors for the same `hash` (or weighted equivalent after merge).
- `contributors` — string array of GitHub logins that supplied that pattern.

`load-instincts.js` injects rows with `(team_count || count) >= 2` into **Team-wide patterns**, unless the same `hash` already exists in the dev’s **local** store for the current repo (local wins).

## How to contribute

1. **Instinct owners only** (`config/simpl.json` → `simpl_memory.instinct_owners`): run `/extract-instincts` inside Cursor or Claude Code (see plugin `PRIVACY.md`). This writes `~/.claude/simpl-memory/<repo>/instincts.jsonl`.
2. **Share:** `/share-instincts` (same allowlist) — filters interactively, opens a PR updating `raw/<you>.jsonl`.
3. **Merge (same owners):** `/aggregate-team-instincts` — reads all `raw/*.jsonl`, deduplicates by `hash`, writes `instincts.jsonl` + `state.json`, opens PR.

## Operators

The three `github_login` values in `simpl_memory.instinct_owners` (`config/simpl.json`) run `/extract-instincts`, `/share-instincts`, and `/aggregate-team-instincts`. They need: Claude/Cursor subscription for agent steps, `gh` authenticated, write access to `simpl-techs/simpl_knowledge`. [Inference] Their subscription usage applies to aggregation and extraction sessions.

## Limitations

- **Manual:** aggregation does not run on a schedule in CI. An owner must run `/aggregate-team-instincts` periodically.
- **Cursor:** no headless agent; the operator starts a session and runs the command when needed — same as any other slash command.
- **No automatic secrets filter beyond redaction in `/extract-instincts`** — `/share-instincts` must let the human exclude sensitive repos or rows.

## TODO (optional hardening)

- GitHub Action that validates JSONL schema on PRs touching `team-instincts/raw/` or `instincts.jsonl`.
- Per-repo opt-in file (e.g. `.simpl-memory.yaml` with `share_team: true|false`).
