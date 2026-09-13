# FAQ

## Concetti base

| Domanda | Risposta breve |
|---------|----------------|
| Qual è la differenza tra `simpl-techs` e `@simpl`? | **`simpl-techs`** è l’**organizzazione GitHub** (`simpl-techs/simpl_knowledge`). **`simpl`** è l’**alias del marketplace** in Claude Code: aggiungi il repo con `/plugin marketplace add simpl-techs/simpl_knowledge`, poi installi con `/plugin install simpl-standards@simpl`. |
| Cos’è `simpl_knowledge`? | È il bundle che distribuisce contesto agli agenti: plugin Claude Code, regole Cursor, skill Codex, catalogo librerie, template repo e hook condivisi. |
| È codice runtime della nostra app? | No. Non va importato dal backend o frontend. Serve agli strumenti agentici e ai workflow CI che pubblicano knowledge. |
| Dove installo i plugin? | Claude Code usa `/plugin`. Cursor riceve regole `.mdc` tramite `team-bootstrap.sh` e release `cursor-rules-rolling`. Codex non installa nulla: legge gli skill in `~/.agents/skills` e `~/.codex/skills`, symlink alla cache. |
| Devo committare `cursor-rules/`? | Sì, via CI: `release-cursor-rules.yml` rigenera e committa `cursor-rules/` (incluso `.version`) su `main`, e pubblica anche lo zip `cursor-rules-rolling`. Non editare gli `.mdc` a mano. |

## Plugin

| Domanda | Risposta breve |
|---------|----------------|
| Cosa installo sempre? | `simpl-standards`, `simpl-memory`, `simpl-libraries`. Sono i tre plugin globali per ogni developer. |
| Cos’è `simpl-standards`? | Le regole comuni: git workflow, coding standards, testing policy e skill di sistema. È il “come lavoriamo a simpl”. |
| Cosa è `simpl-memory`? | Obbligatorio per lo stack team: SessionStart carica instinct locali + feed team. Solo i tre owner in `config/simpl.json` popolano righe con `/extract-instincts`; vedi `plugins/simpl-memory/PRIVACY.md`. |
| Cos’è `simpl-libraries`? | Plugin globale con `catalog.md`: riassume tutte le lib `*-context` così l’agente sa cosa esiste prima di reimplementare. |
| Cosa sono i plugin `*-context`? | Sono il contesto completo di una singola libreria. Si installano quando un task richiede quella libreria, es. `/plugin install simpl_tracker-context@simpl`. In Codex sono già tutti linkati e vengono caricati solo se pertinenti al task. |

## Repo libreria

| Domanda | Risposta breve |
|---------|----------------|
| Cosa va in SKILL vs INTERNAL? | `SKILL.md` = come *usare* la lib da altri repo. `INTERNAL.md` = come *lavorare dentro* il repo. |
| Come versionano i plugin `-context`? | SemVer da label PR sul repo libreria (`breaking` / `feature` / default patch). |
| Quando devo usare `/update-skill`? | Prima del merge se hai cambiato API pubbliche, installazione, env var, esempi d’uso, vincoli o casi in cui la libreria va usata. |
| Dove vedo chi ha sincronizzato cosa? | `provenance.jsonl` + `simpl_knowledge_system/references/CHANGES.md`. |
| Repo GitHub diverso o fork? | Override locale: `SIMPL_KNOWLEDGE_REPO` (es. fork) per clone/zip; l’alias `@simpl` dipende dal marketplace che hai aggiunto in Claude. |

## Aggiornamenti

| Domanda | Risposta breve |
|---------|----------------|
| Come ricevo update in Claude Code? | Automatico: SessionStart `plugin-refresh` + `autoUpdate`. Nuove versioni attive alla sessione successiva. |
| Come ricevo update in Cursor? | L’hook `session-refresh` aggiorna cache e regole `simpl-*.mdc` a ogni nuova chat (skip se lo sha non è cambiato). Per forzare: `SIMPL_KNOWLEDGE_FORCE_REFRESH=1` o `bash scripts/doctor.sh` / `team-bootstrap.sh`. |
| Come ricevo update in Codex? | Gli skill sono symlink alla cache, quindi seguono la cache: la aggiorna `session-refresh` (chat Cursor o Claude), che rilinca anche skill nuovi o rinominati. Se usi solo Codex, allinea con `bash scripts/team-bootstrap.sh`. |
| Posso scrivere le mie note in `~/.codex/AGENTS.md`? | Sì, fuori dai marker `<!-- simpl_knowledge:start -->` / `:end`. Dentro il blocco viene riscritto a ogni sync. |
| Dove sono i file locali? | Cache marketplace: `~/.claude/plugins/cache/simpl_knowledge`. Regole Cursor: `~/.cursor/rules/simpl-*.mdc`. Skill Codex: `~/.agents/skills`, `~/.codex/skills` + `~/.codex/AGENTS.md`. Instinct locali: `~/.claude/simpl-memory/<repo>/`. |
