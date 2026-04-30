# Admin setup

Setup `simpl-knowledge` per l'org `simpl-techs`. Da fare una volta sola; dopo, ogni developer fa solo il [QUICKSTART](QUICKSTART.md).

---

## Passo 1 — Crea il repo centrale

Su GitHub crea `simpl-techs/simpl-knowledge`. Pubblica il contenuto di `simpl_knowledge/`. Branch principale: `main`.

## Passo 2 — Branch protection su `main`

Settings → Branches → Add rule per `main`:

- "Require pull request before merging" → ON, almeno 1 review.
- "Restrict who can push" → nessun push diretto.

`TODO`: aggiungere "Require status checks" quando deciderete di introdurre workflow CI nel repo centrale (oggi non ce ne sono).

## Passo 3 — `CODEOWNERS`

`TODO`: scegli i team della tua org. Il bundle non contiene un `CODEOWNERS` di default.

Crea `.github/CODEOWNERS` nel repo centrale con la sintassi:

```text
<path-pattern>   @simpl-techs/<team>
```

Esempio di policy minima da personalizzare:

```text
*                          @simpl-techs/<team-platform>
plugins/*-context/         @simpl-techs/<team-library-maintainers>
```

Sostituisci `<team-...>` con i team reali.

## Passo 4 — Crea il PAT `SIMPL_KNOWLEDGE_PAT`

GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token:

- Resource owner: `simpl-techs`.
- Repository access: **Only select repositories** → `simpl-knowledge`.
- Permissions: **Contents** = read & write, **Pull requests** = read & write.

Salva il token, ti serve al passo 5.

## Passo 5 — Org secrets

Settings → Secrets and variables → Actions → **Organization secrets** → New organization secret. Imposta:

- `SIMPL_KNOWLEDGE_PAT` = token creato al passo 4. Usato da `sync-skill-to-marketplace.yml` nei repo libreria per aprire PR sul marketplace.
- `DEEPSEEK_API_KEY` = API key DeepSeek. Usata da `auto-update-skill.yml` nei repo libreria (aider propone aggiornamenti a `.agent/SKILL.md`).
- `INSTINCT_REPO_PAT` (opzionale) = PAT su `simpl-techs/agent-instincts`. Solo se attivi l'aggregazione team degli instinct.

Esposizione: a tutti i repo della org, oppure restringi ai repo libreria.

## Passo 6 — Pubblica la release `cursor-rules-rolling`

Lo script `team-bootstrap.sh` scarica le regole Cursor da una release con tag `cursor-rules-rolling`. Crea la release così:

```bash
git clone https://github.com/simpl-techs/simpl-knowledge.git
cd simpl-knowledge
bash scripts/generate-cursor-rules.sh
(cd cursor-rules && zip -r ../cursor-rules.zip .)
gh release create cursor-rules-rolling cursor-rules.zip \
  --title "cursor-rules-rolling" \
  --notes "rolling release of cursor rules"
```

Per aggiornarla in futuro:

```bash
bash scripts/generate-cursor-rules.sh
(cd cursor-rules && zip -r ../cursor-rules.zip .)
gh release upload cursor-rules-rolling cursor-rules.zip --clobber
```

`TODO`: se vuoi automatizzare la pubblicazione, aggiungi un workflow nel repo centrale (oggi non c'è).

Senza release, il bootstrap dei dev funziona comunque ma usa il fallback: clone + generazione locale (richiede Python + PyYAML sulla macchina del dev).

## Passo 7 — Verifica

Su una macchina dev pulita:

```bash
curl -fsSL https://raw.githubusercontent.com/simpl-techs/simpl-knowledge/main/scripts/team-bootstrap.sh | bash
```

Poi:

1. In Claude Code installa i 3 plugin (`simpl-standards`, `simpl-memory`, `simpl-libraries`).
2. In un repo qualsiasi chiedi all'agent: "come scriviamo i commit qui?" → deve citare `git-workflow`.
3. Verifica che esistano i file `~/.cursor/rules/simpl-*.mdc`.

Se i 3 punti passano, il sistema è attivo.

## Passo 8 — Onboarding di un repo libreria

Per ogni libreria interna che vuoi includere:

1. `cd` nel repo della libreria (deve avere `.git`).
2. Esegui:
   ```bash
   bash ~/.claude/plugins/cache/simpl-knowledge/library-repo-template/scripts/bootstrap.sh <repo-name>
   ```
3. Compila `.agent/SKILL.md` (rimuovi i placeholder `REPLACE-ME`).
4. Verifica che il repo erediti gli org secret `SIMPL_KNOWLEDGE_PAT` e `DEEPSEEK_API_KEY` (Settings → Secrets and variables → Actions → tab "Organization secrets").
5. Commit, push, merge. Al merge in `main`, `sync-skill-to-marketplace.yml` apre PR sul repo centrale.

---

## Riferimenti

- [QUICKSTART.md](QUICKSTART.md) — cosa fa il developer dopo che il setup è completo.
- [GOVERNANCE.md](GOVERNANCE.md) — regole di review e sicurezza.
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) — diagnosi.
