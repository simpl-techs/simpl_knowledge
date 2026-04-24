---
name: git-workflow
description: Our team's conventions for branches, commits, and pull requests. Use whenever creating branches, writing commit messages, opening PRs, or doing any git operation on behalf of the user. ALWAYS consult this skill before running `git commit` or `gh pr create`, even for small changes, so commit format and PR body match our standards.
---

# Git Workflow

## Branches

- Branch off `main`, never off a feature branch (merge conflicts multiply otherwise).
- Branch naming: `<type>/<short-slug>` where type is one of `feat`, `fix`, `chore`, `docs`, `refactor`, `test`.
  - ✅ `feat/event-batching`
  - ✅ `fix/null-user-id-crash`
  - ❌ `alice-work`, `branch2`

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

- Don't force-push to shared branches (`main`, release branches).
- Don't commit directly to `main`; always via PR.
- Don't amend a commit that's already been pushed to a shared branch without flagging to reviewers.
