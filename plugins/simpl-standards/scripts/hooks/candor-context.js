#!/usr/bin/env node
/**
 * candor-context.js — Claude Code SessionStart: inject the candor skill body.
 *
 * Cursor (alwaysApply) and Codex (AGENTS.md "Always read these") already get
 * always-on skills. Claude Code opens a skill only when its description matches
 * the request, and a rule about how to answer matches no request in particular.
 *
 * Synchronous on purpose: async hook output reaches the session after the first
 * turn. The skill file stays the single source of truth.
 *
 * Output: Claude SessionStart JSON with hookSpecificOutput.additionalContext.
 */

const fs = require('node:fs');
const path = require('node:path');

const SKILL = path.join(__dirname, '..', '..', 'skills', 'candor', 'SKILL.md');

const body = fs.readFileSync(SKILL, 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '').trim();

process.stdout.write(
  `${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: `[simpl-standards/candor, always on]\n\n${body}`,
    },
  })}\n`,
);
