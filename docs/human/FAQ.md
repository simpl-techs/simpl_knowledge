# FAQ

## Concetti base

| Domanda | Risposta breve |
|---------|----------------|
| Qual è la differenza tra `simpl-techs` e `@simpl`? | **`simpl-techs`** è l’**organizzazione GitHub** (`simpl-techs/simpl_knowledge`). **`simpl`** è l’**alias del marketplace** in Claude Code: aggiungi il repo con `/plugin marketplace add simpl-techs/simpl_knowledge`, poi installi con `/plugin install simpl-standards@simpl`. |
| Cos’è `simpl_knowledge`? | È il bundle che distribuisce contesto agli agenti: plugin Claude Code, regole Cursor, catalogo librerie, template repo e hook condivisi. |
| È codice runtime della nostra app? | No. Non va importato dal backend o frontend. Serve agli strumenti agentici e ai workflow CI che pubblicano knowledge. |
| Dove installo i plugin? | Claude Code usa `/plugin`. Cursor non usa plugin Claude: riceve regole `.mdc` tramite `team-bootstrap.sh` e release `cursor-rules-rolling`. |
| Devo committare `cursor-rules/`? | No: sono nel **release asset**, non su `main` del bundle (salvo eccezioni di tooling). |

## Plugin

| Domanda | Risposta breve |
|---------|----------------|
| Cosa installo sempre? | `simpl-standards`, `simpl-memory`, `simpl-libraries`. Sono i tre plugin globali per ogni developer. |
| Cos’è `simpl-standards`? | Le regole comuni: git workflow, coding standards, testing policy e skill di sistema. È il “come lavoriamo a simpl”. |
| Cosa è `simpl-memory`? | Obbligatorio per lo stack team: estrae pattern ripetuti; vedi `plugins/simpl-memory/PRIVACY.md`. Senza chiavi provider l’estrazione salta in silenzio. |
| Cos’è `simpl-libraries`? | Plugin globale con `catalog.md`: riassume tutte le lib `*-context` così l’agente sa cosa esiste prima di reimplementare. |
| Cosa sono i plugin `*-context`? | Sono il contesto completo di una singola libreria. Si installano quando un task richiede quella libreria, es. `/plugin install simpl_tracker-context@simpl`. |

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
| Come ricevo update in Claude Code? | `/plugin marketplace update`, poi nuova sessione se vuoi essere sicuro che le skill vengano ricaricate. |
| Come ricevo update in Cursor? | L’hook `session-refresh` aggiorna cache e regole `simpl-*.mdc` circa ogni 6 ore. Per forzare: riesegui `team-bootstrap.sh`. |
| Dove sono i file locali? | Cache marketplace: `~/.claude/plugins/cache/simpl_knowledge`. Regole Cursor: `~/.cursor/rules/simpl-*.mdc`. Instinct locali: `~/.claude/simpl-memory/<repo>/`. |
