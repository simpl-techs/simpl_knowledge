## What

<!-- Brief description of the change. -->

## Why

<!-- Link to ticket, discussion, or the context that motivated this. -->

## How to test

<!-- Concrete steps a reviewer can follow. -->

## Agent context touched?

Before merging, check whichever applies:

- [ ] `.agent/SKILL.md` updated — public API or integration patterns changed
- [ ] `.agent/INTERNAL.md` updated — internal conventions or invariants changed
- [ ] Neither — this change does not affect anything consumers of this library need to know

If you used `/update-skill` during the session, mention it here so reviewers know the agent doc diff is intentional.

## Checklist

- [ ] Version bumped in `pyproject.toml` / `package.json` — PATCH by default; if MINOR or MAJOR, the reason is written under **Why** (no bump → not approved)
- [ ] Tests added/updated
- [ ] `make check` passes locally
- [ ] No new runtime dependencies (or, if yes, justified in the PR description)
- [ ] Deploys to Google Cloud? Compute and LLM costs are recorded through simpl_tracker (`track_instance_lifetime` / `@track_compute`, request receipts), and a cost that cannot be recorded is reported with `report_tracking_gap`, never raised
- [ ] Breaking change? If yes, note in the PR title with `!`, add a `BREAKING CHANGE:` footer to the merge commit, and bump MAJOR (MINOR while the repo is still `0.x.y`)
