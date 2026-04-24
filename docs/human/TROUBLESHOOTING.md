# Troubleshooting

| Sintomo | Cosa controllare |
|---------|------------------|
| L’agent non cita `git-workflow` | Marketplace aggiunto? Plugin installati? Prova `/plugin marketplace update`. |
| Cursor senza regole | Esiste la release `cursor-rules-rolling`? Esegui `team-bootstrap.sh` (fallback clone+generate). |
| Cursor regole ferme dopo upgrade org | Dopo bootstrap, `sessionStart` globale in `~/.cursor/hooks.json` chiama `session-refresh` (throttle ~6h). Cache git: `~/.claude/plugins/cache/simpl-knowledge`. Regole gestite: `simpl-*.mdc` (vecchi `.mdc` senza prefisso restano ma non sono più sovrascritti). |
| Sync PR non si apre | Secret `SIMPL_KNOWLEDGE_PAT` e permessi su `simpl-knowledge`. |
| `auto-update-skill` fallisce | `ANTHROPIC_API_KEY`; variabile `ANTHROPIC_SKILL_MODEL` opzionale in repo vars. |
| Instinct non si salvano | `ANTHROPIC_API_KEY`; path `~/.claude/simpl-memory/<repo>/`. |
| Modello Claude non valido | Aggiorna `config/simpl.json` (`models.*`) e allinea eventuali workflow che duplicano lo slug. |
