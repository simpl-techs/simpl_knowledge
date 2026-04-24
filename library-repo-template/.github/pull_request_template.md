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

- [ ] Tests added/updated
- [ ] `make check` passes locally
- [ ] No new runtime dependencies (or, if yes, justified in the PR description)
- [ ] Breaking change? If yes, note in the PR title with `!` and add a `BREAKING CHANGE:` footer to the merge commit
