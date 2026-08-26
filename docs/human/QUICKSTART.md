# Quickstart (developer)

Guida per usare gli agent del team. Per configurare il sistema da zero nell'org → [ADMIN_SETUP.md](ADMIN_SETUP.md).

```mermaid
flowchart LR
  maintainer[Maintainer libreria] --> skill[".agent/SKILL.md"]
  skill --> hub["Repo simpl-techs/simpl_knowledge"]
  hub --> claude[Claude Code plugin]
  hub --> cursor[Cursor rules]
  claude --> dev[Agent del developer]
  cursor --> dev
```

---

## Passo 1 — Bootstrap

Stesso contenuto, **due modi**: install con **clone** da GitHub (consigliato) oppure **solo download** ed esecuzione di `team-bootstrap.sh`.

### A — Clone da GitHub + bootstrap (consigliato)

```bash
git clone https://github.com/simpl-techs/simpl_knowledge.git
cd simpl_knowledge
bash scripts/team-bootstrap.sh
```

### B — Solo download dello script (senza clone)

**Repo pubblico** — raw da `main`:

```bash
curl -fsSL "https://raw.githubusercontent.com/simpl-techs/simpl_knowledge/main/scripts/team-bootstrap.sh" | bash
```

**Repo privato** — serve token (es. con GitHub CLI già autenticata):

```bash
curl -fsSL \
  -H "Authorization: Bearer $(gh auth token)" \
  -H "Accept: application/vnd.github.raw" \
  "https://api.github.com/repos/simpl-techs/simpl_knowledge/contents/scripts/team-bootstrap.sh?ref=main" \
  | bash
```

Verifica accesso: `gh repo view simpl-techs/simpl_knowledge`.

Lo script rileva da solo se hai Claude Code, Cursor o entrambi. È idempotente: rieseguilo per forzare un refresh.

## Passo 2 — Solo se hai Claude Code

Apri una sessione Claude Code e incolla:

```text
/plugin marketplace add simpl-techs/simpl_knowledge
/plugin install simpl-standards@simpl
/plugin install simpl-memory@simpl
/plugin install simpl-libraries@simpl
```

Questi comandi esistono solo dentro la sessione Claude Code, lo script non può eseguirli per te.

Gli **instinct owner** (`Len378`, `n3ural`, `not-Karot`, vedi `config/simpl.json`) usano `/extract-instincts` per catturare pattern dalla sessione; gli altri dev ricevono i pattern team-wide al SessionStart. Dettagli: [`team-instincts/README.md`](../../team-instincts/README.md).

## Passo 3 — Verifica

Apri Claude o Cursor in un repo qualsiasi e chiedi:

```text
come scriviamo i commit qui?
```

L'agent deve citare lo skill `git-workflow`. Se non lo cita → [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

---

## Segreti (Doppler)

I secret del team stanno su Doppler, non in un `.env` pieno di chiavi. Installa la CLI Doppler. **Non** fare `doppler login` e **non** aprire la dashboard: chiedi a Raff, Iacopo o Flavio un token read-only `dev` per quel progetto, mettilo in `.env` come `DOPPLER_TOKEN`, poi `doppler run --config dev -- <comando>`. Dettaglio per agenti e maintainer: skill `doppler` in `simpl-standards`.

---

## Aggiornamenti

**Perché** il repo centrale (`simpl_knowledge`) cambia regole, skill e plugin: devi sapere **che cosa** si aggiorna **dove** e **cosa fare tu**.

| Strumento | Cosa si aggiorna “in automatico” | Cosa fai tu, quando, perché |
|-----------|-----------------------------------|-----------------------------|
| **Cursor** | L’hook globale `session-refresh` (schema: `hooks.sessionStart` come array) a ogni nuova chat fa fetch + `reset --hard` della cache git, sincronizza **`simpl-*.mdc`**, scrive `~/.simpl_knowledge/state.json` e inietta lo sha nel contesto sessione. | Se serve **subito**: `SIMPL_KNOWLEDGE_FORCE_REFRESH=1` o `bash scripts/doctor.sh` / `team-bootstrap.sh`; vedi [TROUBLESHOOTING.md](TROUBLESHOOTING.md). |
| **Claude Code** | `simpl-standards` SessionStart esegue `plugin-refresh`: self-heal del clone marketplace (`reset --hard origin/main`) e avviso in-sessione se le versioni installate restano indietro. L’auto-update nativo di Claude aiuta solo se il clone non è divergente. | Quando l’hook avvisa (o dopo merge sull’hub): **`/plugin marketplace update`** poi `/plugin install <plugin>@simpl`. **Perché**: l’hook non riscrive la cache versionata dei plugin. |

Comando di riferimento in sessione Claude Code:

```text
/plugin marketplace update
```

### Attivare l’auto-update del marketplace `simpl` (Claude Code, una volta sola)

Per non doverlo fare ogni volta a mano, abilita l’auto-update **dal menu plugin**:

1. In sessione Claude Code esegui `/plugin` (apre la TUI).
2. Vai sul tab **Marketplaces**.
3. Seleziona **`simpl`** (il marketplace `simpl-techs/simpl_knowledge` aggiunto al Passo 2).
4. Attiva **«Enable auto-update»**.

Da quel momento, all’avvio di ogni sessione Claude Code la cache del marketplace viene aggiornata; le nuove versioni dei plugin entrano in vigore al **prossimo restart** del client. Per un refresh immediato resta valido `/plugin marketplace update`.

[Unverified] La configurazione tramite `settings.json` non è (ancora) supportata: la richiesta è tracciata su [anthropics/claude-code#51350](https://github.com/anthropics/claude-code/issues/51350).

**In sintesi:** Cursor → cache + `.mdc` aggiornati a ogni chat (sha-based); Claude Code → self-heal del clone + avviso se i plugin sono stale, poi `/plugin install …` quando richiesto.

---

## Sei maintainer di una libreria?

1. `cd` nel tuo repo libreria.
2. Esegui:
   ```bash
   bash ~/.claude/plugins/cache/simpl_knowledge/library-repo-template/scripts/bootstrap.sh <repo-name>
   ```
3. Compila `.agent/SKILL.md` (rimuovi i placeholder `REPLACE-ME`), commit, push.
4. Al merge in `main`, il workflow `sync-skill-to-marketplace` apre PR sul repo centrale. Dopo il merge della PR, gli altri dev ricevono l'update con `/plugin marketplace update`.

---

Problemi? → [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
