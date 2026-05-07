# ECC integration — what we took, what we built ourselves

We evaluated [everything-claude-code](https://github.com/affaan-m/everything-claude-code) (ECC) as a source of patterns. We adopted four ideas but **none of the code directly**. Every pattern here is rewritten clean, small, and under our control.

## What we did NOT take

- **The ECC plugin itself** — too big (183 skills), opinionated ("SOUL.md", "instincts" terminology), and evolves too fast for us to track as a dependency.
- **ECC's `continuous-learning-v2` code** — good idea, their implementation is heavy (PM2, multiple event types, cross-harness complexity). We reimplemented a smaller loop: on-demand `/extract-instincts` (agent session, owner-only) + persist + SessionStart inject; team merge is operator-driven via slash commands, not CI.
- **ECC's `skill-create` implementation** — also a slash command of similar shape, but theirs is ~400 lines of prompt engineering. We kept our version simple (~60 lines) because we're running on a team of 5 where a human reviews every generated skill anyway.

## What we DID take (as patterns, rewritten)

### 1. Continuous-learning pattern → our `simpl-memory` plugin

**What ECC does**: Stop hook → extract patterns with LLM → store locally as "instincts" → promote when confidence is high.

**What we built**: Same lifecycle (local JSONL → optional team PR → merge), but:
- **No provider HTTP calls in the plugin** — three GitHub owners (`config/simpl.json`) run `/extract-instincts`; the active Cursor/Claude session performs reasoning; `persist-instincts.js` merges rows on disk.
- Stores at `~/.claude/simpl-memory/<repo>/instincts.jsonl` — per-repo scope, not global
- Injection on SessionStart only when count ≥ 2 (avoid noise)
- Promotion via human-reviewed PR, never automatic bulk merge without review
- **Private by default**: local JSONL stays on disk until an owner runs `/share-instincts` (PR to `team-instincts/raw/<login>.jsonl` on `simpl_knowledge`). Owners merge raw files into `team-instincts/instincts.jsonl` with `/aggregate-team-instincts`. No separate `agent-instincts` repo.

Files:
- `plugins/simpl-memory/hooks/hooks.json` — SessionStart → `load-instincts.js`
- `plugins/simpl-memory/scripts/hooks/load-instincts.js` — local + team feed inject
- `plugins/simpl-memory/scripts/persist-instincts.js` — merge after `/extract-instincts`
- `plugins/simpl-memory/commands/extract-instincts.md` — owner-only capture
- `plugins/simpl-memory/commands/instinct-status.md` — `/instinct-status`
- `plugins/simpl-memory/commands/promote-instinct.md` — `/promote-instinct`
- `plugins/simpl-memory/commands/share-instincts.md` — `/share-instincts`
- `plugins/simpl-memory/commands/aggregate-team-instincts.md` — `/aggregate-team-instincts`
- `team-instincts/` — raw per-owner JSONL + merged `instincts.jsonl` in `simpl_knowledge`

### 2. Skill-create pattern → our `/skill-create` command

**What ECC does**: Analyzes git history to generate a first-draft SKILL.md for a repo.

**What we built**: Same goal, but scoped to the house style (`.agent/SKILL.md` convention, "does NOT do" section required, verify against source rules). Lives in `plugins/simpl-standards/commands/skill-create.md`.

### 3. Cross-harness hook DRY adapter → our `.cursor/hooks/adapter.js`

**What ECC does**: Cursor has more hook events than Claude Code; an adapter translates Cursor's stdin format to Claude Code's so one script works in both.

**What we built**: Same pattern, our own minimal implementation (~80 lines). The shared scripts live in `simpl_knowledge/scripts/shared-hooks/` and are called by both:
- Claude Code: directly (no adapter needed — already in native format)
- Cursor: via `.cursor/hooks/adapter.js` that translates events first

This means every new hook we write (e.g. `secret-scan.js`) **works in both tools for free**.

### 4. AgentShield → invoked as external dependency

**What ECC built**: AgentShield is a standalone npm package (`ecc-agentshield`) that scans Claude Code configs for secrets, permission issues, hook injection risks.

**What we did**: We don't maintain it, we just `npx` it in CI. This is the right level of integration for an external security tool — we get the value without coupling to the ECC release cycle. See `.github/workflows/agentshield-scan.yml`.

## Summary table

| ECC concept | Our implementation | Lines of code | Dependency on ECC |
|---|---|---|---|
| continuous-learning-v2 | `plugins/simpl-memory/` | ~200 | None (pattern only) |
| /skill-create | `plugins/simpl-standards/commands/skill-create.md` | ~60 | None |
| Cursor adapter | `.cursor/hooks/adapter.js` + `scripts/shared-hooks/` | ~200 | None |
| AgentShield | `npx ecc-agentshield` in CI | 0 (external dep) | Runtime only, pinned version |

Total code we added ≈ 500 LOC. Zero long-term coupling to ECC internals. Every pattern can be modified, forked, or removed without breaking the rest.

## When would we change this?

- **If ECC stabilizes into a maintained project with corporate backing**, consider upgrading to their implementation of continuous-learning — it has more features (confidence scoring, expiration, export/import). For now, ours is enough.
- **If AgentShield gets paywalled or abandoned**, swap for a different scanner (or write our own narrow rules).
- **If we expand beyond Claude Code + Cursor**, extend the adapter pattern to cover more harnesses (Codex, OpenCode).
