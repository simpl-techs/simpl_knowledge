---
name: doppler
description: Org-wide Doppler secrets at simpl — local DOPPLER_TOKEN + doppler run, maintainer handoff for new env vars, Cloud Run GCP secrets, Vercel Sensitive sync, Prefect token blocks. ALWAYS consult before adding environment variables, writing .env.example, telling a developer how to run locally, or deploying a service that needs secrets. Use when the user says "env var", "Doppler", "secret", ".env", "doppler login", "Cloud Run env", or "how do I get the API key".
---

# Doppler (org secrets)

> **Auto-distributed via simpl_knowledge. Propose edits with a PR on `simpl-techs/simpl_knowledge`.**

One Doppler project per main repo. Developers never open the dashboard. Shared keys come from Doppler; a new key may live in a gitignored `.env` only until a maintainer writes it in Doppler.

Generic helpers: `scripts/doppler/` in a `simpl_knowledge` clone (not `workspace/scripts/`).

## Install (local)

1. Install the [Doppler CLI](https://docs.doppler.com/docs/install-cli).
2. Ask **Raff, Iacopo, or Flavio** for a **read-only service token** for **this repo's Doppler project**, config **`dev`**. One token = one project. Never a `prd` token.
3. Put it in gitignored `.env` as `DOPPLER_TOKEN`, or pass the file to `scripts/doppler/setup-dev.sh`.
4. Run with `doppler run --config dev -- <command>`. Checked-in `doppler.yaml` points at `prd` (images/admin); local always forces `--config dev`.

Do **not** tell anyone to run `doppler login`. Workplace login is only those three maintainers.

## 90% path

```bash
# .env contains only DOPPLER_TOKEN (keys already in Doppler)
doppler run --config dev -- poetry run pytest
doppler run --config dev -- npm run dev
```

**New key the team does not have in Doppler yet** (devs have no dashboard):

1. Add it to local `.env` (gitignored) so work can continue.
2. In the PR, list for the maintainer: name, purpose, required/optional, configs (`dev` and whether `stg`/`prd`). **No secret values in the PR.**
3. Maintainer writes the key in Doppler, then publishes (Vercel sync / new Cloud Run revision / `prefect deploy`).
4. Dev **deletes** that key from `.env`. Left behind: `DOPPLER_TOKEN` + `doppler run`.

A PR that introduces an env var is **not done** without that maintainer block.

## Projects and configs

Projects: `simpl_api`, `simpl_growth`, `simpl_ops`, `simpl_google_extension`, `simpl_flow`, `simpl_outreach`, `simpl_sales`, `simpl_dashboard`, `simpl_scraping`.

Configs on each: `dev`, `dev_personal`, `stg`, `prd`.

## Runtime

**Vercel** (`simpl_sales`, `simpl_dashboard`): Doppler → Vercel integration, config `prd` → Production, variables **Sensitive**. That is enough. Do not mount GCP secrets. Do not sync Preview (free-plan sync slots). Redeploy after the first sync.

**Cloud Run**: container env is only `DOPPLER_TOKEN` (CLI contract). GCP Secret Manager is **per service** — never a generic secret named `DOPPLER_TOKEN`:

| Service | GCP secret |
|---|---|
| API | `SIMPL_API_DOPPLER_TOKEN` |
| Growth | `SIMPL_GROWTH_DOPPLER_TOKEN` |
| Ops | `SIMPL_OPS_DOPPLER_TOKEN` |
| Proxy | `SIMPL_PROXY_DOPPLER_TOKEN` |

Deploy: `--clear-env-vars --set-secrets DOPPLER_TOKEN=<that-secret>:latest`. Image entrypoint is `doppler run` (see `library-repo-template/scripts/doppler-entrypoint.sh` for **new** services). Updating a value in Doppler does **not** reach Cloud Run until a new revision / redeploy.

**Prefect**: one Secret block per token (`doppler-token-flow`, `doppler-token-outreach`, `doppler-token-ops`). Everything else lives in Doppler.

## Maintainer scripts

From a `simpl_knowledge` clone, after workplace `doppler login` (maintainers only):

| Script | Job |
|---|---|
| `scripts/doppler/setup-dev.sh` | Dev: scope a `dev` token to the current directory |
| `scripts/doppler/create-tokens.sh` | Create read-only tokens from `projects.txt` / `prd-runtime.txt` |
| `scripts/doppler/set-secret.sh KEY` | One key onto every project in `key-targets.txt` |
| `scripts/doppler/gcp-secret.sh` | Secret Manager + IAM; `SERVICE`, `SECRET_NAME`, `TOKEN_FILE` required |
| `scripts/doppler/prefect-blocks.sh` | Prefect Secret blocks from `*-prd` token files |
| `scripts/doppler/mirror-prd-to-dev.sh` | Copy `prd` → `dev` (keeps an existing `OPENAI_API_KEY` on `dev`) |

Use `set-secret.sh`, not a one-off script per vendor key.

## Rules for agents

- Open this skill before adding an env var, changing `.env.example`, or instructing how to run a service.
- Local run: `doppler run --config dev -- …`. Do not invent a second secrets runtime.
- `.env.example` is `DOPPLER_TOKEN` (and comments pointing at the README catalog). Do not dump every secret name as if developers fill them by hand.
- README still catalogs every var the code reads (see `repo-docs-consistency`). The catalog is documentation; Doppler is the store.
- Never print tokens. Never commit `.env`. Never put secret values in a PR or commit.
- Never say `doppler login` to a developer. Say: ask Raff / Iacopo / Flavio for the project's `dev` token.
- Never give a developer a `prd` token.
- Never reuse GCP secret `DOPPLER_TOKEN`. Use the per-service names above.
- Do not tell developers to open dashboard.doppler.com.

## Pitfalls

- `doppler.yaml` in git says `prd`. Forgetting `--config dev` locally fails a `dev`-only token or points at production.
- Cloud Run still serving old values: Doppler change without a new revision.
- Growth (or any service) mounted the wrong GCP secret: each service has its own secret name.
- Leaving new keys in `.env` after they exist in Doppler `dev` — local and team configs drift.

## Testing

- Shared keys: process started with `doppler run --config dev` sees them; `.env` has only `DOPPLER_TOKEN`.
- New-key PR: maintainer block present; no values in the diff.
- Cloud Run: service env is `DOPPLER_TOKEN` from the **named** GCP secret; app secrets are not listed as Cloud Run env vars.

## What this skill does NOT do

- Teach `doppler login` as team onboarding (maintainers only; not in this skill as a step to follow).
- Replace per-repo `doppler.yaml` or already-deployed `scripts/doppler-entrypoint.sh` copies (Docker COPY must stay in the image context). New services copy `library-repo-template/scripts/doppler-entrypoint.sh`.
- Own flow-only inventory scripts (`check-doppler-parity.py`, `doppler_inventory.py`, `seed-doppler-from-prefect.py`).
- Sync Vercel Preview, or treat Vercel apps as Cloud Run (no GCP Doppler secret for sales/dashboard).
- Store secret values in git, skills, or PRs.

## Pointers

- `coding-standards` — hub routing.
- `python-environment` — Conda/Poetry; run via Doppler.
- `repo-docs-consistency` — README catalog + PR maintainer note.
- `team-onboarding` — CLI + token handoff.
