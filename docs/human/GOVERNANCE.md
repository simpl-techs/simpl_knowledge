# Governance (GitHub)

> Per il setup iniziale completo passo-passo, vedi [ADMIN_SETUP.md](ADMIN_SETUP.md). Questa pagina descrive le **regole** che la configurazione deve rispettare.

## `simpl-techs/simpl_knowledge`

- **Branch protection** su `main`: required PR, required status checks (`Validate skills`, `AgentShield security scan`).
- **Review**: minimo 1 approvazione; no push diretto.
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
