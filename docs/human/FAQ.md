# FAQ

| Domanda | Risposta breve |
|---------|----------------|
| Dove installo i plugin? | Claude: `/plugin marketplace add simpl/simpl-knowledge`. Cursor: zip release o `team-bootstrap.sh`. |
| Cosa va in SKILL vs INTERNAL? | SKILL = come *usare* la lib da altri repo. INTERNAL = come *lavorare dentro* il repo. |
| Devo committare `cursor-rules/`? | No: sono nel **release asset**, non su `main`. |
| Cosa è `simpl-memory`? | Opt-in: estrae pattern ripetuti; vedi `plugins/simpl-memory/PRIVACY.md`. |
| Come versionano i plugin `-context`? | SemVer da label PR sul repo libreria (`breaking` / `feature` / default patch). |
| Dove vedo chi ha sincronizzato cosa? | `provenance.jsonl` + `simpl-knowledge-system/references/CHANGES.md`. |
