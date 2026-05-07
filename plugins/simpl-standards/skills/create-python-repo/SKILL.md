---
name: create-python-repo
description: >-
  Creates new Python repositories at simpl using the Cookiecutter template
  simpl-techs/simpl_scaffold. Use when scaffolding a new Python project,
  creating a new GitHub repository for a Python service or library, or when
  the user mentions simpl_scaffold, cookiecutter, new Python repo,
  new Simpl Python service or library, simpl_ repo naming, or standard Python
  tooling (Conda, Poetry, pytest, Ruff).
---

# create-python-repo

> **Distributed via simpl_knowledge. Propose edits with a PR on `simpl-techs/simpl_knowledge`.**

## What this covers

Bootstrap a **new** Python repo from [`simpl-techs/simpl_scaffold`](https://github.com/simpl-techs/simpl_scaffold).

**Not the same thing** as [`repo-context-bootstrap`](../repo-context-bootstrap/SKILL.md): that skill applies `library-repo-template/` to an **existing** git repo (`.agent/`, hooks, marketplace sync drift). Cookiecutter scaffolding is for a **fresh** codebase layout from `simpl_scaffold`.

After the generated project exists, if the repo must join `simpl_knowledge` workflows (`.agent/`, sync PRs), use `repo-context-bootstrap` only **after explicit user confirmation**.

## Before running Cookiecutter

Confirm with the human (or read from task context):

### Repository naming (`project_slug` / GitHub name)

Org repos must stay consistent with existing ones (`simpl_api`, `simpl_core`, `simpl_tracker`, …):

- **`project_slug` must start with `simpl_`** — same string as the GitHub repository name under `simpl-techs`.
- Keep it **short and plain**: one clear idea, **`snake_case`** throughout (same convention as sibling repos).
- It should **readably describe what the repo does**; avoid jargon stacks, novelty spellings, or names that read like temporary experiments.
- If a candidate feels **long**, **clever-but-opaque**, or **hard to type**, pick a simpler one and align `project_slug`, Conda env name, and imports with it.

Ask once if someone proposes something off-pattern.

- **`project_name`**, **`project_short_description`**, **`author_name`**, **`author_email`** as they want them in generated files.
- **`python_version`**: default template is `3.12`; do not drift without coordinated bump (see [`python-environment`](../python-environment/SKILL.md)).
- **`use_docker`**: yes/no per product needs.
- **GitHub**: org or user account (`simpl-techs` vs personal), visibility (private/public).

Prerequisite on the machine: **Cookiecutter** installed (README uses `pip install cookiecutter`; use whatever installs into the interpreter the human prefers for toolchain-only tools).

## 1. Generate the project

```bash
cookiecutter https://github.com/simpl-techs/simpl_scaffold
```

Answer the prompts (`project_name`, `project_slug`, `package_name`, description, authors, `python_version`, `use_docker`, etc.). If generating from a checkout of `simpl_scaffold` locally, `cookiecutter .` from that repo root is equivalent.

Cookiecutter emits a directory matching the scaffold output layout (typically `src/<package_name>/`, `tests/`, `environment.yml`, `pyproject.toml`, CI under `.github/workflows/`, Dockerfile when enabled, `.gitignore`, license, README).

## 2. Create the GitHub repository

1. GitHub UI: https://github.com/new
2. Repository name **`project_slug`** (same as scaffold).
3. **Do not** initialize with README, `.gitignore`, or license — the generated project already includes them.

Alternatively `gh repo create` is fine if flags match those constraints (human runs auth).

## 3. Connect Git and push

From inside the generated project root:

```bash
git branch -M main
git remote add origin <git-url-from-github>
git push -u origin main
```

Never invent URLs; human provides `origin` URL or confirms `gh`/org conventions.

## 4. Local development setup

Follow [`python-environment`](../python-environment/SKILL.md): always Conda env + Poetry for the repo.

```bash
conda env create -f environment.yml
conda activate <env_name_matching_scaffold_README_or_environment_yml>
poetry install
```

Environment variables: copy the scaffold's env template to `.env` using the filename and wording in the generated **README** (template docs may vary between `env.example` and `.env.example`).

Validate:

```bash
poetry run pytest
poetry run ruff check .
poetry run ruff format --check .
```

Use `poetry add` / `poetry remove` / `poetry update` for dependencies — never `pip install` for project deps. New **runtime** dependencies require human approval (see [`coding-standards`](../coding-standards/SKILL.md)).

## Rules for agents

- Respect **repository naming** above for `project_slug` and GitHub repo name; do **not** create `simpl-techs/<name>` repos that skip the `simpl_` prefix or drift from sibling naming norms without explicit human approval.
- Do **not** replace `simpl_scaffold` with a hand-written tree without human sign-off.
- Do **not** commit secrets into `.env` or code.
- Align **branch policy** (`dev`/`main`, etc.) with [`git-workflow`](../git-workflow/SKILL.md) after scaffold; `simpl_scaffold` README may default push to `main` first — team flow still applies once the repo is live.
- If the scaffold README and generated files disagree on paths (example env filenames), trust **checked-in generated files**, not memory.

## What this skill does NOT do

- Provision cloud, CI secrets, Fly.io, Postgres, domains, or org GitHub protections.
- Register the project in `catalog.json` / `*-context` — that is handled by library onboarding and marketplace sync pipelines after the repo exists (see [`simpl_knowledge_system`](../simpl_knowledge_system/SKILL.md)).

## See also

- [`python-environment`](../python-environment/SKILL.md)
- [`git-workflow`](../git-workflow/SKILL.md)
- [`repo-context-bootstrap`](../repo-context-bootstrap/SKILL.md)
- [`testing-policy`](../testing-policy/SKILL.md)
