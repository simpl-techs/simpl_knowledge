---
name: git-workflow
description: Our team's conventions for branches, commits, and pull requests. Use whenever creating branches, writing commit messages, opening PRs, or doing any git operation on behalf of the user. ALWAYS consult this skill before running `git commit` or `gh pr create`, even for small changes, so commit format and PR body match our standards.
---

# Git Workflow

## Branches

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

## Flow

1. `git checkout dev && git pull`
2. `git checkout -b feature/<slug>` — do the work, commit.
3. Open PR `feature/<slug>` → `dev`. Merge when reviewed.
4. Promote `dev` onward depending on the repo:
   - Simple repos: PR `dev` → `main` directly.
   - Complex repos: PR `dev` → `staging`, validate there, then PR `staging` → `main`.
5. `hotfix/<slug>` may branch from `main` directly; after merge into `main`, also merge back into `dev` (and `staging` if it exists) to keep history aligned.

## Commits

We use Conventional Commits. Format:

```
<type>(<scope>): <imperative summary, lowercase, no period>

<optional body explaining why, wrapped at 72 chars>

<optional footer with BREAKING CHANGE: or Closes #123>
```

Valid types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `build`, `ci`.

Examples:
- `feat(tracker): add batching for high-volume events`
- `fix(api): handle null user_id in login endpoint`
- `docs(agent): update SKILL.md with new batch API`

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

## Don't

- Don't force-push to shared branches (`main`, `dev`, `staging`, release branches).
- Don't commit directly to `main`, `dev`, or `staging`; always via PR.
- Don't branch work directly off `main` (except `hotfix/`).
- Don't amend a commit that's already been pushed to a shared branch without flagging to reviewers.
