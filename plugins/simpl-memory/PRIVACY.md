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

## Team feed (optional, opt-in per developer)

- **Local stays private** until a developer runs `/share-instincts`. That opens a PR adding or replacing `team-instincts/raw/<github-login>.jsonl` in `simpl-techs/simpl_knowledge`.
- **Designated operators** (2–3 people) run `/aggregate-team-instincts` in Cursor or Claude Code to merge all `raw/*.jsonl` into `team-instincts/instincts.jsonl` and open another PR. No separate collector repo; no `INSTINCT_REPO_PAT`.
- After merge, every dev receives the aggregated file via marketplace cache; `load-instincts.js` injects it as **Team-wide patterns** at session start (unless the same `hash` already exists in that dev’s local store for the repo — local wins).
- Your org should document who may operate aggregation and how often. [Inference] Aggregation uses the operator’s Claude/Cursor session (subscription usage applies).

## Redaction

- `extract-instincts.js` redacts common secret/email patterns before sending text to the API.
- [Inference] This reduces accidental leakage; it is not a substitute for never pasting secrets into the agent.
