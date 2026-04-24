# How to write a good SKILL.md for our team

This guide is the **simpl house style** for agent-facing documentation. Read it before drafting a new `SKILL.md` or meaningfully editing one.

## The two files convention

Every library repo has two files in `.agent/`:

- **`SKILL.md`** — the *public* face of the repo. What agents of *other* teammates need to know to consume, integrate, or call your library. Distributed via the marketplace.
- **`INTERNAL.md`** — the *private* face. Conventions, architecture, gotchas, testing patterns that apply only when writing code *inside* this repo. Stays local.

Different audiences, different voices.

## Why `description` is 70% of the work

The `description:` field in the YAML frontmatter is how the agent decides *whether to load* your skill at all. If it's vague, the skill never triggers and nobody benefits from the work you did in the body.

**Anti-pattern** (too brief, no trigger cues):
```yaml
description: Docs for the tracker library.
```

**Good pattern** (explicit about when to use, anticipates paraphrases):
```yaml
description: |
  Use this skill whenever the user asks to track events, log analytics,
  record user actions, implement telemetry, or integrate with our internal
  `simple-tracker` library. ALWAYS consult this skill before writing any
  code that calls `simple_tracker`, imports it, or adds new event types —
  even when the user doesn't mention the library by name. Triggers on
  phrases like "track this", "log when user does X", "add analytics",
  "instrument this endpoint", "record event", "telemetry".
```

Rules of thumb:
- Start with "Use this skill when..." or "ALWAYS consult when...".
- List 4-6 paraphrases the user might actually use, in their words, not yours.
- Name the library/component explicitly so keyword match works.
- Err on the side of "pushy" — current models tend to *under*-trigger skills.

## Integration plugins (`*-context`): catalog frontmatter

Skills mirrored under `simpl-knowledge/plugins/<repo>-context/` feed the org-wide **`catalog.md`** (via `scripts/ci/generate-catalog.js`, run after each library sync). Add these YAML fields *in addition to* `name` and `description`:

```yaml
summary: |
  One or two sentences: what the library does and what it explicitly does not do.
when_to_use: |
  When another agent should reach for this library (problem shapes, stacks, triggers).
required_when: |
  Optional. Plain-language conditions where using this library is mandatory for compliance
  (e.g. cost attribution for API usage). Omit the key entirely if nothing is mandatory.
```

If `summary` / `when_to_use` / `required_when` are missing, the generator falls back to `description` and the first heading in the body — but explicit fields keep the catalog stable and scannable.

## Structure of the body

Our house style:

1. **One-line summary** at the top of the body (not frontmatter). "What this thing is in one sentence."
2. **Installation / how to import** if applicable.
3. **The 90% case** — the one code snippet that covers most usage. Keep it minimal.
4. **Rules and conventions** — what's strict, what's flexible.
5. **Common pitfalls** — the actual bugs your colleagues have hit. Past tense: "Don't do X because Y happened last time."
6. **Testing** — how consumers test code that depends on this.
7. **What this does NOT do** — boundaries matter as much as capabilities. Prevent the agent from forcing your library into the wrong problem.
8. **Where to go next** — source repo, slack owner, adjacent skills.

## Length discipline

Keep `SKILL.md` under **400 lines**. If you need more, split into reference files in `.agent/references/` and link to them with "Read `references/X.md` when...".

The spec supports this via progressive disclosure — the body loads when the skill triggers, references load only when explicitly requested. This is how we keep token usage sane.

## Examples over explanations

Agents learn from code patterns faster than from prose. Every rule should have a code example. Prefer:

```python
# ❌ don't
tracker = Tracker()  # inside a request handler — reallocates per request

# ✅ do
# module-level singleton
tracker = Tracker.from_env()
```

over:

> You should not instantiate the Tracker inside a request handler, because it reallocates per request. Instead, create a module-level singleton.

## Language

- Imperative. "Do X", not "You might want to X."
- Second person or omitted subject. Not "the user".
- Drop filler. "In order to" → "to". "At this point in time" → "now".
- When a rule has no exceptions, say so: "NEVER", "ALWAYS".
- When a rule has exceptions, give examples of both sides.

## What not to put in SKILL.md

- Marketing copy ("Our tracker is the best-in-class solution...")
- Roadmap and future features — they confuse agents about what exists today
- Full API reference — link to the source or generated docs instead
- Long architecture rationale — goes in `docs/` for humans; `SKILL.md` is for building *with* the library, not understanding its internals

## When to update

Update `SKILL.md` when any of these happen, BEFORE merging:

- Public API signature changes
- A new event type / endpoint / entry-point is added
- A pattern that was "suggested" becomes "required" (or vice versa)
- A common misuse you saw in code review needs to become an explicit warning
- Installation / setup changes

The automated workflow (`auto-update-skill.yml`) will catch most of these but the fastest update loop is: if you felt you had to explain something in a code review, that's a sign the skill needs that explanation too.

## Testing your skill

Open a fresh Claude Code session in a different repo. Ask a question that *should* trigger your skill ("how do I track a login event?"). Check whether the skill loaded (Claude will usually cite it).

If it didn't load, the `description` is the problem, not the body. Go back and add more trigger phrases.
