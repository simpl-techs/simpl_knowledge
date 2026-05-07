---
name: refresh-cursor-rules
description: Force-refresh the local Cursor rules cache (~/.cursor/rules/simpl-*.mdc) from the latest cursor-rules-rolling release on simpl_knowledge. Use after editing a SKILL.md and pushing, when you don't want to wait for the 6h throttle.
---

# /refresh-cursor-rules

Skip the 6h `session-refresh` throttle and pull the freshest `simpl-*.mdc` from the GitHub release.

Run:

```bash
curl -fsSL -L https://github.com/simpl-techs/simpl_knowledge/releases/download/cursor-rules-rolling/cursor-rules.zip -o /tmp/simpl-cursor-rules.zip \
  && unzip -o -q /tmp/simpl-cursor-rules.zip -d ~/.cursor/rules/ \
  && rm /tmp/simpl-cursor-rules.zip \
  && ls ~/.cursor/rules/simpl-*.mdc
```

Then reload the Cursor window (or open a new chat) for the rules to take effect.

Note: when CWD is the `simpl_knowledge` repo itself, the throttle is auto-bypassed at every sessionStart, so this command is mostly for use from other repos right after pushing a SKILL change.
