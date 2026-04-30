# Troubleshooting

| Sintomo | Cosa controllare |
|---------|------------------|
| L’agent non cita `git-workflow` | Marketplace aggiunto? Plugin installati? Prova `/plugin marketplace update`. |
| Cursor senza regole | Esiste la release `cursor-rules-rolling`? Esegui `team-bootstrap.sh` (fallback clone+generate). |
| Cursor regole ferme dopo upgrade org | Dopo bootstrap, `sessionStart` globale in `~/.cursor/hooks.json` chiama `session-refresh` (throttle ~6h). Cache git: `~/.claude/plugins/cache/simpl-knowledge`. Regole gestite: `simpl-*.mdc` (vecchi `.mdc` senza prefisso restano ma non sono più sovrascritti). |
| Sync PR non si apre | Secret `SIMPL_KNOWLEDGE_PAT` e permessi su `simpl-knowledge`. |
| `auto-update-skill` fallisce | Secret org `DEEPSEEK_API_KEY`; variabile repo opzionale `SKILL_AGENT_MODEL` (default `deepseek/deepseek-chat`). |
| Instinct non si salvano | Nel payload Stop serve `model`; in locale la chiave deve matchare il provider del modello (`ANTHROPIC_*`, `OPENAI_*`, `DEEPSEEK_*`, oppure `SIMPL_MEMORY_API_KEY`). Path store: `~/.claude/simpl-memory/<repo>/`. |
| Modello / provider non valido | `config/simpl.json` (`models.*`); workflow usa solo DeepSeek in remoto; estrazione locale segue il modello di sessione o `SIMPL_MEMORY_EXTRACT_MODEL`. |
