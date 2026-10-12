# Governance (GitHub)

> Per il setup iniziale completo passo-passo, vedi [ADMIN_SETUP.md](ADMIN_SETUP.md). Questa pagina descrive le **regole** che la configurazione deve rispettare.

## `simpl-techs/simpl_knowledge`

- **Push diretto su `main`, senza PR** (decisione del 2026-09-24, vale solo per questo repo): `main` non ha branch protection e anche i sync delle librerie pubblicano lì. Prima del push: bump della versione del plugin, `scripts/ci/validate-agent-infra.sh` e `node --test tests/*.test.js`. I controlli in CI (`Validate agent infra`, `Release Cursor rules`, AgentShield) girano dopo il push.
- Le altre repo restano con PR e review (vedi `git-workflow`).
- **CODEOWNERS**: vedi [.github/CODEOWNERS](../../.github/CODEOWNERS) (sostituisci team con il tuo `@simpl-techs/...`).

## Repo libreria (template)

- Stessi principi su `main`; workflow sync usa `SIMPL_KNOWLEDGE_PAT` con scope solo su `simpl_knowledge`.

## Prompt injection / skill

- Le `SKILL.md` sono **input fidati** per l’agent: trattale come codice produzione.
- Il workflow `auto-update-skill` **sanitizza** il digest git e **vieta** modifiche fuori da `.agent/SKILL.md` (fail della CI).
- [Inference] Riduce il rischio; non sostituisce review umana e cultura security.

## AgentShield + hook

- CI: `ecc-agentshield` su PR che toccano `plugins/`.
- Locale: `secret-scan.js` sugli hook Cursor/Claude (regex + euristica entropia).
