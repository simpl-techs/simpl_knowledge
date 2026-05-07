---
name: share-instincts
description: Opt-in — publish your local simpl-memory instincts to team-instincts/raw/<your-github-login>.jsonl on simpl_knowledge via PR.
---

# /share-instincts

Publish patterns from your **local** `simpl-memory` store into the org-wide collector inside `simpl-techs/simpl_knowledge`. One file per developer: `team-instincts/raw/<github-handle>.jsonl`.

**Requirements**

- `gh` CLI installed and authenticated (`gh auth status`).
- Permission to open PRs against `simpl-techs/simpl_knowledge` (org member with appropriate repo role, or fork flow if read-only).
- Local instinct file must exist (you have been using `simpl-memory` with extraction enabled).

## Workflow

### 1. Resolve current git repo and local store path

```bash
node -e '
const fs = require("fs"), path = require("path"), os = require("os");
const { execSync } = require("child_process");
let repo;
try { repo = path.basename(execSync("git rev-parse --show-toplevel", { encoding: "utf8", cwd: process.cwd() }).trim()); }
catch { console.log("ERROR: not inside a git repo. cd into the project first."); process.exit(1); }
const f = path.join(os.homedir(), ".claude/simpl-memory", repo, "instincts.jsonl");
console.log("REPO_BASENAME=" + repo);
console.log("LOCAL_STORE=" + f);
if (!fs.existsSync(f)) { console.log("ERROR: no local instincts at " + f); process.exit(1); }
const lines = fs.readFileSync(f, "utf8").split("\n").filter(Boolean);
console.log("ROW_COUNT=" + lines.length);
'
```

### 2. Resolve GitHub login

```bash
gh api user -q .login
```

If this fails, tell the user to run `gh auth login` and retry.

### 3. List instincts and confirm filtering WITH the user

Read `LOCAL_STORE` from step 1. Parse JSONL. For each row print: index, `hash`, `category`, `pattern`, `suggestion`, and `count` if present.

**Mandatory user prompts:**

- Exclude any row the user does not want shared (wrong, too client-specific, sensitive).
- Optionally exclude by `category` or keyword.
- Remind: only non-secret, generalized patterns belong here.

Build the filtered array `toShare`. If empty, stop and do not open a PR.

### 4. Work inside simpl_knowledge clone

Use the marketplace cache (same path as bootstrap):

```text
${HOME}/.claude/plugins/cache/simpl_knowledge
```

If that directory is missing or not a git repo, clone fresh:

```bash
git clone --depth 1 https://github.com/simpl-techs/simpl_knowledge.git "$HOME/.claude/plugins/cache/simpl_knowledge"
```

Then:

```bash
cd "$HOME/.claude/plugins/cache/simpl_knowledge"
git fetch origin
git checkout main
git pull origin main
```

### 5. Branch and write the raw file

`GITHUB_LOGIN` = output of step 2.

```bash
BRANCH="share-instincts/${GITHUB_LOGIN}-$(date +%Y%m%d-%H%M%S)"
git checkout -b "$BRANCH"
```

Write **only** `team-instincts/raw/${GITHUB_LOGIN}.jsonl` with one JSON object per line from `toShare` (pretty-print off; one object per line, UTF-8).

Do not modify `team-instincts/instincts.jsonl` or `state.json` in this command — operators do that in `/aggregate-team-instincts`.

### 6. Commit and open PR

```bash
git add "team-instincts/raw/${GITHUB_LOGIN}.jsonl"
git commit -m "chore(instincts): share patterns from ${GITHUB_LOGIN}"
git push -u origin "$BRANCH"
gh pr create --repo simpl-techs/simpl_knowledge --title "chore(instincts): share from ${GITHUB_LOGIN}" --body "Opt-in raw instincts from @${GITHUB_LOGIN}. Please review before merge."
```

If push fails due to permissions, instruct the user to fork `simpl-techs/simpl_knowledge`, push the branch there, and open PR from fork (same files under `team-instincts/raw/`).

### 7. Summarize

Tell the user the PR URL and that a human reviewer (and optionally an operator running `/aggregate-team-instincts` after merge) will integrate into `team-instincts/instincts.jsonl`.

## Rules

- Never auto-share without explicit user confirmation of the final row set.
- Never strip `hash` — aggregation deduplicates on it.
- One canonical file per login; overwriting previous raw file on each share is intentional.
