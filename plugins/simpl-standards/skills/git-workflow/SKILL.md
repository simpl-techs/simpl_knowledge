---
name: git-workflow
description: Our team's conventions for branches, commits, pull requests, and version bumps. ALWAYS consult before any git branch create/switch, commit, PR, or version change. Every PR bumps the version — PATCH by default, MINOR/MAJOR only with written justification. Agents must stay on the already-checked-out branch unless the user explicitly approves a new branch in the current turn.
---

# Git Workflow

## Agents — branch authority (read this first)

**HARD RULE for agents.** This section overrides the human Flow below, any plan step that says "create a branch" / `git checkout -b`, and any other skill that suggests branching.

Default: work on the branch already checked out (`git branch --show-current`). Edit files there. Do **not**:
- run `git checkout -b` / `git switch -c` / create a branch
- switch to another branch
- put "create a feature branch" (or equivalent) in a plan as something the agent will do
- push a newly created branch

If a dedicated branch would help:
1. Propose the branch name and base (e.g. `feature/<slug>` from `dev`) in chat.
2. Wait for **explicit approval in the current turn** (e.g. "ok create it", "fai il branch") before any checkout/switch/create.
3. Approving a plan, saying "implement the plan", or a plan that merely *mentions* a branch name **does not** count as branch approval.

If the user declines or does not answer, stay on the current branch and do the work there.

**Why:** working trees often hold concurrent in-progress work on the current branch. Agent-created branches pile up, confuse context, and make it impossible to follow what the user is actually doing.

What to do instead: edit files on the current branch, summarize changes, and let the user drive branch creation, PRs, and merge when they want a separate branch.

## Branches (human / team naming)

Long-lived branches:
- `main` — production. Protected.
- `dev` — integration branch for in-flight work. Cut from `main`.
- `staging` — pre-prod testing branch (used in repos with a more involved release flow). Cut from `dev`.

Short-lived work branches are always cut from `dev`, never from `main` or from another work branch.

Branch naming: `<type>/<short-slug>`. Valid prefixes:
- `feature/` — new functionality
- `bug/` — non-urgent bug fix
- `hotfix/` — urgent production fix (may branch from `main` and merge back into both `main` and `dev`)
- `chore/`, `docs/`, `refactor/`, `test/` — supporting work

Examples:
- ✅ `feature/event-batching`
- ✅ `bug/null-user-id-crash`
- ✅ `hotfix/payment-webhook-500`
- ❌ `alice-work`, `branch2`, `feat/foo` (use full `feature/` prefix)

## Flow (humans only — agents: see branch authority above)

When a **human** wants a new branch:

1. `git checkout dev && git pull`
2. `git checkout -b feature/<slug>` — do the work, commit.
3. Open PR `feature/<slug>` → `dev`. Merge when reviewed.
4. Promote `dev` onward depending on the repo:
   - Simple repos: PR `dev` → `main` directly.
   - Complex repos: PR `dev` → `staging`, validate there, then PR `staging` → `main`.
5. `hotfix/<slug>` may branch from `main` directly; after merge into `main`, also merge back into `dev` (and `staging` if it exists) to keep history aligned.

**Agents do not run steps 1–2 on their own.** Stay on the active branch unless the user explicitly approved a new branch in the current turn.

## Commits

We use Conventional Commits. Format:

```
<type>(<scope>): <imperative summary, lowercase, no period>

<optional body explaining why, wrapped at 72 chars>

<optional footer with BREAKING CHANGE:, Closes ENG-123, or Refs ENG-123>
```

Valid types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `build`, `ci`.

Examples:
- `feat(tracker): add batching for high-volume events`
- `fix(api): handle null user_id in login endpoint (ENG-557)`
- `docs(agent): update SKILL.md with new batch API`

Footer examples (Linear):
- `Closes ENG-123` — change resolves the issue
- `Refs ENG-123` — related work, issue stays open

**For agents**: when committing, NEVER add `🤖 Generated with Claude Code` or similar tags. Our commit log stays human.

## Pull requests

- Title = the commit message of the squash merge.
- Body template (auto-populated by `.github/pull_request_template.md`):
  ```
  ## What
  Brief description of the change.

  ## Why
  Link to ticket or context.

  ## How to test
  Concrete steps a reviewer can run.

  ## Agent context touched?
  - [ ] .agent/SKILL.md updated if public API changed
  - [ ] .agent/INTERNAL.md updated if conventions changed
  ```

- **Every PR bumps the version.** Reviewers do not approve a PR without a bump (see *Version bumps* below). PATCH by default; a MINOR or MAJOR bump needs its justification written under `## Why`.
- Squash merge only. No rebase-merge, no merge-commit.
- PRs under ~400 lines get reviewed same-day. Split bigger PRs.

## Agents — Linear / issue linkage

Before implementing (or at least before proposing a commit message), look for a matching Linear issue:
- Search open issues by meaning against the user's request and prompt (title, description, identifier like `ENG-123`).
- Use Linear MCP (`user-linear`) or CLI when available.

When there is a clear match:
- Include the identifier in the proposed commit message.
- Summary (when natural): `fix(scope): … (ENG-123)`
- Footer: `Closes ENG-123` if the change resolves the issue; otherwise `Refs ENG-123`
- Do not invent identifiers. If Linear is unreachable or nothing matches, proceed without a ticket reference.

When there is a clear match, **keep the issue updated with a comment** in the same turn you finish substantive work or hand off to the user. Structure it as:
- **What** — files/areas touched, resulting behavior.
- **How** — brief approach (pin, refactor, fix path, etc.).
- **Why** — root cause or rationale for the choice.
- Links (PR URL, commit SHA) only when they already exist — never invent them.

One structured comment per milestone or handoff is enough; do not spam on every micro-edit. Do not change issue status or assignee unless the user asks explicitly. If Linear is unavailable, say so in chat — do not claim you commented.

## Agents — commit/push authority

By default the agent edits files and **stops there**. Do not run `git commit` or `git push` autonomously, even for one-line fixes — the user reviews and commits themselves.

Exception: when the user says explicitly "committa", "pusha", "fai il commit", "commit this", "push it" in the current turn. A previous approval does not extend to later edits.

**Why:** working trees often hold concurrent in-progress work (untracked files, half-finished skills, edits the user is mid-review). Agent-driven commits risk bundling unrelated changes into one commit, which is hard to untangle and breaks the version-bump discipline below.

What to do instead: after editing, summarize what changed and which files, then stop. Let the user drive `git add` / `git commit` / `git push`.

## Version bumps — every PR bumps, PATCH by default

Applies to **every** simpl repo that carries a version: library and service repos (`pyproject.toml`, `package.json`) and the plugins in this marketplace (`plugin.json` + `marketplace.json`). Scheme: [SemVer](https://semver.org/) `MAJOR.MINOR.PATCH`.

### The rules

1. **Every PR bumps the version. No bump, no approval.** Docs-only, test-only, and dependency-only PRs included. The version counts what has merged, not what shipped a feature.
2. **PATCH is the default.** `0.6.1` → `0.6.2`. A bug fix, a refactor, a new helper, a new option, a new public function, a dependency update, a doc or test change, a new or reworded rule in a skill — all PATCH. If the change is "a normal PR", it is PATCH.
3. **PATCH does not roll over.** `0.6.23` → `0.6.24` is correct. A high patch number is never, by itself, a reason to bump MINOR.
4. **MINOR must be justified, in writing, in the PR.** `0.6.23` → `0.7.0` only when the change is genuinely bigger than a normal PR: a new subsystem or module family, a new integration or pipeline, a substantial restructure of the public surface, a milestone the team wants to point at. Add one sentence under `## Why` saying why this is MINOR rather than PATCH. No sentence → the reviewer asks for PATCH.
5. **MAJOR is a team decision, not a PR author's.** A breaking change to the public surface: rename or remove an exported symbol, change a contract consumers depend on. PR title carries `!`, merge commit carries a `BREAKING CHANGE:` footer. Pre-stable repos (`0.x.y`) bump MINOR for breaking changes instead; promotion to `1.0.0` is its own dedicated PR with team sign-off.
6. **When unsure, PATCH.** Under-bumping costs nothing: the version still changed, caches still invalidate, and the next PR can go MINOR once the picture is clear. Over-bumping burns version space and makes the history lie about how big changes were.

| Bump      | Example              | When                                                                                                                                                         |
| --------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **PATCH** | `0.6.23` → `0.6.24`  | **Default.** Any normal PR: fix, refactor, new function or option, deps, docs, tests, a new or reworded rule inside an existing skill.                          |
| **MINOR** | `0.6.23` → `0.7.0`   | Justified in the PR body. New subsystem, new integration, substantial public-surface restructure, a whole new skill/command/hook in a plugin. In `0.x.y`: also breaking changes. |
| **MAJOR** | `1.4.2` → `2.0.0`    | Team decision. Breaking public surface, `!` in the title, `BREAKING CHANGE:` footer. Only meaningful once the repo is `>= 1.0.0`.                             |
| **BETA `N`** | `2.0.0.36` → `2.0.0.37` | Only in a repo mid-rewrite with a fourth segment. Every PR bumps `N`; the other three are frozen until cut-over (see *Beta rewrites*). |

### How to bump

- **Poetry repos**: `poetry version patch` (or `minor` / `major`) — it rewrites `pyproject.toml` for you. Bump in the same PR as the change.
- **npm repos**: `npm version patch --no-git-tag-version`, or edit `package.json` → `version`.
- **Marketplace plugins**: edit `plugins/<name>/.claude-plugin/plugin.json` and the matching entry in `.claude-plugin/marketplace.json`. The two must match — CI checks it.
- **Two PRs bumped from the same base** (conflict on the version line): take the higher of the two and add one PATCH.

### Beta rewrites: a fourth segment

A repo in the middle of a major rewrite that is not yet fully functional carries a **fourth segment**: `MAJOR.MINOR.PATCH.N`, e.g. `simpl_outreach` at `2.0.0.36` = beta iteration 36 of the v2 rewrite.

- `N` is the beta counter. **Every PR bumps `N`** (`2.0.0.36` → `2.0.0.37`); the first three segments stay frozen. PATCH/MINOR/MAJOR levels do not apply while the fourth segment exists — there is only "one more beta".
- A four-segment version is deliberate. Do not "normalize" it to three segments, and do not bump the third segment instead of the fourth.
- When the team declares the rewrite functional, drop the fourth segment and resume normal bumps from there: `2.0.0.36` → `2.0.1` (not `2.0.0` — PEP 440 sorts `2.0.0.36` *above* `2.0.0`). That cut-over is its own PR, like promotion to `1.0.0`.

### Agents

- Bump PATCH as part of the change, in the same PR. Don't wait to be asked.
- **Never escalate to MINOR or MAJOR on your own.** If you think the change might warrant it, bump PATCH and say so in chat: "bumped `0.6.23` → `0.6.24`; this could be MINOR because <reason> — tell me if you want `0.7.0`". The human decides and writes the justification.
- Don't bump twice in one PR. If the branch already carries a bump since `main` (`git diff main -- pyproject.toml`), leave it.

### Plugins in this marketplace — bump is checked by CI

If the commit touches anything under `plugins/<plugin-name>/` (skills, commands, hooks, agents, manifests), you MUST bump in BOTH:

1. `plugins/<plugin-name>/.claude-plugin/plugin.json` — `version` field.
2. `.claude-plugin/marketplace.json` — the entry for that plugin's `version` field.

**Why this is non-negotiable**: Claude Code caches installed plugins under `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`. If the version doesn't change, `/plugin update` sees "same version" and serves the stale cache — your edit never reaches users. This has bitten us multiple times. No exceptions, even for typo fixes.

A PATCH bump invalidates that cache exactly as well as a MINOR one, so the level rules above apply unchanged: PATCH for a fix, a rewording, or a new/changed rule inside an existing skill; MINOR only for a whole new skill/command/hook or a restructure, justified in the PR. All plugins start at `0.1.0` and stay in `0.x.y` until the team declares them stable in a dedicated PR.

Pre-commit checklist when editing a plugin:
- [ ] Bumped `plugins/<name>/.claude-plugin/plugin.json` version.
- [ ] Bumped the matching entry in `.claude-plugin/marketplace.json`; the two versions match.
- [ ] PATCH, unless the PR body justifies MINOR.
- [ ] Stayed inside `0.x.y` unless explicitly promoting to stable.

## Don't

- Don't force-push to shared branches (`main`, `dev`, `staging`, release branches).
- Don't commit directly to `main`, `dev`, or `staging`; always via PR.
- Don't branch work directly off `main` (except `hotfix/`).
- Don't create or switch git branches without explicit user approval in the current turn (agents: see *Agents — branch authority* at the top — never invent branches in plans either).
- Don't invent Linear or GitHub issue ids in commit messages or PR bodies.
- Don't leave a matched Linear issue silent after substantive work — comment what/how/why, or say Linear was unreachable.
- Don't amend a commit that's already been pushed to a shared branch without flagging to reviewers.
- Don't open a PR — in any repo — without a version bump; reviewers don't approve it.
- Don't bump MINOR or MAJOR without a justification line in the PR body; when unsure, PATCH (see *Version bumps* above).
