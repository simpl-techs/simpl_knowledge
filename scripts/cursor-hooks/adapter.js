#!/usr/bin/env node
/**
 * adapter.js — Cursor → Claude Code hook event adapter.
 *
 * Canonical copy: simpl_knowledge/scripts/cursor-hooks/adapter.js
 * (simpl_knowledge/library-repo-template mirrors this file under .cursor/hooks/adapter.js.)
 *
 * Cursor and Claude Code both support hooks but use different event names
 * and payload shapes. This adapter normalizes Cursor's stdin JSON to
 * Claude Code's format so we can share one set of hook scripts
 * (in simpl_knowledge/scripts/shared-hooks/) across both tools.
 *
 * Usage (called by Cursor via .cursor/hooks.json):
 *
 *   {
 *     "beforeShellExecution": {
 *       "command": "node .cursor/hooks/adapter.js secret-scan"
 *     }
 *   }
 *
 * Arg 1 is the script name to invoke from the shared hooks directory.
 * The shared directory is resolved by (in order):
 *   1. SIMPL_SHARED_HOOKS env var
 *   2. ~/.claude/plugins/cache/simpl_knowledge/scripts/shared-hooks/
 *   3. ~/.simpl_knowledge/cache/scripts/shared-hooks/
 *   4. Built-in fallback (this file's sibling `shared-hooks/` if copied here)
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

const CURSOR_TO_CLAUDE = {
  // Cursor event → Claude Code event
  beforeShellExecution: 'PreToolUse',
  afterShellExecution: 'PostToolUse',
  beforeFileEdit: 'PreToolUse',
  afterFileEdit: 'PostToolUse',
  beforeSubmitPrompt: 'UserPromptSubmit',
  sessionStart: 'SessionStart',
  sessionEnd: 'Stop',
  beforeMCPExecution: 'PreToolUse',
  afterMCPExecution: 'PostToolUse',
};

async function main() {
  const scriptName = process.argv[2];
  if (!scriptName) {
    console.error('[adapter] missing script name arg');
    process.exit(0);
  }

  // Find the shared hooks directory
  const sharedDir = findSharedHooksDir();
  if (!sharedDir) {
    console.error(`[adapter] shared hooks dir not found; set SIMPL_SHARED_HOOKS`);
    process.exit(0); // fail open, don't block Cursor
  }

  const scriptPath = path.join(sharedDir, `${scriptName}.js`);
  if (!fs.existsSync(scriptPath)) {
    console.error(`[adapter] script not found: ${scriptPath}`);
    process.exit(0);
  }

  // Read Cursor's stdin
  const cursorPayload = await readStdin();

  // Translate to Claude Code format
  const claudePayload = translate(cursorPayload);

  // Spawn the shared script with translated payload on stdin
  const child = spawn('node', [scriptPath], { stdio: ['pipe', 'inherit', 'inherit'] });
  child.stdin.write(JSON.stringify(claudePayload));
  child.stdin.end();
  child.on('close', (code) => process.exit(code ?? 0));
}

function findSharedHooksDir() {
  if (process.env.SIMPL_SHARED_HOOKS) {
    return process.env.SIMPL_SHARED_HOOKS;
  }
  const cachePath = path.join(
    os.homedir(),
    '.claude',
    'plugins',
    'cache',
    'simpl_knowledge',
    'scripts',
    'shared-hooks',
  );
  if (fs.existsSync(cachePath)) return cachePath;
  const altCache = path.join(os.homedir(), '.simpl_knowledge', 'cache', 'scripts', 'shared-hooks');
  if (fs.existsSync(altCache)) return altCache;
  const local = path.join(__dirname, 'shared-hooks');
  if (fs.existsSync(local)) return local;
  return null;
}

function translate(cursorPayload) {
  if (!cursorPayload) return {};
  const eventName = cursorPayload.event || 'unknown';
  const claudeEvent = CURSOR_TO_CLAUDE[eventName] || eventName;

  // Cursor's field conventions vary by event; normalize the common ones
  const toolInput = cursorPayload.shell_command
    ? { command: cursorPayload.shell_command }
    : cursorPayload.file_path
      ? { file_path: cursorPayload.file_path, content: cursorPayload.file_content }
      : cursorPayload.user_prompt
        ? { prompt: cursorPayload.user_prompt }
        : cursorPayload;

  return {
    hook_event_name: claudeEvent,
    tool_name: cursorPayload.tool || cursorPayload.event,
    tool_input: toolInput,
    session_id: cursorPayload.conversation_id || cursorPayload.session_id,
    transcript_path: cursorPayload.transcript_path,
    _original_event: eventName,
    _harness: 'cursor',
  };
}

function readStdin() {
  return new Promise((resolve) => {
    let d = '';
    if (process.stdin.isTTY) return resolve(null);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (d += c));
    process.stdin.on('end', () => {
      try {
        resolve(JSON.parse(d));
      } catch {
        resolve(null);
      }
    });
    setTimeout(() => resolve(null), 1500);
  });
}

main().catch((err) => {
  console.error('[adapter]', err.message);
  process.exit(0);
});
