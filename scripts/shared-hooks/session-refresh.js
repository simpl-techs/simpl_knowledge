#!/usr/bin/env node
/**
 * session-refresh.js — SessionStart / sessionStart: refresh simpl_knowledge git cache,
 * sync org-managed Cursor rules (simpl-*.mdc), run repo-local sync-cursor-internal.sh.
 *
 * Invoked by:
 * - Cursor: node adapter.js session-refresh (stdin has _harness: cursor)
 * - Claude Code: session-start-refresh.sh → --claude-session-hook
 *
 * Throttle: skip network fetch when state.json already records the same origin/main sha
 * checked within FETCH_MIN_INTERVAL_SEC (default 5m). Heavy work (reset, mdc copy) runs
 * only when the sha changes. Bypass with SIMPL_KNOWLEDGE_FORCE_REFRESH=1 or when CWD is
 * the simpl_knowledge repo itself.
 *
 * Fail-open: never blocks the IDE. Errors are logged with stack to
 * ~/.simpl_knowledge/refresh.log and surfaced via additional_context / additionalContext.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, execFileSync } = require('node:child_process');

const FETCH_MIN_INTERVAL_SEC = Number(process.env.SIMPL_REFRESH_MIN_INTERVAL_SEC || 5 * 60);
const STALE_WARN_SEC = Number(process.env.SIMPL_REFRESH_STALE_WARN_SEC || 7 * 24 * 3600);
const DEFAULT_REPO = process.env.SIMPL_KNOWLEDGE_REPO || 'simpl-techs/simpl_knowledge';
const CURSOR_TAG = 'cursor-rules-rolling';

function home() {
  return os.homedir();
}

function stateDir() {
  return path.join(home(), '.simpl_knowledge');
}

function statePath() {
  return path.join(stateDir(), 'state.json');
}

function refreshLogPath() {
  return path.join(stateDir(), 'refresh.log');
}

function resolveCacheDir() {
  if (process.env.SIMPL_KNOWLEDGE_CACHE) {
    const p = path.resolve(process.env.SIMPL_KNOWLEDGE_CACHE);
    if (fs.existsSync(p)) return p;
  }
  const claudeCache = path.join(home(), '.claude', 'plugins', 'cache', 'simpl_knowledge');
  if (fs.existsSync(claudeCache)) return claudeCache;
  const alt = path.join(home(), '.simpl_knowledge', 'cache');
  if (fs.existsSync(alt)) return alt;
  return null;
}

function defaultCacheDir() {
  return path.join(home(), '.claude', 'plugins', 'cache', 'simpl_knowledge');
}

function readState() {
  try {
    if (!fs.existsSync(statePath())) return {};
    return JSON.parse(fs.readFileSync(statePath(), 'utf8')) || {};
  } catch {
    return {};
  }
}

function writeState(patch) {
  const dir = stateDir();
  fs.mkdirSync(dir, { recursive: true });
  const next = { ...readState(), ...patch, updated_at: new Date().toISOString() };
  fs.writeFileSync(statePath(), `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

function appendRefreshLog(message, err) {
  try {
    fs.mkdirSync(stateDir(), { recursive: true });
    const lines = [
      `[${new Date().toISOString()}] ${message}`,
      err && (err.stack || String(err)),
      '',
    ].filter((x) => x !== undefined && x !== false);
    fs.appendFileSync(refreshLogPath(), lines.join('\n'));
  } catch {
    /* ignore logging failures */
  }
  console.error(`[simpl-hooks] ${message}`);
  if (err) console.error(err.stack || err);
}

/** True when CWD (or any ancestor) is the simpl_knowledge repo itself. */
function isInSimplKnowledgeRepo(cwd) {
  let dir = cwd;
  for (let i = 0; i < 8 && dir && dir !== path.dirname(dir); i++) {
    const mp = path.join(dir, '.claude-plugin', 'marketplace.json');
    if (fs.existsSync(mp)) {
      try {
        const j = JSON.parse(fs.readFileSync(mp, 'utf8'));
        if (j && j.name === 'simpl') return true;
      } catch {
        /* ignore */
      }
    }
    dir = path.dirname(dir);
  }
  return false;
}

function forceRefresh(cwd) {
  if (process.env.SIMPL_KNOWLEDGE_FORCE_REFRESH === '1') return true;
  return isInSimplKnowledgeRepo(cwd);
}

function readStdin() {
  return new Promise((resolve) => {
    let d = '';
    if (process.stdin.isTTY) return resolve(null);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => {
      d += c;
    });
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

function gitRevParse(cacheDir, ref) {
  try {
    return execFileSync('git', ['-C', cacheDir, 'rev-parse', ref], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function cloneCache(dest) {
  const url = `https://github.com/${DEFAULT_REPO}.git`;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  execFileSync('git', ['clone', '--depth', '1', '--branch', 'main', url, dest], {
    stdio: 'ignore',
  });
}

/**
 * Ensure cache exists and matches origin/main.
 * @returns {{ cacheDir: string, sha: string, changed: boolean, error: string|null }}
 */
function ensureCacheFresh(cwd) {
  let cacheDir = resolveCacheDir();
  let error = null;
  let previousSha = readState().cache_sha || '';

  try {
    if (!cacheDir || !fs.existsSync(path.join(cacheDir, '.git'))) {
      cacheDir = defaultCacheDir();
      if (fs.existsSync(cacheDir) && !fs.existsSync(path.join(cacheDir, '.git'))) {
        fs.rmSync(cacheDir, { recursive: true, force: true });
      }
      if (!fs.existsSync(cacheDir)) {
        cloneCache(cacheDir);
      }
    }

    const state = readState();
    const lastFetchAt = state.last_fetch_at ? Date.parse(state.last_fetch_at) : 0;
    const ageSec = (Date.now() - (Number.isFinite(lastFetchAt) ? lastFetchAt : 0)) / 1000;
    const skipFetch =
      !forceRefresh(cwd) &&
      previousSha &&
      ageSec < FETCH_MIN_INTERVAL_SEC &&
      gitRevParse(cacheDir, 'HEAD') === previousSha;

    if (!skipFetch) {
      execFileSync('git', ['-C', cacheDir, 'fetch', '--prune', '--quiet', 'origin', 'main'], {
        stdio: 'ignore',
      });
      writeState({ last_fetch_at: new Date().toISOString() });
    }

    const local = gitRevParse(cacheDir, 'HEAD');
    const remote = gitRevParse(cacheDir, 'origin/main') || local;
    if (remote && local !== remote) {
      execFileSync('git', ['-C', cacheDir, 'reset', '--hard', 'origin/main'], {
        stdio: 'ignore',
      });
    }

    const sha = gitRevParse(cacheDir, 'HEAD') || remote || local;
    const changed = Boolean(sha && sha !== previousSha);
    writeState({
      cache_sha: sha,
      last_refresh_at: new Date().toISOString(),
      last_refresh_ok: true,
      last_error: null,
    });
    return { cacheDir, sha, changed, error: null };
  } catch (e) {
    error = e.message || String(e);
    appendRefreshLog('session-refresh: ensureCacheFresh failed', e);
    writeState({
      last_refresh_ok: false,
      last_error: error,
      last_refresh_at: new Date().toISOString(),
    });
    return { cacheDir: cacheDir || resolveCacheDir() || defaultCacheDir(), sha: previousSha, changed: false, error };
  }
}

function listMdcFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.mdc'))
    .map((e) => e.name);
}

/** Org-managed: simpl-*.mdc; legacy zips without prefix → copy all *.mdc from bundle dir. */
function managedMdcBasenames(names) {
  const simpl = names.filter((n) => n.startsWith('simpl-'));
  if (simpl.length > 0) return simpl;
  return names;
}

function copyMdcFromDir(srcDir, destDir) {
  const names = listMdcFiles(srcDir);
  const toCopy = managedMdcBasenames(names);
  fs.mkdirSync(destDir, { recursive: true });
  for (const name of toCopy) {
    const from = path.join(srcDir, name);
    const to = path.join(destDir, name);
    try {
      fs.copyFileSync(from, to);
    } catch (e) {
      appendRefreshLog(`session-refresh: copy ${name} failed`, e);
    }
  }
  return toCopy.length;
}

/** Sync: curl + unzip + copy. */
function downloadZipExtractMdcSync(destRulesDir) {
  const zipUrl = `https://github.com/${DEFAULT_REPO}/releases/download/${CURSOR_TAG}/cursor-rules.zip`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'simpl-cursor-rules-'));
  const zipPath = path.join(tmp, 'cursor-rules.zip');
  try {
    execFileSync('curl', ['-fsSL', '-L', zipUrl, '-o', zipPath], { stdio: 'ignore' });
    execFileSync('unzip', ['-o', '-q', zipPath, '-d', tmp], { stdio: 'ignore' });
    let src = path.join(tmp, 'cursor-rules');
    if (!fs.existsSync(src)) src = tmp;
    const n = copyMdcFromDir(src, destRulesDir);
    const versionFile = path.join(src, '.version');
    if (fs.existsSync(versionFile)) {
      try {
        const ver = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
        writeState({
          rules_sha: ver.sha || null,
          rules_generated_at: ver.generated_at || null,
        });
      } catch (e) {
        appendRefreshLog('session-refresh: could not parse cursor-rules/.version', e);
      }
    }
    return n;
  } catch (e) {
    appendRefreshLog('session-refresh: downloadZipExtractMdcSync failed', e);
    return 0;
  } finally {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

function syncCursorRules(cacheDir, { force }) {
  const dest = path.join(home(), '.cursor', 'rules');
  const src = cacheDir ? path.join(cacheDir, 'cursor-rules') : null;
  const state = readState();
  if (!force && state.rules_synced_sha && state.cache_sha && state.rules_synced_sha === state.cache_sha) {
    return { copied: 0, skipped: true };
  }

  let copied = 0;
  if (src && listMdcFiles(src).length > 0) {
    copied = copyMdcFromDir(src, dest);
    const versionFile = path.join(src, '.version');
    if (fs.existsSync(versionFile)) {
      try {
        const ver = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
        writeState({
          rules_sha: ver.sha || state.cache_sha,
          rules_generated_at: ver.generated_at || null,
        });
      } catch (e) {
        appendRefreshLog('session-refresh: could not parse cache cursor-rules/.version', e);
      }
    }
  } else {
    copied = downloadZipExtractMdcSync(dest);
  }

  writeState({
    rules_synced_sha: readState().cache_sha || null,
    rules_synced_at: new Date().toISOString(),
  });
  return { copied, skipped: false };
}

function runSyncCursorInternal(cwd) {
  const script = path.join(cwd, '.claude', 'hooks', 'sync-cursor-internal.sh');
  if (!fs.existsSync(script)) return;
  try {
    fs.accessSync(script, fs.constants.X_OK);
  } catch {
    return;
  }
  const child = spawn('bash', [script], {
    cwd,
    stdio: 'ignore',
    detached: true,
    windowsHide: true,
  });
  child.unref();
}

function buildContextMessage({ sha, error, fromCursor }) {
  const state = readState();
  const short = sha ? sha.slice(0, 12) : 'unknown';
  const lines = [
    `[simpl_knowledge] cursor rules / cache sha: ${short}`,
  ];
  if (state.rules_generated_at) {
    lines.push(`[simpl_knowledge] rules generated_at: ${state.rules_generated_at}`);
  }
  if (error) {
    lines.push(
      `[simpl_knowledge] WARNING: last refresh failed: ${error}. See ~/.simpl_knowledge/refresh.log. Run: bash scripts/doctor.sh (from a simpl_knowledge clone) or re-run team-bootstrap.sh.`,
    );
  } else if (state.last_refresh_at) {
    const ageMs = Date.now() - Date.parse(state.last_refresh_at);
    if (Number.isFinite(ageMs) && ageMs / 1000 > STALE_WARN_SEC) {
      lines.push(
        `[simpl_knowledge] WARNING: last successful refresh was ${Math.floor(ageMs / 86400000)}d ago. Run scripts/doctor.sh or team-bootstrap.sh.`,
      );
    }
  }
  if (!fromCursor && state.last_refresh_ok === false && state.last_error) {
    lines.push(`[simpl_knowledge] last_error: ${state.last_error}`);
  }
  return lines.join('\n');
}

function emitCursorContext(message) {
  process.stdout.write(`${JSON.stringify({ additional_context: message })}\n`);
}

function emitClaudeContext(message) {
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: message,
      },
    })}\n`,
  );
}

function runRepoContextCheck(cwd, mode) {
  const checkPath = path.join(__dirname, 'repo-context-check.js');
  if (!fs.existsSync(checkPath)) return;
  try {
    execFileSync(process.execPath, [checkPath, mode], {
      cwd,
      stdio: mode === '--emit-claude-hook' ? 'inherit' : 'ignore',
      timeout: 25_000,
    });
  } catch (e) {
    appendRefreshLog(`repo-context-check (${mode}) failed`, e);
  }
}

/**
 * Synchronous refresh path used when we need to emit session context.
 */
function refreshSync({ cwd, needMdc, emit }) {
  const result = ensureCacheFresh(cwd);
  if (needMdc) {
    syncCursorRules(result.cacheDir, { force: Boolean(result.changed) || forceRefresh(cwd) });
  }
  if (cwd) runSyncCursorInternal(cwd);
  const message = buildContextMessage({
    sha: result.sha,
    error: result.error,
    fromCursor: emit === 'cursor',
  });
  if (emit === 'cursor') emitCursorContext(message);
  if (emit === 'claude') emitClaudeContext(message);
  return result;
}

function runWorker(job) {
  const { cacheDir: jobCache, cwd, needMdc, skipRepoCheck } = job;
  try {
    const result = ensureCacheFresh(cwd || process.cwd());
    const cacheDir = result.cacheDir || jobCache;
    if (needMdc) {
      syncCursorRules(cacheDir, { force: Boolean(result.changed) || forceRefresh(cwd) });
    }
    if (cwd) runSyncCursorInternal(cwd);
    if (cwd && !skipRepoCheck) {
      runRepoContextCheck(cwd, '--from-refresh-worker');
    }
  } catch (e) {
    appendRefreshLog('session-refresh worker failed', e);
  }
}

function spawnDetachedWorker(job) {
  try {
    const env = { ...process.env, SIMPL_SESSION_REFRESH_JOB: JSON.stringify(job) };
    const child = spawn(process.execPath, [__filename, '--worker'], {
      env,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
  } catch (e) {
    appendRefreshLog('session-refresh: could not spawn worker', e);
  }
}

async function main() {
  if (process.argv[2] === '--claude-session-hook') {
    const cwd = process.cwd();
    try {
      const result = refreshSync({
        cwd,
        needMdc: fs.existsSync(path.join(home(), '.cursor', 'rules')),
        emit: null,
      });
      // Write drift report without emitting (we own SessionStart stdout).
      runRepoContextCheck(cwd, '--from-refresh-worker');
      let message = buildContextMessage({
        sha: result.sha,
        error: result.error,
        fromCursor: false,
      });
      const reportPath = path.join(cwd, '.claude', '.simpl-repo-report.json');
      if (fs.existsSync(reportPath)) {
        try {
          const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
          if (report && report.hasDrift) {
            message += `\n[simpl_knowledge] Repo template drift detected — run /bootstrap-repo-context or see ${reportPath}`;
          }
        } catch (e) {
          appendRefreshLog('session-refresh: could not read repo drift report', e);
        }
      }
      emitClaudeContext(message);
    } catch (e) {
      appendRefreshLog('session-refresh --claude-session-hook failed', e);
    }
    return process.exit(0);
  }

  if (process.argv[2] === '--worker') {
    const raw = process.env.SIMPL_SESSION_REFRESH_JOB;
    if (!raw) return process.exit(0);
    let job;
    try {
      job = JSON.parse(raw);
    } catch {
      return process.exit(0);
    }
    runWorker(job);
    return process.exit(0);
  }

  try {
    const payload = await readStdin();
    const fromCursor = payload && payload._harness === 'cursor';
    const cursorRulesDir = path.join(home(), '.cursor', 'rules');
    const needMdc = fromCursor || fs.existsSync(cursorRulesDir);
    const cwd = process.cwd();

    if (fromCursor) {
      // sessionStart needs additional_context on stdout before exit.
      refreshSync({ cwd, needMdc, emit: 'cursor' });
      if (cwd) runRepoContextCheck(cwd, '--from-refresh-worker');
      return process.exit(0);
    }

    // Non-cursor / unknown harness: keep historical detached-worker behaviour for speed.
    const cacheDir = resolveCacheDir();
    if (!cacheDir && !needMdc) return process.exit(0);

    const state = readState();
    const head = cacheDir ? gitRevParse(cacheDir, 'HEAD') : '';
    if (
      !forceRefresh(cwd) &&
      state.cache_sha &&
      head &&
      state.cache_sha === head &&
      state.last_fetch_at &&
      (Date.now() - Date.parse(state.last_fetch_at)) / 1000 < FETCH_MIN_INTERVAL_SEC
    ) {
      return process.exit(0);
    }

    spawnDetachedWorker({
      cacheDir: cacheDir || null,
      cwd,
      needMdc,
      skipRepoCheck: false,
    });
  } catch (e) {
    appendRefreshLog('session-refresh failed', e);
  }
  process.exit(0);
}

main();
