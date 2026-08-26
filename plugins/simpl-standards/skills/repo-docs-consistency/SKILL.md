---
name: repo-docs-consistency
description: Standard that mandates every simpl repo's docs (README, agent docs, env-var documentation) stay aligned with the patterns and writing rules defined in simpl_knowledge. ALWAYS consult this skill before creating/editing a repo's `README.md`, `.agent/SKILL.md`, `.agent/INTERNAL.md`, `CLAUDE.md`, or any `docs/` file, and before adding/renaming environment variables. Use when bootstrapping a new repo, when reviewing PRs that touch documentation, or when the user asks "where should this go" / "is this README ok".
---

# Repo Docs & Env-Var Consistency

> **Auto-distributed via simpl_knowledge. Propose edits with a PR on `simpl-techs/simpl_knowledge`.**

## The rule

Every simpl repo's documentation — **both human-facing and agent-facing** — and every environment-variable declaration must follow the patterns, layouts, and writing rules defined in `simpl_knowledge`. simpl_knowledge is the source of truth; individual repos do not invent their own structure.

If a repo deviates from the template, either:
1. Bring the repo back in line with simpl_knowledge, **or**
2. Open a PR on `simpl-techs/simpl_knowledge` to update the template — and only after it's merged, propagate the new pattern to repos.

Never let a repo drift unilaterally. One-off doc styles fragment the team's mental model and break the agent context that ships through the marketplace.

## Sources of truth (use these as templates)

When creating or updating docs in a repo, copy the structure from these files in `simpl_knowledge`:

| Concern                                  | Template / source of truth                                              |
| ---------------------------------------- | ----------------------------------------------------------------------- |
| Repo `README.md`                         | `library-repo-template/` (also: the README example in `python-environment` skill) |
| `CLAUDE.md` (per-repo agent entry point) | `library-repo-template/CLAUDE.md`                                       |
| `.agent/SKILL.md` (consumer-facing)      | `library-repo-template/.agent/SKILL.md`                                 |
| `.agent/INTERNAL.md` (in-repo work)      | `library-repo-template/.agent/INTERNAL.md`                              |
| SKILL.md writing rules (frontmatter, body sections) | `docs/agent/SKILL_AUTHORING.md`                              |
| Human-facing docs style (architecture, FAQ, troubleshooting, quickstart) | `docs/human/*.md` in simpl_knowledge |
| Python env / toolchain docs              | `simpl-standards` → `python-environment` skill                          |
| Coding conventions referenced from docs  | `simpl-standards` → `coding-standards` skill                            |
| Git/PR/commit conventions in docs        | `simpl-standards` → `git-workflow` skill                                |
| Secrets / Doppler / `.env.example`       | `simpl-standards` → `doppler` skill                                     |

If the repo is a Python library/service, it should look like `library-repo-template/` after cloning (use the `repo-context-bootstrap` skill to check drift).

## What "in line" means in practice

### 1. Same section structure

A repo's `README.md` must have, in this order, sections equivalent to those in the template:
- Title + one-sentence purpose
- Installation (Prerequisites → Setup numbered steps)
- Development Workflow (Activate Environment, Running Tests)
- Linting and Formatting
- Docker (if applicable)
- License
- Environment Variables
- Docs (pointers to deeper docs in `docs/`)

Do not invent new top-level sections without a corresponding update to the template.

### 2. Same writing style

The writing rules from `simpl_knowledge` apply to every doc in every repo:

- Imperative, concise English. No marketing tone, no filler.
- Examples are realistic and runnable, not pseudo-code.
- "Don't" rules are past-tense and specific ("we had an outage on [date]"), not abstract warnings.
- "What this library does NOT do" sections are mandatory in `.agent/SKILL.md` to prevent misapplication.
- Code blocks are fenced with the right language tag (`bash`, `python`, etc.).
- No emojis unless the surrounding doc already uses them.
- Links to other simpl knowledge use the skill name (e.g. "see `git-workflow` skill"), not deep URLs.

When unsure, mirror the tone of `library-repo-template/.agent/SKILL.md` and `library-repo-template/.agent/INTERNAL.md`.

### 3. Frontmatter rules for SKILL files

Every `.agent/SKILL.md` and `.agent/INTERNAL.md` must follow the rules in `docs/agent/SKILL_AUTHORING.md`:
- `description` ≥ 40 chars, names the library explicitly, lists *when* to load and paraphrases users say.
- Optional `cursor_globs` only for integration skills.
- Body sections in this order: identity → install → 90% example → strict rules → pitfalls → testing → "does NOT do" → pointers.
- Body ≤ 400 lines; spill detail into `.agent/references/`.

### 4. Same env-var conventions

Environment variables across simpl repos must use the same patterns:

- **Naming**: `SCREAMING_SNAKE_CASE`. Prefix with the service/scope when there's any chance of collision (e.g. `SIMPL_SALES_BASE_URL`, not just `BASE_URL`).
- **Documentation**: every env var the repo reads must appear in the README's `## Environment Variables` section with:
  - the variable name,
  - one line explaining what it does,
  - whether it's required or optional,
  - the behavior when unset (if optional),
  - an example value when non-obvious (never a real secret).
- **Example file**: `.env.example` is minimal — `DOPPLER_TOKEN` (plus comments pointing at the README catalog). Shared secrets live in Doppler, not in a fill-in-the-blanks `.env`. See `doppler`.
- **PR that adds an env var**: the PR must list for the maintainer (Raff / Iacopo / Flavio): name, purpose, required/optional, configs (`dev` and whether `stg`/`prd`). No secret values in the PR. Order: code → README / PR note → maintainer writes Doppler → publish (Vercel sync / Cloud Run revision / `prefect deploy`) → the author deletes those keys from local `.env`.
- **No duplication**: if multiple services share a var (e.g. a base URL), the canonical name is set once and repos reuse it. Don't fork the name (`SIMPL_SALES_URL` vs `SALES_BASE_URL`) — propose a rename in simpl_knowledge first.

Example (matching the canonical README pattern):

```markdown
## Environment Variables

- `SIMPL_SALES_BASE_URL` — Base URL for simpl_sales (e.g. `https://sales.thesimplplatform.io`). Required for GDPR opt-out links in outreach emails. If unset, emails are sent without the opt-out footer.
```

### 5. Human docs and agent docs cover the same facts

Human-facing docs (`docs/`, `README.md`) and agent-facing docs (`.agent/SKILL.md`, `.agent/INTERNAL.md`, `CLAUDE.md`) must not contradict each other. If a fact (env var name, install step, public API) changes, **both** sets of docs are updated in the same PR. Out-of-sync docs are treated as a bug.

The split is by audience, not by content:
- **Humans** want narrative, screenshots, deeper rationale → `docs/human/` and the long sections of `README.md`.
- **Agents** want short, scannable, trigger-tagged docs → `.agent/SKILL.md` and `.agent/INTERNAL.md`.

Same truth, different framing.

## Rules for agents

- **Before editing any doc in a repo**, open the matching template in `simpl_knowledge` and mirror its structure. Don't free-style.
- **When adding or renaming an env var**, update in this order: code → README `## Environment Variables` + PR maintainer block → `.env.example` stays `DOPPLER_TOKEN` unless the new key is a documented local-only exception → any `.agent/*.md` that mentions it → search the rest of the repo for stale references. Do not mark the PR done without the maintainer block (`doppler`).
- **When you spot drift** (a section missing, an inconsistent name, agent docs out of sync with human docs), surface it to the human and offer to fix it in a `chore/` or `docs/` PR. Don't silently "fix" unrelated docs in a feature PR.
- **When the template itself is wrong or incomplete**, propose the change in `simpl-techs/simpl_knowledge` first. Don't fork the convention in a downstream repo.
- **Never** invent a new doc layout, section order, or env-var prefix without checking simpl_knowledge first.

## Quick checklist before merging a doc-touching PR

- [ ] README sections match the template order.
- [ ] All env vars the code reads are documented in `README.md`. `.env.example` is `DOPPLER_TOKEN` (not a dump of every secret). A new env var has a maintainer Doppler block in the PR.
- [ ] Env-var names are `SCREAMING_SNAKE_CASE` and prefixed where needed.
- [ ] `.agent/SKILL.md` and `.agent/INTERNAL.md` (if present) follow the frontmatter + body rules in `SKILL_AUTHORING.md`.
- [ ] Human-facing and agent-facing docs agree on every concrete fact (env vars, install steps, public API).
- [ ] No new top-level structure invented without a corresponding simpl_knowledge update.

## When in doubt

Ask the human, then propose the pattern upstream in `simpl_knowledge`. Consistency across repos is more valuable than any single local optimization.
