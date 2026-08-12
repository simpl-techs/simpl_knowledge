---
name: git-workflow
description: Our team's conventions for branches, commits, and pull requests. ALWAYS consult before any git branch create/switch, commit, or PR. Agents must stay on the already-checked-out branch unless the user explicitly approves a new branch in the current turn.
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

## Plugin / skill changes — version bump is MANDATORY

If the commit touches anything under `plugins/<plugin-name>/` (skills, commands, hooks, agents, manifests), you MUST bump the version in BOTH:

1. `plugins/<plugin-name>/.claude-plugin/plugin.json` — `version` field.
2. `.claude-plugin/marketplace.json` — the entry for that plugin's `version` field.

### Versioning policy (semver, strict)

We follow [SemVer](https://semver.org/) `MAJOR.MINOR.PATCH`. **Pick the bump level by the size and impact of the change**, not by gut feel:

| Bump        | When to use                                                                                       | Examples                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **PATCH** (`0.1.0` → `0.1.1`) | Small fixes: typo, wording tweak, clarifying example, broken link, formatting, minor rule refinement. | Fix a sentence in a SKILL.md; correct a code-block language tag.                        |
| **MINOR** (`0.1.1` → `0.2.0`) | Larger changes that add or substantially restructure content: new skill, new command, new hook, new section, new rule, removed obsolete rule. | Add a `python-environment` skill; add an entire new section to `coding-standards`.      |
| **MAJOR** (`0.x.y` → `1.0.0`, or later `1.x.y` → `2.0.0`) | Breaking changes: rename or remove a skill/command, rename a public hook, change skill behavior in a way that breaks dependent repos, drop a supported flow. | Rename `git-workflow` to `git-conventions`; remove a long-standing skill consumers cite. |

If you're unsure between two levels, **bump to the higher one**. Under-bumping is the failure mode (cache stays warm, stale content); over-bumping is harmless.

### Pre-stable: stay in `0.x.y`

**All plugins start at `0.1.0` and remain in the `0.x.y` range until they're declared stable.** We are not stable yet — none of the plugins ships to a frozen public API, and we still revise structure week-to-week.

While in `0.x.y`:
- The MINOR digit (`0.1.0` → `0.2.0`) is what we use for "real" releases with new content.
- The PATCH digit covers small fixes (`0.1.0` → `0.1.1`).
- "Breaking changes" within `0.x.y` still bump MINOR — we do **not** go to `1.0.0` for them. Promotion to `1.0.0` is a deliberate, separate decision (dedicated PR, team sign-off) that declares the plugin stable.

Only after a plugin reaches `1.0.0` do MAJOR bumps become meaningful (and required for any breaking change).

**Why this is non-negotiable**: Claude Code caches installed plugins under `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`. If the version doesn't change, `/plugin update` sees "same version" and serves the stale cache — your edit never reaches users. This has bitten us multiple times. No exceptions, even for typo fixes.

Pre-commit checklist when editing a plugin:
- [ ] Picked the right bump level (PATCH / MINOR / MAJOR) per the table above.
- [ ] Stayed inside `0.x.y` unless explicitly promoting to stable.
- [ ] Bumped `plugins/<name>/.claude-plugin/plugin.json` version.
- [ ] Bumped matching entry in `.claude-plugin/marketplace.json`.
- [ ] Versions match between the two files.

## Don't

- Don't force-push to shared branches (`main`, `dev`, `staging`, release branches).
- Don't commit directly to `main`, `dev`, or `staging`; always via PR.
- Don't branch work directly off `main` (except `hotfix/`).
- Don't create or switch git branches without explicit user approval in the current turn (agents: see *Agents — branch authority* at the top — never invent branches in plans either).
- Don't invent Linear or GitHub issue ids in commit messages or PR bodies.
- Don't leave a matched Linear issue silent after substantive work — comment what/how/why, or say Linear was unreachable.
- Don't amend a commit that's already been pushed to a shared branch without flagging to reviewers.
- Don't edit a plugin without bumping its version (see section above).
