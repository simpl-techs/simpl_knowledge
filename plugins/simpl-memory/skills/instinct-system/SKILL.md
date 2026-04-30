---
name: instinct-system
description: Explains the continuous-learning / instinct system to agents. ALWAYS consult when the user asks "what did you learn", "what instincts do you have", "why did you suggest X", when responding to a SessionStart promotion-ready notification, or when deciding whether to promote a learned pattern to a real skill.
---

# The instinct system

This repo participates in **simpl-memory**, a lightweight continuous-learning layer that captures recurring patterns from coding sessions and proactively surfaces them for team-wide adoption.

## The full loop

```
┌─────────────┐   Stop hook     ┌────────────────┐
│   session   │ ──────────────▶ │ extract with   │
│   (you code)│  transcript     │ session LLM     │
└─────────────┘                 └───────┬────────┘
                                        │
                              dedup + increment count
                                        │
                                        ▼
                          ~/.claude/simpl-memory/<repo>/instincts.jsonl
                                        │
┌─────────────┐ SessionStart hook       │
│ next session│ ◀───── inject ──────────┤ (count ≥ 2, soft pref)
│  starts     │                         │
│             │ ◀── notify user ────────┤ (count ≥ 3, promotion-ready)
│             │  "💡 N patterns ready"  │
└──────┬──────┘                         │
       │ /promote-instinct              │
       │ /dismiss-instinct              │
       ▼                                │
  user reviews ───────────────────────┐ │
       │                              │ │
  writes to SKILL.md ──── commits ────┘ │
       │                                │
       ▼                                │
  marked promoted in store ─────────────┘
  (stops nagging)
```

## Category: `internal-library-usage`

Use this category when extraction notices the team **repeatedly imports or wraps the same internal simpl library** across sessions (e.g. always reaching for `simpl_tracker` for cost attribution).

- **Emerging / active instincts** nudge the agent toward that library on this repo.
- **Promotion** (via `/promote-instinct`) should usually become an update to the **library’s** `.agent/SKILL.md` (`when_to_use` / `required_when`) or a note in org docs — *not* raw instinct JSON in the marketplace. After merge, the next library sync regenerates **`catalog.md`** so every agent sees the canonical wording.

This keeps “what libraries exist and when they apply” in one place (`simpl-libraries` + catalog), while instincts remain a *signal* that something deserves a catalog or SKILL edit.

## Instinct lifecycle states

Each instinct in `instincts.jsonl` has three booleans that define its state:

| State | `count` | `promoted` | `dismissed_promotion` | Effect |
|---|---|---|---|---|
| Emerging | < 2 | false | false | Captured but not yet active |
| Active | ≥ 2 | false | false | Injected as soft preference |
| Promotion-ready | ≥ 3 | false | false | **Also triggers SessionStart notification** |
| Promoted | any | true | - | Quiet — already a real skill |
| Dismissed | any | false | true | Quiet — user said "personal-only" |

## Commands

- `/instinct-status` — show all instincts and their states
- `/promote-instinct` — turn one into a real skill (then it's marked promoted)
- `/dismiss-instinct` — silence a personal pattern (stays active locally)

## Rules for agents using this system

### When you see a SessionStart notification about promotion-ready patterns

At the very first turn of the session, include a ONE-LINE notice:

> "💡 Heads up: N learned patterns ready for promotion — run `/promote-instinct` when convenient (or `/dismiss-instinct` to silence)."

Then move on to whatever the user asked. Do not repeat in later turns. Do not belabor.

If the user replies with "let's do it" / "promote them now" / "ok", switch to `/promote-instinct` flow. If they reply with "not now" / "later" / just continue their task, respect that — no pressure.

### When injecting learned conventions

Treat them as soft preferences, not hard rules. The user can override. When they do, don't argue. When the user's explicit instruction contradicts an instinct, follow the user.

### When the user asks "why X?"

If X came from an instinct, say so plainly: "I noticed in past sessions you preferred X — that's why I defaulted to it. Happy to change."

### Never

- Never invoke the instinct system in response to sensitive data (credentials, PII, private discussions)
- Never auto-promote an instinct — promotion is a deliberate human call
- Never nag across multiple turns of one session — one notification per session max

## What it is NOT

- Not long-term memory of conversations — transcripts are NOT stored, only extracted patterns
- Not a substitute for real skills — a real skill is reviewed, versioned, documented; instincts are raw signals
- Not a replacement for `.agent/SKILL.md` — that remains the source of truth for public integration docs

## Cost

Extraction runs at most once per repo per ~5 minutes. Spend depends on the **session model** (Claude vs GPT vs DeepSeek, etc.); throttle caps frequency, not creativity.
