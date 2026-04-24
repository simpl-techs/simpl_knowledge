#!/usr/bin/env node
/**
 * load-instincts.js — SessionStart hook.
 *
 * Does two things:
 *
 *  1. Injects high-confidence instincts (count >= 2) into the session as
 *     soft preferences, so the agent benefits from past learning.
 *
 *  2. If any instincts are "promotion-ready" (count >= 3, not yet
 *     promoted, not dismissed), prepends a visible notification that
 *     instructs Claude to prompt the user about them at the start of
 *     the session — so the dev is reminded without having to remember
 *     to run /instinct-status.
 *
 * Output format per Claude Code SessionStart hook spec: JSON to stdout
 * with hookSpecificOutput.additionalContext string.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execSync } = require('node:child_process');

function main() {
  let repoRoot;
  try {
    repoRoot = execSync('git rev-parse --show-toplevel', { cwd: process.cwd(), encoding: 'utf8' }).trim();
  } catch {
    return;
  }
  const repoName = path.basename(repoRoot);
  const storeFile = path.join(os.homedir(), '.claude', 'simpl-memory', repoName, 'instincts.jsonl');

  if (!fs.existsSync(storeFile)) return;

  const allInstincts = fs.readFileSync(storeFile, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);

  // "Active" = not already promoted to a real skill, not dismissed by the dev
  const active = allInstincts.filter((i) => !i.promoted && !i.dismissed_promotion);

  const promotionReady = active
    .filter((i) => (i.count || 0) >= 3)
    .sort((a, b) => (b.count || 0) - (a.count || 0));

  const forContext = active
    .filter((i) => (i.count || 0) >= 2)
    .sort((a, b) => (b.count || 0) - (a.count || 0))
    .slice(0, 15);

  if (forContext.length === 0 && promotionReady.length === 0) return;

  const sections = [];

  // Section 1 — user-visible notification (comes FIRST so Claude notices it).
  if (promotionReady.length > 0) {
    const n = promotionReady.length;
    const plural = n === 1 ? '' : 's';
    const examples = promotionReady.slice(0, 3)
      .map((i) => `  • [${i.category}] ${i.pattern}`)
      .join('\n');
    const more = n > 3 ? `\n  … and ${n - 3} more` : '';

    sections.push([
      '📢 TEAM-LEARNING NOTIFICATION — HIGH PRIORITY',
      '',
      `${n} learned pattern${plural} on this repo ${n === 1 ? 'is' : 'are'} ready to be promoted to a shared skill. Examples:`,
      '',
      examples + more,
      '',
      'INSTRUCTION: At the very start of your first reply in this session, before addressing the user\'s task, include a brief one-line notice like:',
      '',
      `  "💡 Heads up: ${n} learned pattern${plural} ready for promotion — run \`/promote-instinct\` when convenient (or \`/dismiss-instinct\` to silence)."`,
      '',
      'Then continue normally with the user\'s actual request. Do NOT belabor this — one sentence, then move on. Do not repeat this notice in later turns of the same session.',
      '',
      '---',
      '',
    ].join('\n'));
  }

  // Section 2 — context for the agent's reference (soft preferences).
  if (forContext.length > 0) {
    sections.push([
      `## Learned conventions for ${repoName}`,
      '',
      'These patterns have been observed repeatedly in past sessions on this repo. Treat them as soft preferences — the user may override, but default to these unless told otherwise:',
      '',
      ...forContext.map((i, idx) => {
        const readyTag = (i.count || 0) >= 3 ? ' *(promotion-ready)*' : '';
        return `${idx + 1}. **${i.category}**${readyTag}: ${i.pattern}\n   → ${i.suggestion}`;
      }),
      '',
    ].join('\n'));
  }

  const raw = sections.join('\n');
  const additionalContext = sanitizeAgentContext(raw);

  const output = {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext,
    },
  };

  process.stdout.write(JSON.stringify(output));
}

/** Strip control chars and cap size injected into the model context. */
function sanitizeAgentContext(s) {
  return String(s)
    .replace(/[^\n\r\t\x20-\x7E]/g, '')
    .slice(0, 8000);
}

try { main(); } catch { /* fail silently — never break the session */ }
