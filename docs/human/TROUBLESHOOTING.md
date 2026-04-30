# Troubleshooting

Questa pagina parte dai sintomi più comuni. Prima di debuggare, ricorda la distinzione:

- **Claude Code** usa marketplace e plugin (`/plugin marketplace add`, `/plugin install`, `/plugin marketplace update`).
- **Cursor** usa file `.mdc` in `~/.cursor/rules/` e hook in `~/.cursor/hooks.json`.
- Entrambi leggono dalla cache locale `~/.claude/plugins/cache/simpl-knowledge`.

| Sintomo | Cosa controllare |
|---------|------------------|
| L’agent non cita `git-workflow` | Hai aggiunto `/plugin marketplace add simpl-techs/simpl-knowledge`? Hai installato i tre plugin con **`@simpl`** (non `@simpl-techs`)? Prova `/plugin marketplace update` e riavvia la sessione Claude. |
| “Marketplace not found” o clone fallisce | Connettività GitHub; per fork/staging imposta `SIMPL_KNOWLEDGE_REPO` (e opzionale `SIMPL_KNOWLEDGE_CACHE`) coerenti con quel remote e riesegui `team-bootstrap.sh`. |
| Cursor senza regole `.mdc` | Esiste sul remoto la release **`cursor-rules-rolling`** / `cursor-rules.zip`? Altrimenti riesegui `team-bootstrap.sh` (fallback clone + `generate-cursor-rules.sh`; serve **PyYAML**). |
| Cursor: regole ferme da giorni | Hook globale: `~/.cursor/hooks.json` deve invocare `session-refresh` (~6h throttle). Forza: riesegui bootstrap o elimina lo stamp `.last-refresh` nella cache (vedi `session-refresh.js`). Cache git tipica: `~/.claude/plugins/cache/simpl-knowledge`. Solo file **`simpl-*.mdc`** sono gestiti dall’org; altri `.mdc` restano intatti. |
| Sync PR non si apre dal repo libreria | Secret **`SIMPL_KNOWLEDGE_PAT`** presente sul repo? Permessi su `simpl-techs/simpl-knowledge`? Il workflow fa checkout di `simpl-techs/simpl-knowledge` — il nome org nel YAML deve combaciare col remoto. |
| `auto-update-skill` fallisce | `DEEPSEEK_API_KEY` a livello org; opzionale repo `SKILL_AGENT_MODEL` (default `deepseek/deepseek-chat`). |
| Instinct non si salvano | Payload Stop deve includere `model`; in locale serve la chiave del provider attivo (`ANTHROPIC_*`, `OPENAI_*`, `DEEPSEEK_*`, o `SIMPL_MEMORY_API_KEY`). Path store: `~/.claude/simpl-memory/<repo>/`. |
| Modello / provider non valido | `config/simpl.json` (`models.*`); in CI remoto si usa DeepSeek; in locale l’estrazione segue il modello di sessione o `SIMPL_MEMORY_EXTRACT_MODEL`. |

## Comandi di verifica rapida (dev)

```bash
# Cache marketplace presente?
[ -d ~/.claude/plugins/cache/simpl-knowledge ] && echo "ok cache" || echo "manca cache — esegui team-bootstrap.sh"

# Quante regole org in Cursor?
ls ~/.cursor/rules/simpl-*.mdc 2>/dev/null | wc -l

# Claude Code installato?
command -v claude >/dev/null && claude --version || echo "Claude Code non in PATH"
```

## Diagnosi guidata

### Claude Code non usa gli standard

1. Apri una sessione Claude Code.
2. Esegui:
   ```text
   /plugin list
   ```
3. Devono comparire `simpl-standards`, `simpl-memory`, `simpl-libraries`.
4. Se mancano:
   ```text
   /plugin marketplace add simpl-techs/simpl-knowledge
   /plugin install simpl-standards@simpl
   /plugin install simpl-memory@simpl
   /plugin install simpl-libraries@simpl
   ```
5. Se sono presenti ma sembrano vecchi:
   ```text
   /plugin marketplace update
   ```

### Cursor non riceve le regole

1. Controlla che ci siano regole org:
   ```bash
   ls ~/.cursor/rules/simpl-*.mdc
   ```
2. Se non ci sono, riesegui:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/simpl-techs/simpl-knowledge/main/scripts/team-bootstrap.sh | bash
   ```
3. Se ci sono ma non si aggiornano, controlla `~/.cursor/hooks.json`: deve avere `sessionStart` verso `node ~/.cursor/hooks/adapter.js session-refresh`.

### Il sync da repo libreria non apre PR

Controlla questi punti nel repo libreria:

- workflow `sync-skill-to-marketplace.yml` presente;
- `SIMPL_KNOWLEDGE_PAT` configurato nei secrets;
- repo target nel workflow: `simpl-techs/simpl-knowledge`;
- la merge su `main` include davvero modifiche a `.agent/SKILL.md`;
- `gh pr create` ha permessi via `GH_TOKEN`.

### `simpl-memory` sembra inattivo

Questo può essere normale se non hai configurato chiavi provider. `simpl-memory` carica comunque comandi e hook, ma l’estrazione degli instinct salta se non trova una chiave compatibile con il modello della sessione.

Per abilitarlo:

```bash
export ANTHROPIC_API_KEY="..."
# oppure OPENAI_API_KEY / DEEPSEEK_API_KEY / SIMPL_MEMORY_API_KEY
```

Gli instinct locali sono in:

```bash
~/.claude/simpl-memory/<repo>/instincts.jsonl
```
