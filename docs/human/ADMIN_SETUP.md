# Admin setup

Setup `simpl_knowledge` per l'org `simpl-techs`. Da fare una volta sola; dopo, ogni developer fa solo il [QUICKSTART](QUICKSTART.md).

---

## Passo 1 — Crea il repo centrale

Su GitHub crea `simpl-techs/simpl_knowledge`. Pubblica il contenuto di `simpl_knowledge/`. Branch principale: `main`.

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
- Repository access: **Only select repositories** → `simpl_knowledge`.
- Permissions: **Contents** = read & write, **Pull requests** = read & write.

Salva il token, ti serve al passo 5.

## Passo 5 — Org secrets

Settings → Secrets and variables → Actions → **Organization secrets** → New organization secret. Imposta:

- `SIMPL_KNOWLEDGE_PAT` = token creato al passo 4. Usato da `sync-skill-to-marketplace.yml` nei repo libreria per aprire PR sul marketplace.
- `DEEPSEEK_API_KEY` = API key DeepSeek. Usata da `auto-update-skill.yml` nei repo libreria (aider propone aggiornamenti a `.agent/SKILL.md`).

Esposizione: a tutti i repo della org, oppure restringi ai repo libreria.

**Team instincts (simpl-memory):** designa 2–3 dev volontari come operatori di `/aggregate-team-instincts`. Servono: subscription Claude/Cursor adeguata per la sessione in cui mergiano ([Inference]), `gh` autenticata, permesso di aprire PR su `simpl-techs/simpl_knowledge`. Nessun secret org dedicato: i dev pubblicano i raw con `/share-instincts` sotto la propria identità GitHub.

## Passo 6 — Release cursor-rules-rolling (automatica)

`team-bootstrap.sh` scarica le regole Cursor da una release GitHub con tag `cursor-rules-rolling` e asset `cursor-rules.zip`.

Dopo che questo repo è su `main` con il workflow abilitato:

1. **Automatico:** il workflow [.github/workflows/release-cursor-rules.yml](.github/workflows/release-cursor-rules.yml) gira su ogni push a `main` che modifica `plugins/**/SKILL.md`, `scripts/generate-cursor-rules.sh` o lo stesso workflow. Genera gli `.mdc`, crea uno zip con ordine deterministico e pubblica o aggiorna la release. Se lo zip è identico all’asset già in release (stesso SHA-256), non carica nulla.

2. **Prima volta / forzatura:** GitHub → **Actions** → **Release Cursor rules** → **Run workflow** (trigger `workflow_dispatch`).

3. **Senza asset su GitHub:** il bootstrap dei dev usa ugualmente il fallback (clone + generazione locale) finché la release non esiste.

### Fallback manuale (solo se GitHub Actions non è disponibile)

```bash
git clone https://github.com/simpl-techs/simpl_knowledge.git && cd simpl_knowledge
pip install pyyaml && bash scripts/generate-cursor-rules.sh
(cd cursor-rules && find . -type f -print0 | sort -z | xargs -0 zip -X -q ../cursor-rules.zip)
gh release create cursor-rules-rolling cursor-rules.zip --title cursor-rules-rolling --notes "rolling" \
  || gh release upload cursor-rules-rolling cursor-rules.zip --clobber
```

## Passo 7 — Verifica

Su una macchina dev pulita con il repo già clonato (consigliato), dalla root del clone:

```bash
bash scripts/team-bootstrap.sh
```

Se non c’è il clone e il repo è pubblico, opzionalmente:

```bash
curl -fsSL https://raw.githubusercontent.com/simpl-techs/simpl_knowledge/main/scripts/team-bootstrap.sh | bash
```

Se `curl` risponde 404 (repo privato), usa solo `bash scripts/team-bootstrap.sh` dal clone o vedi [QUICKSTART.md](QUICKSTART.md) (Passo 1).

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
   bash ~/.claude/plugins/cache/simpl_knowledge/library-repo-template/scripts/bootstrap.sh <repo-name>
   ```
3. Compila `.agent/SKILL.md` (rimuovi i placeholder `REPLACE-ME`).
4. Verifica i secret Actions: con **org secrets** (`SIMPL_KNOWLEDGE_PAT`, `DEEPSEEK_API_KEY`) ereditati dal repo; senza piano org, imposta gli stessi nomi come **repository secrets** su ogni repo libreria. Controlla che esista `requirements-agent-ci.txt` in root (il bootstrap lo copia dal template).
5. Commit, push, merge. Al merge in `main`, `sync-skill-to-marketplace.yml` apre PR sul repo centrale.

---

## Riferimenti

- [QUICKSTART.md](QUICKSTART.md) — cosa fa il developer dopo che il setup è completo.
- [GOVERNANCE.md](GOVERNANCE.md) — regole di review e sicurezza.
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) — diagnosi.
