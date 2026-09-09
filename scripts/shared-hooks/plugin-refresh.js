#!/usr/bin/env node
/**
 * Keep in sync with: plugins/simpl-standards/scripts/hooks/plugin-refresh.js
 *
 * plugin-refresh.js — Claude Code SessionStart:
 *   1. git fetch + reset --hard origin/main on the marketplace clone
 *   2. compare installed versions vs marketplace.json
 *   3. when stale, run `claude plugin update` (or install if missing)
 *   4. emit additionalContext (updated plugins apply next session)
 *
 * Fail-open: never blocks the IDE. Errors go to
 * ~/.simpl_knowledge/plugin-refresh.log with stack.
 *
 * Output: Claude SessionStart JSON with hookSpecificOutput.additionalContext.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const MARKETPLACE_NAME = process.env.SIMPL_MARKETPLACE_NAME || 'simpl';
const CORE_PLUGINS = ['simpl-standards', 'simpl-memory', 'simpl-libraries'];
const CLAUDE_TIMEOUT_MS = 55_000;

function home() {
  return os.homedir();
}

function marketplaceClonePath() {
  if (process.env.SIMPL_MARKETPLACE_CLONE) {
    return process.env.SIMPL_MARKETPLACE_CLONE;
  }
  return path.join(home(), '.claude', 'plugins', 'marketplaces', MARKETPLACE_NAME);
}

function installedPluginsPath() {
  return path.join(home(), '.claude', 'plugins', 'installed_plugins.json');
}

function logPath() {
  return path.join(home(), '.simpl_knowledge', 'plugin-refresh.log');
}

function appendLog(message, err) {
  try {
    const dir = path.join(home(), '.simpl_knowledge');
    fs.mkdirSync(dir, { recursive: true });
    const lines = [
      `[${new Date().toISOString()}] plugin-refresh: ${message}`,
      err && (err.stack || String(err)),
      '',
    ].filter(Boolean);
    fs.appendFileSync(logPath(), lines.join('\n'));
  } catch {
    /* ignore logging failures */
  }
  console.error(`[simpl-hooks] plugin-refresh: ${message}`);
  if (err) console.error(err.stack || err);
}

function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function claudeBin() {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  try {
    return execFileSync('which', ['claude'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'claude';
  }
}

function runClaude(args) {
  return execFileSync(claudeBin(), args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: CLAUDE_TIMEOUT_MS,
  });
}

function healMarketplaceClone(cloneDir) {
  if (!fs.existsSync(path.join(cloneDir, '.git'))) {
    return { ok: false, reason: `marketplace clone missing: ${cloneDir}` };
  }
  try {
    git(cloneDir, ['fetch', '--prune', 'origin', 'main']);
    git(cloneDir, ['reset', '--hard', 'origin/main']);
    const sha = git(cloneDir, ['rev-parse', 'HEAD']);
    return { ok: true, sha };
  } catch (e) {
    appendLog('healMarketplaceClone failed', e);
    return { ok: false, reason: e.message || String(e) };
  }
}

function readMarketplaceVersions(cloneDir) {
  const mp = path.join(cloneDir, '.claude-plugin', 'marketplace.json');
  if (!fs.existsSync(mp)) return {};
  try {
    const j = JSON.parse(fs.readFileSync(mp, 'utf8'));
    const out = {};
    for (const p of j.plugins || []) {
      if (p && p.name && p.version) out[p.name] = String(p.version);
    }
    return out;
  } catch (e) {
    appendLog('could not read marketplace.json', e);
    return {};
  }
}

function readInstalledVersions() {
  const p = installedPluginsPath();
  if (!fs.existsSync(p)) return {};
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    const out = {};
    const plugins = j.plugins || {};
    for (const [key, entries] of Object.entries(plugins)) {
      const name = key.split('@')[0];
      const list = Array.isArray(entries) ? entries : [entries];
      const latest = list[0];
      if (latest && latest.version) out[name] = String(latest.version);
    }
    return out;
  } catch (e) {
    appendLog('could not read installed_plugins.json', e);
    return {};
  }
}

function compareSemver(a, b) {
  const pa = String(a).split('.').map((x) => Number(x) || 0);
  const pb = String(b).split('.').map((x) => Number(x) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da < db) return -1;
    if (da > db) return 1;
  }
  return 0;
}

function findStale(marketplaceVersions, installedVersions) {
  const stale = [];
  for (const name of CORE_PLUGINS) {
    const want = marketplaceVersions[name];
    const have = installedVersions[name];
    if (!want) continue;
    if (!have) {
      stale.push({ name, have: null, want });
      continue;
    }
    if (compareSemver(have, want) < 0) {
      stale.push({ name, have, want });
    }
  }
  return stale;
}

function updateOrInstallPlugin(stale) {
  const spec = `${stale.name}@${MARKETPLACE_NAME}`;
  const action = stale.have ? 'update' : 'install';
  try {
    runClaude(['plugin', action, spec, '--scope', 'user']);
    return { ok: true };
  } catch (e) {
    appendLog(`claude plugin ${action} ${spec} failed`, e);
    return { ok: false, reason: e.message || String(e) };
  }
}

function emit(additionalContext) {
  const sanitized = String(additionalContext)
    .replace(/[^\n\r\t\x20-\x7E]/g, '')
    .slice(0, 8000);
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: sanitized,
      },
    })}\n`,
  );
}

function main() {
  const cloneDir = marketplaceClonePath();
  const heal = healMarketplaceClone(cloneDir);
  const lines = [];

  if (!heal.ok) {
    lines.push(
      `[simpl_knowledge] WARNING: could not refresh Claude marketplace clone (${heal.reason}). See ~/.simpl_knowledge/plugin-refresh.log`,
    );
  } else {
    lines.push(`[simpl_knowledge] marketplace clone @ ${heal.sha.slice(0, 12)}`);
  }

  const marketplaceVersions = heal.ok ? readMarketplaceVersions(cloneDir) : {};
  const installedVersions = readInstalledVersions();
  const stale = findStale(marketplaceVersions, installedVersions);

  if (stale.length > 0) {
    try {
      runClaude(['plugin', 'marketplace', 'update', MARKETPLACE_NAME]);
    } catch (e) {
      appendLog('claude plugin marketplace update failed', e);
    }
    const updated = [];
    const failed = [];
    for (const s of stale) {
      const result = updateOrInstallPlugin(s);
      if (result.ok) {
        updated.push(`${s.name} ${s.have || 'missing'} -> ${s.want}`);
      } else {
        failed.push(`${s.name}: ${result.reason}`);
      }
    }
    if (updated.length) {
      lines.push('[simpl_knowledge] Claude plugins updated (active next session):');
      for (const u of updated) lines.push(`  ${u}`);
    }
    if (failed.length) {
      lines.push(
        '[simpl_knowledge] WARNING: plugin auto-update failed. See ~/.simpl_knowledge/plugin-refresh.log',
      );
      for (const f of failed) lines.push(`  ${f}`);
    }
  }

  if (stale.length > 0 || !heal.ok) {
    emit(lines.join('\n'));
  }
}

try {
  main();
} catch (e) {
  appendLog('unhandled failure', e);
}
