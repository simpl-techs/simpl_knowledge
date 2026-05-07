---
name: aggregate-team-instincts
description: Owner-only — merge team-instincts/raw/*.jsonl into team-instincts/instincts.jsonl with hash dedup; update state.json; open PR on simpl_knowledge.
---

# /aggregate-team-instincts

## Allowlist check (mandatory first)

Same owners as `/extract-instincts` — `Len378`, `n3ural`, `not-Karot`:

```bash
LOGIN="$(gh api user -q .login)" || { echo 'ERROR: run gh auth login first'; exit 1; }
CONFIG="${SIMPL_KNOWLEDGE_CONFIG:-$HOME/.claude/plugins/cache/simpl_knowledge/config/simpl.json}"
node -e '
const fs = require("fs");
const login = process.env.LOGIN;
const cfgPath = process.env.CONFIG;
if (!fs.existsSync(cfgPath)) { console.error("ERROR: missing config at", cfgPath); process.exit(1); }
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
const owners = (cfg.simpl_memory && cfg.simpl_memory.instinct_owners || []).map((o) => o.github_login);
if (!owners.includes(login)) {
  console.error("ERROR: " + login + " is not an instinct owner.");
  process.exit(1);
}
console.log("OK instinct owner:", login);
' CONFIG="$CONFIG" LOGIN="$LOGIN"
```

**Designated operators** (the three github_login values in `config/simpl.json`). Merges all `team-instincts/raw/*.jsonl` into `team-instincts/instincts.jsonl`, deduplicates by `hash`, writes `team-instincts/state.json`, opens a PR.

[Inference] This run uses the operator’s Claude/Cursor subscription while their agent executes the workflow.

**Requirements**

- `gh` authenticated with rights to push branches and open PRs on `simpl-techs/simpl_knowledge`.
- Clean or stashed working tree inside the simpl_knowledge clone you use (prefer the marketplace cache path below).

## Workflow

### 1. Clone / update simpl_knowledge

```bash
CACHE="${HOME}/.claude/plugins/cache/simpl_knowledge"
if [ ! -d "$CACHE/.git" ]; then
  git clone --depth 1 https://github.com/simpl-techs/simpl_knowledge.git "$CACHE"
fi
cd "$CACHE"
git fetch origin
git checkout main
git pull origin main
```

### 2. Concurrency / throttle

Read `team-instincts/state.json`.

- Run `gh pr list --repo simpl-techs/simpl_knowledge --state open --search "chore(instincts): aggregate" --json number,title` (or equivalent). If any open PR matches that purpose, **stop** and tell the operator to finish or close it first.
- If `last_aggregated_at` is set and is **less than 7 days ago**, ask the operator to confirm they really want another aggregation run (avoid noisy PRs).

### 3. Load all raw files

Collect every `team-instincts/raw/*.jsonl` file **except** empty files. Parse JSONL; skip invalid lines with a warning summary.

### 4. Deterministic dedup by `hash`

- Primary key: `hash` string on each row.
- For rows sharing the same `hash`:
  - `team_count` = sum of `(row.count || 1)` across contributing raw rows.
  - `contributors` = sorted unique list of GitHub logins inferred from filename: `raw/<login>.jsonl` → `<login>`.
  - `pattern`, `suggestion`, `category`: keep from the row with the **highest** individual `count`; tie-break by lexicographic `pattern`.
  - Preserve `hash` unchanged.
  - Do **not** copy `promoted`, `dismissed_promotion`, `sessions` from local stores unless you intentionally want them — for team feed, omit or set `promoted: false`.

### 5. Semantic polish (optional but recommended)

In the same session, briefly group or re-label categories only if it improves clarity. Do not invent new patterns not supported by raw evidence. Keep each `pattern` / `suggestion` short.

### 6. Write outputs

- Write `team-instincts/instincts.jsonl` — one JSON object per line, sorted by `team_count` descending (ties by `hash`).
- Update `team-instincts/state.json`:
  - `last_aggregated_at` = ISO-8601 now.
  - `aggregator` = output of `gh api user -q .login`.
  - `raw_files_seen` = sorted list of basenames in `raw/*.jsonl` that contributed at least one row.

### 7. Commit and PR

```bash
BRANCH="aggregate-instincts/$(date +%Y%m%d-%H%M%S)"
git checkout -b "$BRANCH"
git add team-instincts/instincts.jsonl team-instincts/state.json
git commit -m "chore(instincts): aggregate team patterns"
git push -u origin "$BRANCH"
gh pr create --repo simpl-techs/simpl_knowledge --title "chore(instincts): aggregate $(date +%Y-%m-%d)" --body "Automated aggregation from team-instincts/raw. Review diff carefully. Operator: $(gh api user -q .login)"
```

### 8. Human review

Remind reviewers: this file is distributed to all devs via marketplace cache + `load-instincts.js`. Reject if anything looks client-specific or unsafe.

## Rules

- Never push directly to `main` — always PR.
- Never delete raw files in this command unless the operator explicitly asks (raw history can help debugging; optional cleanup is a separate change).
- If no raw files contain rows after parsing, do not open an empty PR — report “nothing to aggregate”.
