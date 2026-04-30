# Ruoli

`simpl-knowledge` funziona bene solo se è chiaro chi mantiene cosa. La regola generale è:

- le **convenzioni trasversali** vivono in `simpl-standards`;
- il **catalogo delle librerie** vive in `simpl-libraries`;
- la **knowledge pubblica di una libreria** vive prima nel repo della libreria, in `.agent/SKILL.md`;
- la **knowledge interna di una libreria** resta nel repo della libreria, in `.agent/INTERNAL.md`.

| Chi | Cosa fa |
|-----|---------|
| **Platform / admin** | Possiede `simpl-techs/simpl-knowledge`: branch protection, CI verde, release `cursor-rules-rolling`, rotazione `SIMPL_KNOWLEDGE_PAT`, onboarding org su `DEEPSEEK_API_KEY`. Risponde se il bootstrap o lo zip delle regole falliscono per tutti. |
| **Consumer (developer)** | Esegue `team-bootstrap.sh`, aggiunge marketplace e installa `simpl-standards`, `simpl-memory`, `simpl-libraries` con `@simpl`. Consulta `catalog.md` prima di nuove integrazioni. Settimanale: `/plugin marketplace update`. |
| **Maintainer libreria** | Mantiene `.agent/SKILL.md` e `INTERNAL.md`; usa `/update-skill` quando cambia la superficie pubblica; review delle PR aperte da `auto-update-skill` o dal bot di sync. |
| **Bot / automazioni** | Apre PR di sync verso `simpl-techs/simpl-knowledge` e bozze skill; **nessun merge automatico** su contenuto sensibile — serve review umana. |

## Cosa fa un developer normale

Un developer che vuole solo usare gli agent non deve capire tutto il sistema. Deve:

1. eseguire `team-bootstrap.sh`;
2. installare in Claude Code i tre plugin globali;
3. aggiornare periodicamente con `/plugin marketplace update`;
4. fidarsi del catalogo quando l’agent segnala che esiste una libreria interna;
5. chiedere a un maintainer se il catalogo sembra mancare una libreria.

## Cosa fa un maintainer di libreria

Il maintainer è responsabile della qualità del contesto pubblicato.

Deve aggiornare `.agent/SKILL.md` quando cambiano:

- installazione o dipendenze;
- API pubbliche;
- variabili ambiente;
- esempi principali;
- regole d’uso;
- errori comuni;
- casi in cui la libreria è obbligatoria.

Non deve mettere in `.agent/SKILL.md` dettagli interni non utili ai consumer. Quelli vanno in `.agent/INTERNAL.md`.

## Cosa fanno le automazioni

Le automazioni riducono il lavoro manuale, ma non sostituiscono review umana:

- `auto-update-skill` può proporre una PR quando lo skill sembra driftare dal codice;
- `sync-skill-to-marketplace` propaga `.agent/SKILL.md` al marketplace;
- `generate-catalog` aggiorna `catalog.md` / `catalog.json`;
- `session-refresh` aggiorna cache e regole locali.

Contenuto sensibile o org-wide: sempre review esplicita.
