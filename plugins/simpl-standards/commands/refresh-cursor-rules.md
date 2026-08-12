---
name: refresh-cursor-rules
description: Force-refresh the local Cursor rules cache (~/.cursor/rules/simpl-*.mdc) from the latest cursor-rules-rolling release on simpl_knowledge. Use after editing a SKILL.md and pushing, when you don't want to wait for the next sha-based session-refresh.
---

# /refresh-cursor-rules

Bypass the sha-based `session-refresh` skip and pull the freshest `simpl-*.mdc` from the GitHub release.

Run:

```bash
SIMPL_KNOWLEDGE_FORCE_REFRESH=1 node ~/.cursor/hooks/shared-hooks/session-refresh.js
# or, if shared-hooks is not installed yet:
curl -fsSL -L https://github.com/simpl-techs/simpl_knowledge/releases/download/cursor-rules-rolling/cursor-rules.zip -o /tmp/simpl-cursor-rules.zip \
  && unzip -o -q /tmp/simpl-cursor-rules.zip -d /tmp/simpl-cursor-rules \
  && cp -f /tmp/simpl-cursor-rules/cursor-rules/simpl-*.mdc ~/.cursor/rules/ 2>/dev/null \
  || cp -f /tmp/simpl-cursor-rules/simpl-*.mdc ~/.cursor/rules/ \
  && rm -rf /tmp/simpl-cursor-rules /tmp/simpl-cursor-rules.zip \
  && ls ~/.cursor/rules/simpl-*.mdc
```

Then open a new chat for the rules to take effect. Diagnose with `bash scripts/doctor.sh` from a `simpl_knowledge` clone.

Note: when CWD is the `simpl_knowledge` repo itself, refresh is always forced at sessionStart.
