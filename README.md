# simpl-knowledge

Marketplace Claude Code (`simpl`) + bundle Cursor + CI per l’organizzazione **simpl**.

| Audience | Start |
|----------|--------|
| People | [docs/human/QUICKSTART.md](docs/human/QUICKSTART.md) |
| Agents | [docs/agent/CONTEXT.md](docs/agent/CONTEXT.md) + skill `simpl-knowledge-system` |

## Install rapido

**Claude Code**

```text
/plugin marketplace add simpl/simpl-knowledge
/plugin install simpl-standards@simpl
/plugin install simpl-memory@simpl
```

**Cursor** — `bash scripts/team-bootstrap.sh` oppure `bash scripts/install-team.sh` (scarica release `cursor-rules-rolling`).

## Repo layout

- `library-repo-template/` — scaffold per repo libreria (`.agent/`, hook, workflow sync marketplace); usabile da agenti via cache plugin
- `plugins/simpl-standards` — policy condivise + meta-skill `simpl-knowledge-system`
- `plugins/simpl-memory` — instinct / continuous learning (opt-in)
- `plugins/<lib>-context` — mirror di `.agent/SKILL.md` dal repo della libreria
- `provenance.jsonl` — log append-only dei sync
- `config/simpl.json` — costanti org/repo/modelli

## CI

- `validate-skills.yml` — frontmatter + marketplace + check simboli euristico
- `agentshield-scan.yml` — security
- `generate-cursor-rules.yml` — build + upload zip su release rolling
