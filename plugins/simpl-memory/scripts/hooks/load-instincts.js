#!/usr/bin/env node
/**
 * load-instincts.js — SessionStart hook.
 *
 * Does:
 *  1. Injects team-wide patterns from simpl-knowledge cache (`team-instincts/instincts.jsonl`), if present.
 *  2. Injects high-confidence local instincts (count >= 2) into the session as soft preferences.
 *  3. If any local instincts are promotion-ready (count >= 3, not promoted, not dismissed),
 *     prepends a visible notification for Claude to mention /promote-instinct once.
 *
 * Output format per Claude Code SessionStart hook spec: JSON to stdout
 * with hookSpecificOutput.additionalContext string.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execSync } = require('node:child_process');

const TEAM_INSTINCTS_PATH = path.join(
  os.homedir(),
  '.claude/plugins/cache/simpl-knowledge',
  'team-instincts',
  'instincts.jsonl',
);

/**
 * @returns {string|null}
 */
function gitRepoBasename() {
  try {
    return execSync('git rev-parse --show-toplevel', { cwd: process.cwd(), encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

/**
 * @param {string} filePath
 * @returns {any[]}
 */
function readJsonlStore(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * Team feed threshold: same idea as local (>=2) but uses team_count when set.
 * @param {Record<string, any>} row
 */
function teamScore(row) {
  const n = row.team_count ?? row.count ?? 0;
  return Number(n) || 0;
}

function main() {
  const repoRoot = gitRepoBasename();
  if (!repoRoot) return;
  const repoName = path.basename(repoRoot);
  const localStoreFile = path.join(os.homedir(), '.claude', 'simpl-memory', repoName, 'instincts.jsonl');

  const localAll = readJsonlStore(localStoreFile);
  const activeLocal = localAll.filter((i) => !i.promoted && !i.dismissed_promotion);

  const promotionReady = activeLocal
    .filter((i) => (i.count || 0) >= 3)
    .sort((a, b) => (b.count || 0) - (a.count || 0));

  const forContextLocal = activeLocal
    .filter((i) => (i.count || 0) >= 2)
    .sort((a, b) => (b.count || 0) - (a.count || 0))
    .slice(0, 15);

  const localHashes = new Set(activeLocal.map((i) => i.hash).filter(Boolean));

  const teamAll = readJsonlStore(TEAM_INSTINCTS_PATH);
  const teamForContext = teamAll
    .filter((i) => !i.promoted && teamScore(i) >= 2 && i.hash)
    .filter((i) => !localHashes.has(i.hash))
    .sort((a, b) => teamScore(b) - teamScore(a))
    .slice(0, 15);

  if (forContextLocal.length === 0 && promotionReady.length === 0 && teamForContext.length === 0) return;

  const sections = [];

  // Section 0 — team-wide (before local so org conventions surface first)
  if (teamForContext.length > 0) {
    sections.push(
      [
        '## Team-wide patterns',
        '',
        'Aggregated from `simpl-knowledge/team-instincts` (shared via PR). Treat as soft preferences unless the user overrides:',
        '',
        ...teamForContext.map((i, idx) => {
          const score = teamScore(i);
          const nc = Array.isArray(i.contributors) ? i.contributors.length : 0;
          const tag = nc > 0 ? ` *[team, contributors=${nc}, score=${score}]*` : ` *[team, score=${score}]*`;
          return `${idx + 1}. **${i.category || 'general'}**${tag}: ${i.pattern}\n   → ${i.suggestion}`;
        }),
        '',
      ].join('\n'),
    );
  }

  // Section 1 — user-visible notification (local promotion)
  if (promotionReady.length > 0) {
    const n = promotionReady.length;
    const plural = n === 1 ? '' : 's';
    const examples = promotionReady
      .slice(0, 3)
      .map((i) => `  • [${i.category}] ${i.pattern}`)
      .join('\n');
    const more = n > 3 ? `\n  … and ${n - 3} more` : '';

    sections.push(
      [
        '📢 TEAM-LEARNING NOTIFICATION — HIGH PRIORITY',
        '',
        `${n} learned pattern${plural} on this repo ${n === 1 ? 'is' : 'are'} ready to be promoted to a shared skill. Examples:`,
        '',
        examples + more,
        '',
        "INSTRUCTION: At the very start of your first reply in this session, before addressing the user's task, include a brief one-line notice like:",
        '',
        `  "💡 Heads up: ${n} learned pattern${plural} ready for promotion — run \`/promote-instinct\` when convenient (or \`/dismiss-instinct\` to silence)."`,
        '',
        "Then continue normally with the user's actual request. Do NOT belabor this — one sentence, then move on. Do not repeat this notice in later turns of the same session.",
        '',
        '---',
        '',
      ].join('\n'),
    );
  }

  // Section 2 — local context
  if (forContextLocal.length > 0) {
    sections.push(
      [
        `## Learned conventions for ${repoName}`,
        '',
        'These patterns have been observed repeatedly in past sessions on this repo. Treat them as soft preferences — the user may override, but default to these unless told otherwise:',
        '',
        ...forContextLocal.map((i, idx) => {
          const readyTag = (i.count || 0) >= 3 ? ' *(promotion-ready)*' : '';
          return `${idx + 1}. **${i.category}**${readyTag}: ${i.pattern}\n   → ${i.suggestion}`;
        }),
        '',
      ].join('\n'),
    );
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

try {
  main();
} catch {
  /* fail silently — never break the session */
}
