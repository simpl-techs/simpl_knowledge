---
name: git-workflow
description: Our team's conventions for branches, commits, pull requests, and version bumps. ALWAYS consult before any git branch create/switch, commit, PR, or version change. Every PR bumps the version — PATCH by default, MINOR/MAJOR only with written justification. Agents must stay on the already-checked-out branch unless the user explicitly approves a new branch in the current turn. Also covers contributors (people outside engineering, team `contributors`), who always go through a PR, and the green/yellow/red risk lanes on their PRs. Also covers what an agent does after a simpl_api merge (Google deploys it; the agent only watches and never starts or retries a deploy).
---

# Git workflow

## Agents: branches (HARD RULE; overrides any plan, flow or skill that says "create a branch")

- Work on the checked-out branch (`git branch --show-current`). Do not create a branch by any means (`checkout -b`, `switch -c`, `git branch <name>`), switch branches, push a new branch, or list "create a branch" as an agent step in a plan.
- A branch would help? Propose name and base (`dev` when the repo has one, else `main`; the user may prefer `main`) and wait for an explicit yes in the current turn ("ok create it", "fai il branch"). Approving a plan, "implement the plan", or a plan that names a branch is not a yes. No or no answer: stay on the current branch and do the work there.
- The user drives branch creation, PRs and merges. Why: the working tree often holds their concurrent in-progress work; agent branches pile up, confuse context and hide what the user is doing.

## Agents: start from the latest code (every repo, before any change)

- Before the first edit in a repo, and before reading one to answer how it works, run `git fetch origin` and check `git status -sb` (it shows `behind N`). Local checkouts go stale fast: on 2026-10-19 a `simpl_knowledge` checkout was 189 commits behind `main`.
- Clean tree on the base or your own work branch: `git pull --ff-only` (base) or `git pull --rebase` (your branch) before editing.
- Tree with changes you did not make, or a branch that is not yours (another session's work): do not pull, stash or switch over it. Work in a new worktree cut from the fresh base, `git worktree add --detach <path> origin/<base>`, and say so.
- Repos you only read for context (a library, the API behind a page) need the same fetch, or you describe code that is no longer there.
- Before a commit, push or PR: fetch again and rebase on the base if it moved.

## Agents: commit and push

- Default: edit files, summarize what changed and which files, stop. No `git add`/`git commit`/`git push`, not even for one-line fixes; the user reviews and commits.
- Only when the user says so in the current turn ("committa", "pusha", "fai il commit", "commit this", "push it"). An earlier approval does not cover later edits.
- Why: the working tree often holds concurrent, unrelated work (untracked files, half-finished skills, edits under review); an agent commit bundles it, is hard to untangle and breaks the version-bump discipline.
- Commit messages may end with a `Co-Authored-By: Claude …` trailer. No other generated-by lines (e.g. "🤖 Generated with Claude Code").
- Never invent Linear or GitHub issue ids in commits or PR bodies.

## Branches and flow

- `main`: production, protected. `dev`: integration, cut from `main`. `staging`: pre-prod in repos with a longer release flow, cut from `dev`.
- Work branches: `<type>/<short-slug>`, with the Linear id first in the slug when the work has an issue (`bug/eng-855-discarded-draft`), so Linear links the branch. Base: `dev` by default when the repo has one, else `main`; some developers branch from `main` directly, so agents confirm the base with the user. Never from another work branch. Types: `feature/`, `bug/` (non-urgent fix), `hotfix/` (urgent production fix), `chore/`, `docs/`, `refactor/`, `test/`. Not `feat/foo` (full `feature/`), `alice-work`, `branch2`.
- Flow (humans only; an agent may create the branch after approval, never open, merge or promote PRs on its own): `git checkout dev && git pull` (or `main`, see above), `git checkout -b feature/<slug>`, PR to the base, merge after review, then promote `dev` → `main` (simple repos) or `dev` → `staging`, validate, `staging` → `main`.
- `hotfix/` may branch from `main`; after merging into `main`, merge back into `dev` (and `staging` if it exists) to keep history aligned.
- No force-push to shared branches (`main`, `dev`, `staging`, release branches). No direct commits to them: always a PR. Only exception: `simpl_knowledge`, where changes and library syncs go straight to `main` (team decision 2026-09-24), after the plugin bump, `scripts/ci/validate-agent-infra.sh` and `node --test tests/*.test.js`. Do not amend a commit already pushed to a shared branch without flagging it to reviewers.

## Commits (Conventional Commits)

```
<type>(<scope>): <imperative summary, lowercase, no period>

<optional body: why, wrapped at 72 chars>

<optional footer: BREAKING CHANGE: … | Closes ENG-123 | Refs ENG-123>
```

Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `build`, `ci`. E.g. `feat(tracker): add batching for high-volume events`, `fix(api): handle null user_id in login endpoint (ENG-557)`. Footer `Closes` = the change resolves the issue; `Refs` = related, the issue stays open.

## Pull requests

- Title = the squash-merge commit message. Squash merge only: no rebase-merge, no merge commit.
- Body from `.github/pull_request_template.md`: What · Why (ticket or context) · How to test (steps a reviewer can run) · Agent context touched? (`.agent/SKILL.md` if the public API changed, `.agent/INTERNAL.md` if conventions changed).
- Under ~400 lines gets same-day review; split bigger PRs.
- Every PR bumps the version (below); reviewers do not approve without it.
- Agents: after a merge you ran (only when the user asked for it) succeeds, delete the PR's branches. Remote: GitHub deletes it on merge ("Automatically delete head branches" is on in every active repo); if it is still there, `git push origin --delete <head>`. Tracking ref: `git fetch --prune`. Local: `git branch -D <head>`, only if the branch is not checked out (here or in another worktree) and its tip equals the PR head (`gh pr view <n> --json headRefOid`); a checked-out branch stays, say so. Never delete `main`, `dev`, `staging` or release branches (e.g. the head of a `dev` → `main` PR). Do not use `gh pr merge --delete-branch`: it checks out the base branch when you are on the PR branch.

## Agents: simpl_api deploys itself

Every push to simpl_api `main` starts its Cloud Build trigger, which builds the image and deploys the Cloud Run service `simpl-api`. After a merge, Google does the release. The agent only watches it.

- Never start, retry or re-run a simpl-api deploy (`gcloud builds triggers run`, `gcloud builds submit`, `gcloud run deploy`, a build retry). Never change the service, its traffic or its revisions.
- Watch the check run `rmgpgab-simpl-api-…` on the merge commit (`gh api repos/simpl-techs/simpl_api/commits/<sha>/check-runs`): about 15 minutes. Then confirm the serving revision runs the new version.
- If the check fails, tell the user, with the build's error line. Do not try again on your own.

Why: on 2026-11-11 agents retried simpl-api deploys on top of the automatic ones. The releases were already failing because the project's Cloud Run CPU quota in europe-west4 was full, and every extra deploy only added another failed revision (Raffaele, 2026-11-11).

## Contributors and risk lanes (people outside engineering)

Raffaele's decision, 2026-11-06: people outside engineering may fix bugs and add small features with their own agent, never with a way to break production.

- **Who.** GitHub team `contributors`: Luca (`LucArryn`) and Davide (`dado-ops`); Sara when she gets access. Team `core` is the six developers (Raffaele, Flavio, Iacopo, Nicolò, Michele, Jackie); they decide themselves when to self-approve.
- **Always a PR.** Every non-archived simpl-techs repository except `simpl_knowledge` requires a PR with one approval from team `core` on `main` (rulesets `main-via-pr`, or `no-direct-commit` on simpl_api, simpl_core, simpl_desk, simpl_agent_sandbox). Core members bypass; anyone else, a new org member included, is limited by default. Never add a contributor to a bypass list. A new repository gets the `main-via-pr` ruleset.
- **Lanes** (simpl_sales and simpl_dashboard today): the `simpl-lanes` app gives each contributor PR a colour, as a comment and the status `simpl/corsia`. Path rules set the floor, a model review may only raise it (rules and README: `simpl-techs/simpl_devops`).
  - **Green** (`verde`): page look, copy, styles and images, tests, docs. Merges on its own once the repository's `checks` passed on the PR's last commit and the PR is out of draft; the Vercel deploy hook then publishes it.
  - **Yellow** (`giallo`): server code, logic and data; a page change that adds or changes a call that saves, deletes or sends; a skipped or deleted test; more than 400 lines or 20 files; anything unclassified. A core developer approves it.
  - **Red** (`rosso`): database and migrations, customers' money (billing, Stripe, call prices, invoices), sends to leads or customers, login, roles and «view as», release and configuration (`.github`, dependencies, build and test config). Core does it, or pairs on it.
  - Other repositories have no lanes yet: a contributor's PR there always waits for a core approval.
- **An agent working for a contributor:** works on a branch and opens a PR, marked ready (not draft) only when done; keeps a PR small and in one lane (a page change apart from the server change it needs); reads the `simpl-lanes` comment and tells its person the colour and what happens next; never changes `.github`, tests or config to get a lower colour or a passing check, and never asks for a bypass. A red change is said as red, and a core developer is involved before writing it.
- **Developers:** approve a contributor's yellow or red PR when GitHub asks team `core`. Their own PRs are unchanged: `checks` is skipped for them and `lanes` stops in seconds.

## Agents: Linear

- Before implementing, or at least before proposing a commit message, search open Linear issues by meaning against the user's request (title, description, `ENG-123`) with the Linear MCP (`user-linear`) or CLI.
- Clear match: the id goes everywhere the work is named, so the issue tracks it: the branch (`<type>/eng-123-<slug>`), every commit (footer `Closes ENG-123` if it resolves the issue, else `Refs ENG-123`), the PR title (`fix(scope): … (ENG-123)`, which becomes the squash commit) and the PR body (`Closes ENG-123`). In the same turn you finish substantive work or hand off, comment on the issue once per milestone: **What** (files/areas, resulting behavior), **How** (approach), **Why** (root cause, rationale), links (PR, SHA) only if they exist.
- After the merge: read the issue. Linear's GitHub integration links a branch, commit or PR that names the id and moves the issue to Done when a `Closes` PR merges; whatever it did not link (the PR, the merge commit), attach with the issue's links. Once the work is merged and live, with its follow-up steps done (migrations, skill syncs), set the issue to Done yourself if it is not already. Not before, not for work only partly done, and never change the assignee unless asked.
- No match: before going further, ask once per task whether to open an issue, proposing title and team. Create it only on an explicit yes in the current turn, then treat it as the match. No or no answer: proceed without a ticket and do not ask again.
- Linear unreachable: proceed without a ticket reference and say so in chat; never claim you commented.

## Version bumps: every PR, PATCH by default

Applies to every versioned simpl repo (`pyproject.toml`, `package.json`) and to marketplace plugins (`plugin.json` + `marketplace.json`). SemVer `MAJOR.MINOR.PATCH`.

1. **Every PR bumps**, in the same PR as the change, docs-, test- and dependency-only included. No bump, no approval. The version counts merges, not features.
2. **PATCH by default** (`0.6.1` → `0.6.2`): fix, refactor, new helper, option or public function, dependency update, docs, tests, a new or reworded rule inside an existing skill.
3. **PATCH does not roll over**: `0.6.23` → `0.6.24`. A high patch number is never a reason for MINOR.
4. **MINOR needs one sentence under `## Why`** in the PR; without it the reviewer asks for PATCH. Only for changes bigger than a normal PR: a new subsystem or module family, a new integration or pipeline, a substantial public-surface restructure, a whole new skill, command or hook in a plugin, a milestone the team wants to mark. In `0.x.y`, breaking changes are MINOR too.
5. **MAJOR is a team decision**, meaningful only from `1.0.0`, justified under `## Why` like MINOR: a breaking public surface (renamed or removed export, changed contract), `!` in the PR title, `BREAKING CHANGE:` footer on the merge commit. Promotion to `1.0.0` is its own PR with team sign-off.
6. **Unsure → PATCH.** Under-bumping costs nothing (the version still changes, caches still invalidate, the next PR can go MINOR); over-bumping burns version space and makes history lie about how big changes were.

How: Poetry `poetry version patch|minor|major` (rewrites `pyproject.toml`) · npm `npm version patch --no-git-tag-version` or edit `version` · plugins: see below. Two PRs bumped from the same base: take the higher and add one PATCH.

**Beta rewrites** (`MAJOR.MINOR.PATCH.N`, e.g. `simpl_outreach` `2.0.0.36` = beta 36 of the v2 rewrite): a repo mid-rewrite, not yet functional. Every PR bumps `N` only; the first three segments are frozen and the PATCH/MINOR/MAJOR levels do not apply. The fourth segment is deliberate: do not normalize it away or bump the third instead. Cut-over, when the team declares the rewrite functional, is its own PR: drop `N` and go to `2.0.1`, not `2.0.0` (PEP 440 sorts `2.0.0.36` above `2.0.0`).

**Agents:**
- Bump PATCH in the same change without being asked. Not twice: if the branch already bumped since `main` (`git diff main -- pyproject.toml`), leave it.
- Never choose MINOR or MAJOR yourself. If the change might warrant one, bump PATCH and say so in chat: "bumped `0.6.23` → `0.6.24`; this could be MINOR because <reason>, tell me if you want `0.7.0`". The human decides and writes the justification.

**Plugins in this marketplace (everyone; CI checks the bump and that both versions match):** any change under `plugins/<name>/` (skills, commands, hooks, agents, manifests) MUST bump both `plugins/<name>/.claude-plugin/plugin.json` and its entry in `.claude-plugin/marketplace.json`. No exceptions, typo fixes included. Why: Claude Code caches plugins under `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`; with the same version `/plugin update` serves the stale copy and the edit never reaches anyone (this has bitten us several times). Plugins start at `0.1.0` and stay in `0.x.y` until a dedicated PR declares them stable.
