# FAQ

| Domanda | Risposta breve |
|---------|----------------|
| Dove installo i plugin? | Claude: `/plugin marketplace add simpl-techs/simpl-knowledge`. Cursor: zip release o `team-bootstrap.sh`. |
| Cosa va in SKILL vs INTERNAL? | SKILL = come *usare* la lib da altri repo. INTERNAL = come *lavorare dentro* il repo. |
| Devo committare `cursor-rules/`? | No: sono nel **release asset**, non su `main`. |
| Cosa è `simpl-memory`? | Obbligatorio: estrae pattern ripetuti; vedi `plugins/simpl-memory/PRIVACY.md`. |
| Cos’è `simpl-libraries`? | Plugin globale con `catalog.md`: riassume tutte le lib `*-context` così l’agente sa cosa esiste prima di reimplementare. |
| Come versionano i plugin `-context`? | SemVer da label PR sul repo libreria (`breaking` / `feature` / default patch). |
| Dove vedo chi ha sincronizzato cosa? | `provenance.jsonl` + `simpl-knowledge-system/references/CHANGES.md`. |
