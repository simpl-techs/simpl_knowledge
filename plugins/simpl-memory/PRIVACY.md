# simpl-memory — privacy & data

## What is stored locally

- **Path**: `~/.claude/simpl-memory/<repo-basename>/instincts.jsonl`
- **Content**: short JSON lines (`pattern`, `suggestion`, `category`, `count`, `hash`, flags). **Not** full transcripts.
- **Transcripts**: read only in-memory for extraction; not copied to the store.

## API calls

- **When**: Stop hook (end of Claude Code session), throttled (~1× / 5 min / repo).
- **Model**: taken from the hook payload (`model` field) — the **same session model** your client was using (`SIMPL_MEMORY_EXTRACT_MODEL` overrides if set). Calls are routed to Anthropic (`claude-*`), OpenAI-compatible (`gpt-*`, `o*`…), or DeepSeek (`deepseek-*`) APIs.
- **Keys**: use the matching provider key (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`); optional shared fallback `SIMPL_MEMORY_API_KEY`.

## Opt-out

- Uninstall plugin **or** omit provider keys → extraction skips silently.
- Delete `~/.claude/simpl-memory/` to wipe local data.

## Team aggregation (optional, off by default)

- Workflow `aggregate-instincts.yml` is **dormant** until you add a collector repo and `INSTINCT_REPO_PAT`.
- Requires an explicit privacy policy for your org before enabling.

## Redaction

- `extract-instincts.js` redacts common secret/email patterns before sending text to the API.
- [Inference] This reduces accidental leakage; it is not a substitute for never pasting secrets into the agent.
