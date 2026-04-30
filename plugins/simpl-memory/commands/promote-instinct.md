---
name: promote-instinct
description: Promote a learned instinct (or all promotion-ready ones) into a real SKILL.md in this repo or into simpl-knowledge (simpl-standards), and mark it as promoted so it stops appearing in reminders.
---

# /promote-instinct

An instinct that has been observed repeatedly (count ≥ 3) across multiple sessions is a candidate for promotion to a real, versioned skill.

Usually this command is triggered by a SessionStart notification ("💡 N patterns ready for promotion"). It can also be run proactively.

## Workflow

### 1. List promotion-ready instincts

```bash
node -e '
const fs = require("fs"), path = require("path"), os = require("os");
const { execSync } = require("child_process");
let repo;
try { repo = path.basename(execSync("git rev-parse --show-toplevel", {encoding:"utf8"}).trim()); }
catch { console.log("Not in a git repo."); process.exit(0); }
const f = path.join(os.homedir(), ".claude/simpl-memory", repo, "instincts.jsonl");
if (!fs.existsSync(f)) { console.log("No instincts."); process.exit(0); }
const rows = fs.readFileSync(f,"utf8").split("\n").filter(Boolean).map(JSON.parse)
  .filter(r => (r.count||0) >= 3 && !r.promoted && !r.dismissed_promotion);
if (rows.length === 0) { console.log("No promotion-ready instincts."); process.exit(0); }
console.log(`Found ${rows.length} promotion-ready instinct(s):\n`);
rows.forEach((r, i) => {
  console.log(`${i+1}. [${r.hash}] [${r.category}] (count=${r.count})`);
  console.log(`   Pattern:    ${r.pattern}`);
  console.log(`   Suggestion: ${r.suggestion}`);
  console.log();
});
'
```

### 2. Ask the user one at a time

For each promotion-ready instinct, go through three questions WITH the user:

**Q1: Is this real and worth sharing?**
- "Yes, and it's org-wide" → target = `plugins/simpl-standards/skills/<n>/SKILL.md` (in `simpl-techs/simpl-knowledge`)
- "Yes, but only relevant if integrating THIS repo" → target = `.agent/SKILL.md` in current repo
- "Yes, but it's only relevant when working INSIDE this repo" → target = `.agent/INTERNAL.md` in current repo
- "No, it's a personal thing" → use `/dismiss-instinct` instead
- "No, it's wrong" → offer to delete from the local store

**Q2: What's the right wording?**
Transform the raw instinct into house style:
- Imperative voice ("Use X" not "You might want to use X")
- Concrete code example where possible
- Reason why ("because Y"), not just rule
- Under 6 lines of prose

**Q3: What section?**
Pick the right existing section in the target file:
- Pitfalls / "Don't"
- Rules / conventions
- Installation / setup
- Testing
- Create a new section only if necessary

### 3. Write the promotion

Edit the target file. Add the promoted content. Show the diff to the user for approval BEFORE committing.

### 4. CRITICAL — mark as promoted in the store

Once the user approves the edit, mark the instinct as promoted so:
- It won't show up in future SessionStart notifications
- `/instinct-status` will label it with ✓ promoted

```bash
node -e '
const fs = require("fs"), path = require("path"), os = require("os");
const { execSync } = require("child_process");
const hashes = new Set(["HASH_1","HASH_2"]);  // REPLACE with actual hashes from step 1
const repo = path.basename(execSync("git rev-parse --show-toplevel", {encoding:"utf8"}).trim());
const f = path.join(os.homedir(), ".claude/simpl-memory", repo, "instincts.jsonl");
const rows = fs.readFileSync(f,"utf8").split("\n").filter(Boolean).map(JSON.parse);
for (const r of rows) {
  if (hashes.has(r.hash)) {
    r.promoted = true;
    r.promoted_at = new Date().toISOString();
  }
}
fs.writeFileSync(f, rows.map(r => JSON.stringify(r)).join("\n") + "\n");
console.log(`Marked ${hashes.size} instinct(s) as promoted.`);
'
```

### 5. Commit

```bash
git add <target files>
git commit -m "docs(agent): promote learned pattern — <short description>"
```

The library repo’s sync workflow will open a PR on `simpl-techs/simpl-knowledge` automatically on merge (when the change includes `.agent/SKILL.md`).

## Design rules

- **Never auto-promote.** Each promotion is an explicit human decision.
- **Never skip the user review step.** Instincts can be subtly wrong or session-specific.
- **Always mark as promoted after writing.** Otherwise the user gets nagged again on next session.
- **One promotion at a time is usually better than bulk.** If the user wants to do 5 at once, fine, but go through each carefully — this is high-signal content going into a shared resource.
