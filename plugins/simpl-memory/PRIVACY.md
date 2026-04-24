# simpl-memory — privacy & data

## What is stored locally

- **Path**: `~/.claude/simpl-memory/<repo-basename>/instincts.jsonl`
- **Content**: short JSON lines (`pattern`, `suggestion`, `category`, `count`, `hash`, flags). **Not** full transcripts.
- **Transcripts**: read only in-memory for extraction; not copied to the store.

## API calls

- **When**: Stop hook (end of Claude Code session), throttled (~1× / 5 min / repo).
- **Model**: configurable via `SIMPL_MEMORY_EXTRACT_MODEL` (see `config/simpl.json`).
- **Key**: `ANTHROPIC_API_KEY` or `SIMPL_MEMORY_API_KEY`.

## Opt-out

- Uninstall plugin **or** unset API keys → extraction skips silently.
- Delete `~/.claude/simpl-memory/` to wipe local data.

## Team aggregation (optional, off by default)

- Workflow `aggregate-instincts.yml` is **dormant** until you add a collector repo and `INSTINCT_REPO_PAT`.
- Requires an explicit privacy policy for your org before enabling.

## Redaction

- `extract-instincts.js` redacts common secret/email patterns before sending text to the API.
- [Inference] This reduces accidental leakage; it is not a substitute for never pasting secrets into the agent.
