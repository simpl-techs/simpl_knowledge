---
name: instinct-status
description: Show the learned patterns (instincts) that simpl-memory has captured for the current repo, with their status (active, promotion-ready, promoted, dismissed).
---

# /instinct-status

Inspect the continuous-learning state for this repo.

Execute:

```bash
node -e '
const fs = require("fs"), path = require("path"), os = require("os");
const { execSync } = require("child_process");
let repo;
try { repo = path.basename(execSync("git rev-parse --show-toplevel", {encoding:"utf8"}).trim()); }
catch { console.log("Not in a git repo."); process.exit(0); }
const f = path.join(os.homedir(), ".claude/simpl-memory", repo, "instincts.jsonl");
if (!fs.existsSync(f)) { console.log(`No instincts captured for ${repo} yet.`); process.exit(0); }
const rows = fs.readFileSync(f,"utf8").split("\n").filter(Boolean).map(JSON.parse);
rows.sort((a,b)=>(b.count||0)-(a.count||0));

const promoted = rows.filter(r => r.promoted);
const dismissed = rows.filter(r => r.dismissed_promotion && !r.promoted);
const active = rows.filter(r => !r.promoted && !r.dismissed_promotion);
const ready = active.filter(r => (r.count||0) >= 3);
const nascent = active.filter(r => (r.count||0) < 3);

console.log(`\n=== Instincts for ${repo} ===`);
console.log(`  Active: ${active.length}   Promotion-ready: ${ready.length}   Promoted: ${promoted.length}   Dismissed: ${dismissed.length}\n`);

if (ready.length > 0) {
  console.log("🟢 PROMOTION-READY (run /promote-instinct):\n");
  ready.forEach(r => {
    console.log(`  [${r.hash}] [${r.category}] (count=${r.count}) ${r.pattern}`);
    console.log(`     → ${r.suggestion}\n`);
  });
}

if (nascent.length > 0) {
  console.log("🟡 EMERGING (need more observations, still shaping your agent locally):\n");
  nascent.forEach(r => {
    console.log(`  [${r.hash}] [${r.category}] (count=${r.count}) ${r.pattern}`);
  });
  console.log();
}

if (promoted.length > 0) {
  console.log(`✓ PROMOTED (already live in a skill, ${promoted.length} total):\n`);
  promoted.slice(0, 5).forEach(r => {
    const when = r.promoted_at ? r.promoted_at.slice(0,10) : "?";
    console.log(`  [${r.category}] ${r.pattern}  (promoted ${when})`);
  });
  if (promoted.length > 5) console.log(`  … and ${promoted.length - 5} more\n`);
  else console.log();
}

if (dismissed.length > 0) {
  console.log(`🔕 DISMISSED (personal-only, ${dismissed.length} total):\n`);
  dismissed.slice(0, 5).forEach(r => {
    console.log(`  [${r.category}] ${r.pattern}`);
  });
  if (dismissed.length > 5) console.log(`  … and ${dismissed.length - 5} more\n`);
  else console.log();
}
'
```

Then summarize conversationally:
- How many instincts total, and in each bucket
- If `PROMOTION-READY > 0`, gently nudge toward `/promote-instinct`
- If something looks wrong or out of place, offer to help investigate or `/dismiss-instinct`

## Meaning of each state

- **🟡 Emerging** (count < 3): pattern observed once or twice. Already influencing your local sessions if count ≥ 2. Not yet mature enough to suggest promotion.
- **🟢 Promotion-ready** (count ≥ 3, not promoted, not dismissed): observed repeatedly. You'll get a SessionStart reminder about these until you promote them or dismiss them.
- **✓ Promoted**: already written into a skill. The store keeps a record so we know not to nag again.
- **🔕 Dismissed**: the dev said "this is personal, don't promote". Still active locally, but silenced in promotion flows.
