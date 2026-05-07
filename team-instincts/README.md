# Team instincts

Live database of **aggregated** patterns shared across the org. Each developer who opts in publishes **one file under `raw/`**; designated operators merge raw files into `instincts.jsonl` via the agent (Cursor or Claude Code).

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

1. Learn locally: `simpl-memory` Stop hook + optional API keys (see plugin `PRIVACY.md`).
2. **Share:** slash command `/share-instincts` — filters interactively, opens a PR updating `raw/<you>.jsonl`.
3. **Merge (operators only):** `/aggregate-team-instincts` — reads all `raw/*.jsonl`, deduplicates by `hash`, writes `instincts.jsonl` + `state.json`, opens PR.

## Operators

Pick 2–3 volunteers with: adequate Claude/Cursor subscription (aggregation uses the agent in a real session), `gh` authenticated, write access to `simpl-techs/simpl_knowledge`. [Inference] Their subscription usage applies to the aggregation task.

## Limitations

- **Manual:** aggregation does not run on a schedule in CI. Someone must run `/aggregate-team-instincts` periodically.
- **Cursor:** no headless agent; the operator starts a session and runs the command when needed — same as any other slash command.
- **No automatic secrets filter beyond redaction in extraction** — `/share-instincts` must let the human exclude sensitive repos or rows.

## TODO (optional hardening)

- GitHub Action that validates JSONL schema on PRs touching `team-instincts/raw/` or `instincts.jsonl`.
- Per-repo opt-in file (e.g. `.simpl-memory.yaml` with `share_team: true|false`).
