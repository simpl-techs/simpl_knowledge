---
name: simpl_knowledge_agent_context
description: Token-efficient reference for agents about simpl_knowledge. Read when answering questions about org-wide agent setup, marketplace simpl-techs/simpl_knowledge (alias install `@simpl`), plugin names simpl-standards, simpl-memory, simpl-libraries, Cursor rolling release cursor-rules-rolling, Codex skills in ~/.agents/skills and ~/.codex/skills, catalog.md, or provenance.jsonl.
---

# simpl_knowledge — agent context

- **Marketplace alias**: `simpl` (`@simpl` in `/plugin install`). **GitHub repo** del bundle: `simpl-techs/simpl_knowledge`.
- **Plugins**: `simpl-standards`, `simpl-memory`, `simpl-libraries` (all global defaults), `<repo>-context` (full SKILL per library when needed).
- **Catalog**: `catalog.md` + `catalog.json` at repo root — summaries of every `*-context` plugin; agents consult via `simpl-libraries` / `internal-libraries-awareness` before duplicating org tooling.
- **Truth**: Library integration text lives in **that library’s** `.agent/SKILL.md`; `simpl_knowledge` mirrors it under `plugins/<repo>-context/`.
- **Shared cache**: `~/.simpl_knowledge/cache`. Claude's plugin cache garbage collector prunes non-plugin repositories; bootstrap moves the legacy shared checkout out of that directory, preserves a backup and relinks managed skills. Do not recreate the old shared-cache path.
- **Cursor**: `session-refresh` copies `simpl-*.mdc` from cache `cursor-rules/` (CI commits this on `main`); zip `cursor-rules-rolling` is the fallback.
- **Codex**: cache skills are symlinked into `~/.agents/skills` and `~/.codex/skills`; `~/.codex/AGENTS.md` carries a managed block between `<!-- simpl_knowledge:start -->` / `:end`. Wired by `sync-codex-knowledge.js` from bootstrap and every `session-refresh`.
- **Bootstrap**: `team-bootstrap.sh` is the canonical installer; `install-team.sh` delegates to it. Git, Node and Python 3 are prerequisites. Cursor rules come from the authenticated Git cache. `--dry-run` does not write files. Bootstrap ends with `doctor.sh` and fails on incomplete installation.
- **Doctor**: checks detected agents only; exits nonzero for stale or dirty caches, mismatched hook/rule content, plugin versions/settings, incomplete skill links or malformed managed markers. Plugin checks use the exact marketplace and user scope. Successful doctor does not prove model loading; ask each agent to cite `git-workflow` too.
- **Claude refresh**: the global plugin hook also runs shared session refresh, including outside repos with project hooks. Its subprocesses share a 55-second execution budget; updates are verified against installed metadata.
- **Release checks**: library sync bumps both the integration plugin and `simpl-standards` for its bundled changelog. New plugins start at `0.1.0`; breaking pre-stable releases bump minor. `VALIDATE_BASE_REF=main bash scripts/ci/validate-agent-infra.sh` also checks pending edits. Regression tests: `node --test tests/*.test.js`.
- **Memory path**: `~/.claude/simpl-memory/<repo>/instincts.jsonl`.
- **Meta skill**: `simpl_knowledge_system` — explain full loop to users.
- **Human docs** (longer): `docs/human/*.md` (Italian, onboarding).

## Bootstrap detection (library repos)

- Template lives in marketplace clone: `library-repo-template/` under `simpl_knowledge` cache.
- `repo-context-check.js` compares tracked files vs template (opt-in gate). Drift → `.claude/.simpl-repo-report.json` (gitignored) and Claude SessionStart may surface a hint.
- Apply only after user says yes: `apply-repo-template.js` (dry-run default) or skill `repo-context-bootstrap` / `/bootstrap-repo-context`.
