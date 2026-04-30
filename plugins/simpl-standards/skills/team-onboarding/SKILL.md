---
name: team-onboarding
description: Guide new team members through the full setup of simpl-knowledge (marketplace, plugins, Cursor rules, memory, AgentShield). Use when a user says "set me up", "install the simpl config", "onboard me", "how do I configure my agent", "first time setup", or asks how to get started with the team's AI tooling. ALSO use when an existing member wants to verify their setup is correct.
---

# Team onboarding wizard

Your job: walk the user through the full setup in one conversation, safely.

## 1. Detect current state

Before suggesting anything, run:

```bash
# What tools are installed?
command -v claude && claude --version || echo "Claude Code NOT installed"
command -v cursor || [ -d ~/.cursor ] && echo "Cursor detected" || echo "Cursor NOT detected"
command -v node && node --version || echo "Node NOT installed"

# Is the marketplace already added?
[ -d ~/.claude/plugins/cache/simpl-knowledge ] && echo "Marketplace already added" || echo "Marketplace NOT added"

# Any Cursor rules already installed?
ls ~/.cursor/rules/*.mdc 2>/dev/null | wc -l
```

Report what you find in 3-4 lines. Then proceed based on the gaps.

## 2. Decide the path

Three cases:

### Case A: Fresh install
Nothing set up. Run the one-command bootstrap:

```bash
curl -fsSL https://raw.githubusercontent.com/simpl/simpl-knowledge/main/scripts/team-bootstrap.sh | bash
```

Then, inside Claude Code (ask the user to do this in a new session or tell them to copy-paste):

```
/plugin marketplace add simpl/simpl-knowledge
/plugin install simpl-standards@simpl
/plugin install simpl-memory@simpl
/plugin install simpl-libraries@simpl
```

### Case B: Partial install
Only some pieces present. Install the missing ones explicitly — don't blindly re-run bootstrap, show the user exactly what will change.

### Case C: Already set up
Verify it actually works:
- Ask Claude "how do we write commit messages here?" — should cite `git-workflow`
- Check `/instinct-status` — should not crash
- Check `/plugin list` — should show simpl-standards, simpl-memory, simpl-libraries

If any fails, diagnose the specific issue.

## 3. Per-project integration plugins (`*-context`)

**Three global plugins** (install once per machine): `simpl-standards`, `simpl-memory`, `simpl-libraries`. The last one ships the auto-generated **`catalog.md`** of every internal integration library so agents know what exists before reimplementing.

**Integration plugins** (e.g. `simpl_tracker-context`) load the *full* SKILL for one library. They are still per-project in practice: install when the task needs that depth. The agent should read `catalog.md` (via `internal-libraries-awareness`) and **propose** the right `/plugin install …@simpl` — the human does not need to guess.

Example after the agent matches a task to a catalog entry:

```
/plugin install simpl_tracker-context@simpl
/plugin install <other-lib>-context@simpl
```

If they mention a library that doesn't exist in the marketplace yet, that's a signal: the library owner should use the `repo-context-bootstrap` skill or `/bootstrap-repo-context` (or `bash ~/.claude/plugins/cache/simpl-knowledge/library-repo-template/scripts/bootstrap.sh <name>`) to scaffold and publish it.

## 4. Memory layer (simpl-memory)

Install **`simpl-memory` with the other global plugins** — it is required for the team stack. The Stop hook sends session transcripts to whichever **LLM matches your current session** (Claude, GPT, DeepSeek, …); you only need the matching provider key in your shell:

```bash
# Use the one that matches the model you actually run in Cursor / Claude Code:
export ANTHROPIC_API_KEY="sk-ant-..."
# or
export OPENAI_API_KEY="sk-..."
# or
export DEEPSEEK_API_KEY="..."
# Optional single shared key for all providers in this hook:
export SIMPL_MEMORY_API_KEY="..."
```

Without a key for the active provider, instinct extraction skips silently (the plugin still loads for SessionStart and commands).

## 5. Optional: AgentShield security audit

Before ending, offer to run a one-time audit:

```bash
npx ecc-agentshield scan
```

Takes ~10s, flags insecure configs in the current setup. Read the report together with the user.

## 6. Confirm and send them off

End with:

> "You're set up. Test it: in any project, ask your agent 'how do we write commit messages here?' — it should reference our git-workflow skill. If it doesn't, ping me (the onboarder) and we'll diagnose.
>
> Weekly, run `/plugin marketplace update` to pick up the latest team changes."

## Rules

- NEVER modify the user's shell rc files without asking first
- NEVER leak their API key to anything other than the env var
- If the user is on Windows, use PowerShell equivalents (`$env:CLAUDE_PACKAGE_MANAGER`, `Copy-Item -Recurse`, etc.)
- If anything fails, don't pretend it worked — show the error and help them debug
