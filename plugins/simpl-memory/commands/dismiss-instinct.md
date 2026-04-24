---
name: dismiss-instinct
description: Silence an instinct that is personal-only and should not be promoted to the team. The instinct stays active locally (agent keeps using it) but stops appearing in the promotion-ready notifications.
---

# /dismiss-instinct

Use when the user wants an instinct to:
- Keep helping their personal sessions (no delete)
- Stop nagging them about promoting it (set `dismissed_promotion: true`)

Typical triggers: "it's a personal preference", "this is just how I like it", "don't promote this one", "silence this".

## Process

1. Show current promotion-ready instincts to the user:

```bash
node -e '
const fs = require("fs"), path = require("path"), os = require("os");
const { execSync } = require("child_process");
let repo;
try { repo = path.basename(execSync("git rev-parse --show-toplevel", {encoding:"utf8"}).trim()); } catch { process.exit(0); }
const f = path.join(os.homedir(), ".claude/simpl-memory", repo, "instincts.jsonl");
if (!fs.existsSync(f)) { console.log("no instincts"); process.exit(0); }
const rows = fs.readFileSync(f,"utf8").split("\n").filter(Boolean).map(JSON.parse)
  .filter(r => (r.count||0) >= 3 && !r.promoted && !r.dismissed_promotion);
rows.forEach((r, i) => {
  console.log(`${i+1}. [${r.hash}] [${r.category}] ${r.pattern}`);
  console.log(`   → ${r.suggestion}`);
});
'
```

2. Ask the user which ones to dismiss: "Which numbers (or hashes) should I silence? Reply with a comma-separated list, or `all`."

3. Apply the dismissal by rewriting `instincts.jsonl` with the `dismissed_promotion: true` field set on the selected rows:

```bash
# Example for dismissing hashes h1,h2,h3:
node -e '
const fs = require("fs"), path = require("path"), os = require("os");
const { execSync } = require("child_process");
const hashes = new Set(["h1","h2","h3"]);  // replace with actual hashes
const repo = path.basename(execSync("git rev-parse --show-toplevel", {encoding:"utf8"}).trim());
const f = path.join(os.homedir(), ".claude/simpl-memory", repo, "instincts.jsonl");
const rows = fs.readFileSync(f,"utf8").split("\n").filter(Boolean).map(JSON.parse);
for (const r of rows) {
  if (hashes.has(r.hash)) { r.dismissed_promotion = true; r.dismissed_at = new Date().toISOString(); }
}
fs.writeFileSync(f, rows.map(r => JSON.stringify(r)).join("\n") + "\n");
console.log(`Dismissed ${hashes.size} instinct(s). They stay active locally but won\u2019t be flagged for promotion.`);
'
```

4. Confirm: "Done. These instincts will keep shaping your local sessions, but you won't get promotion reminders for them anymore."

## Important

- `/dismiss-instinct` does NOT delete. The pattern keeps influencing the user's agent. Only the nag goes away.
- To actually delete (e.g. it's wrong), use a different approach: ask the user and manually remove the row from `~/.claude/simpl-memory/<repo>/instincts.jsonl`.
- Dismissed instincts can be un-dismissed: the user can edit the file and set `dismissed_promotion: false`. But this is rare; usually dismiss means "forever".
