# Troubleshooting

Questa pagina parte dai sintomi più comuni. Prima di debuggare, ricorda la distinzione:

- **Claude Code** usa marketplace e plugin (`/plugin marketplace add`, `/plugin install`, `/plugin marketplace update`).
- **Cursor** usa file `.mdc` in `~/.cursor/rules/` e hook in `~/.cursor/hooks.json`.
- Entrambi leggono dalla cache locale `~/.claude/plugins/cache/simpl_knowledge`.

| Sintomo | Cosa controllare |
|---------|------------------|
| `curl …team-bootstrap.sh` → 404 / errore 56 | Se hai già clonato il repo: `bash scripts/team-bootstrap.sh` dalla root. Altrimenti: repo privato (raw senza token), branch diverso da `main`, file non pushato. Alternativa: API GitHub + `gh auth token` (vedi [QUICKSTART](QUICKSTART.md)). Verifica: `gh repo view simpl-techs/simpl_knowledge`. |
| L’agent non cita `git-workflow` | Hai aggiunto `/plugin marketplace add simpl-techs/simpl_knowledge`? Hai installato i tre plugin con **`@simpl`** (non `@simpl-techs`)? Prova `/plugin marketplace update` e riavvia la sessione Claude. |
| “Marketplace not found” o clone fallisce | Connettività GitHub; per fork/staging imposta `SIMPL_KNOWLEDGE_REPO` (e opzionale `SIMPL_KNOWLEDGE_CACHE`) coerenti con quel remote e riesegui `team-bootstrap.sh`. |
| Cursor senza regole `.mdc` | Esiste sul remoto la release **`cursor-rules-rolling`** / `cursor-rules.zip`? Altrimenti riesegui `team-bootstrap.sh` (fallback clone + `generate-cursor-rules.sh`; serve **PyYAML**). |
| Cursor: regole ferme da giorni | Hook globale: `~/.cursor/hooks.json` deve invocare `session-refresh` (~6h throttle). Forza: riesegui bootstrap o elimina lo stamp `.last-refresh` nella cache (vedi `session-refresh.js`). Cache git tipica: `~/.claude/plugins/cache/simpl_knowledge`. Solo file **`simpl-*.mdc`** sono gestiti dall’org; altri `.mdc` restano intatti. |
| Sync PR non si apre dal repo libreria | Secret **`SIMPL_KNOWLEDGE_PAT`** presente sul repo? Permessi su `simpl-techs/simpl_knowledge`? Il workflow fa checkout di `simpl-techs/simpl_knowledge` — il nome org nel YAML deve combaciare col remoto. |
| `auto-update-skill` fallisce | `DEEPSEEK_API_KEY` a livello org; opzionale repo `SKILL_AGENT_MODEL` (default `deepseek/deepseek-chat`). |
| Instinct locali vuoti | Solo i tre **instinct owner** (`config/simpl.json`) possono popolare righe via `/extract-instincts` (serve `gh auth login` e path al transcript). Gli altri dev consumano `team-instincts/instincts.jsonl` dopo merge. Store locale: `~/.claude/simpl-memory/<repo>/`. |

## Comandi di verifica rapida (dev)

```bash
# Cache marketplace presente?
[ -d ~/.claude/plugins/cache/simpl_knowledge ] && echo "ok cache" || echo "manca cache — esegui team-bootstrap.sh"

# Quante regole org in Cursor?
ls ~/.cursor/rules/simpl-*.mdc 2>/dev/null | wc -l

# Claude Code installato?
command -v claude >/dev/null && claude --version || echo "Claude Code non in PATH"
```

## Diagnosi guidata

### curl team-bootstrap restituisce 404

1. Conferma che il repo esiste e che il tuo account ha accesso:
   ```bash
   gh repo view simpl-techs/simpl_knowledge
   ```
2. **Percorso normale:** se hai già clonato il repo, non usare `curl` — dalla root del clone:
   ```bash
   bash scripts/team-bootstrap.sh
   ```
3. Se non hai il clone e il repo è **privato**, usa l’API con token (stesso pattern del [QUICKSTART](QUICKSTART.md), Passo 1):
   ```bash
   curl -fsSL \
     -H "Authorization: Bearer $(gh auth token)" \
     -H "Accept: application/vnd.github.raw" \
     "https://api.github.com/repos/simpl-techs/simpl_knowledge/contents/scripts/team-bootstrap.sh?ref=main" \
     | bash
   ```
4. Se anche `gh repo view` fallisce: nome org/repo errato, repo non creato, o nessun permesso — sistemare prima su GitHub.

### Claude Code non usa gli standard

1. Apri una sessione Claude Code.
2. Esegui:
   ```text
   /plugin list
   ```
3. Devono comparire `simpl-standards`, `simpl-memory`, `simpl-libraries`.
4. Se mancano:
   ```text
   /plugin marketplace add simpl-techs/simpl_knowledge
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
2. Se non ci sono, dalla root del clone di `simpl_knowledge` esegui `bash scripts/team-bootstrap.sh`; se non hai ancora il clone puoi provare `curl` su `raw.githubusercontent.com` (solo repo pubblico). Se `curl` dà 404 (repo privato), vedi la sezione *curl team-bootstrap restituisce 404* più sotto.
3. Se ci sono ma non si aggiornano, controlla `~/.cursor/hooks.json`: deve avere `sessionStart` verso `node ~/.cursor/hooks/adapter.js session-refresh`.

### Il sync da repo libreria non apre PR

Controlla questi punti nel repo libreria:

- workflow `sync-skill-to-marketplace.yml` presente;
- `SIMPL_KNOWLEDGE_PAT` configurato nei secrets;
- repo target nel workflow: `simpl-techs/simpl_knowledge`;
- la merge su `main` include davvero modifiche a `.agent/SKILL.md`;
- `gh pr create` ha permessi via `GH_TOKEN`.

### `simpl-memory` sembra inattivo

È normale se **non** sei uno dei tre instinct owner: non eseguirai `/extract-instincts`; ricevi comunque il feed team al SessionStart se `team-instincts/instincts.jsonl` è stato mergiato nel marketplace.

Se **sei** owner e non vedi nuove righe locali:

1. `gh auth status` — deve essere autenticato.
2. Esegui `/extract-instincts` con un transcript valido e verifica `~/.claude/simpl-memory/<repo>/instincts.jsonl`.

Dettagli: [`plugins/simpl-memory/PRIVACY.md`](../../plugins/simpl-memory/PRIVACY.md).
