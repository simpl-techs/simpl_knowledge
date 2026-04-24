# Cost / benefit at a glance

## What this setup gives you

| Outcome | How it's achieved |
|---|---|
| Team-wide consistency in AI-generated code | `simpl-standards` skills install on every dev's machine |
| Zero-friction sharing of integration knowledge | Marketplace + auto-sync PRs |
| Drift resistance | Weekly auto-generation job proposes SKILL.md updates |
| Token efficiency | Progressive disclosure — skills load only when triggered |
| Multi-tool support | Same SKILL.md source → Claude plugins + Cursor zip (`cursor-rules-rolling` release) |
| No central gatekeeper | Each repo owner updates their own SKILL.md as part of their PR |

## Cost per month (5-person team, ~10 library repos)

| Item | Cost |
|---|---|
| GitHub Actions minutes | $0 (well within free tier) |
| Anthropic API for auto-update (Sonnet, weekly per repo) | ~$6-12 |
| Storage / hosting | $0 |
| **Total recurring** | **~$10/month** |

## Cost in engineer time

| Item | Time |
|---|---|
| Initial bootstrap (first repo + marketplace) | ~4-8 hours, one person |
| Onboarding each additional library | ~1 hour (copy template, write first SKILL.md) |
| Weekly review of auto-generated PRs | ~10-15 min, shared |
| Per-feature SKILL.md update via `/update-skill` | ~1-3 min, done by the PR author |

## What this setup does NOT solve

- **Quality of the first SKILL.md draft** — writing a great skill requires actual thought about what consumers need. The auto-update can refine a good skill, but it can't bootstrap one from nothing meaningful.
- **Code review culture** — if your team doesn't review auto-generated PRs, garbage will accumulate. This is a process discipline question, not a tooling one.
- **Multi-language codebases with exotic stacks** — the template examples skew Python/TS. If you have Rust + Go + Elixir, you'll rewrite the coding-standards skill for each stack.
- **Prompt injection through SKILL.md** — skills are trusted inputs. If someone compromises the marketplace repo, they can inject instructions into every agent. Protect it with the same rigor as production code (branch protection, required reviews).

## Alternatives you're NOT choosing, and why

| Approach | Why not |
|---|---|
| Single central wiki / Notion | Drifts from code instantly, no progressive disclosure, token-heavy to feed into agents |
| Git submodule in every repo | Operational friction (submodule sync), Claude Code can't traverse submodules |
| Monorepo for everything | Too invasive, disrupts current workflows, months-long migration |
| Individual CLAUDE.md per dev | The exact problem described in our starting conversation — inconsistent and drifts |
| Buy a SaaS for AI governance | Expensive, lock-in, and the open-source pattern is mature enough now |

## Graduation path (when to invest more)

You can stop at this Option 3 setup for months or years. Consider next-step investments only if:

- **Team grows past ~15 devs** → switch to the Anthropic Cowork private marketplace with admin controls
- **Compliance / audit requirements** → add hooks for logging every agent action and OPA-style policy enforcement
- **Cross-org sharing with partners** → publish a sanitized subset as a public marketplace
- **Generated SKILL.md quality becomes a bottleneck** → add an eval harness (see `skill-creator` Anthropic skill) to automatically A/B test skill descriptions
