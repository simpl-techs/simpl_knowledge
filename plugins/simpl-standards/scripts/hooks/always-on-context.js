#!/usr/bin/env node
/**
 * always-on-context.js — Claude Code SessionStart: the always-on simpl skills.
 *
 * Cursor (alwaysApply) and Codex (AGENTS.md "Always read these") already get
 * them. Claude Code opens a skill only when its description matches the request,
 * so this hook injects the `every_session` skill bodies, names the
 * `coding_start` skills to open before coding work and the `coding_on_demand`
 * ones to open per area. The lists live in always-on.json, which also drives
 * alwaysApply in the Cursor rules.
 *
 * Synchronous on purpose: async hook output reaches the session after the first
 * turn.
 *
 * Output: Claude SessionStart JSON with hookSpecificOutput.additionalContext.
 */

const fs = require('node:fs');
const path = require('node:path');

const PLUGIN_ROOT = path.join(__dirname, '..', '..');

const lists = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'always-on.json'), 'utf8'));

const bodies = lists.every_session.map((name) =>
  fs
    .readFileSync(path.join(PLUGIN_ROOT, 'skills', name, 'SKILL.md'), 'utf8')
    .replace(/^---\n[\s\S]*?\n---\n/, '')
    .trim(),
);

const names = (list) => list.map((name) => `\`${name}\``).join(', ');

const coding = [
  '# simpl standards in coding sessions',
  '',
  `When the task writes, changes or reviews code, tests, git history or infrastructure, open these skills before you start (Skill tool): ${names(lists.coding_start)}.`,
  `Open the others before you act in their area (their descriptions and the routing table in \`coding-standards\` say when): ${names(lists.coding_on_demand)}.`,
  'Skip all of them for writing, design, research or chat.',
].join('\n');

process.stdout.write(
  `${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: ['[simpl_knowledge always-on context]', ...bodies, coding].join('\n\n'),
    },
  })}\n`,
);
