#!/usr/bin/env node
/**
 * session-refresh.js — SessionStart / sessionStart: refresh simpl-knowledge git cache,
 * sync org-managed Cursor rules (simpl-*.mdc), run repo-local sync-cursor-internal.sh.
 *
 * Invoked by:
 * - Cursor: node adapter.js session-refresh (stdin has _harness: cursor)
 * - Claude Code: session-start-refresh.sh (stdin often empty)
 *
 * Throttle: 6h via .last-refresh in cache or ~/.simpl-knowledge/.last-session-refresh.
 * Fail-open: never blocks the IDE; errors log with stack to stderr.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, execFileSync } = require('node:child_process');

const THROTTLE_SEC = 6 * 3600;
const DEFAULT_REPO = process.env.SIMPL_KNOWLEDGE_REPO || 'simpl/simpl-knowledge';
const CURSOR_TAG = 'cursor-rules-rolling';

function home() {
  return os.homedir();
}

function resolveCacheDir() {
  if (process.env.SIMPL_KNOWLEDGE_CACHE) {
    const p = path.resolve(process.env.SIMPL_KNOWLEDGE_CACHE);
    if (fs.existsSync(p)) return p;
  }
  const claudeCache = path.join(home(), '.claude', 'plugins', 'cache', 'simpl-knowledge');
  if (fs.existsSync(claudeCache)) return claudeCache;
  const alt = path.join(home(), '.simpl-knowledge', 'cache');
  if (fs.existsSync(alt)) return alt;
  return null;
}

function throttleFilePath(cacheDir) {
  if (cacheDir) return path.join(cacheDir, '.last-refresh');
  return path.join(home(), '.simpl-knowledge', '.last-session-refresh');
}

function shouldThrottle(stampPath) {
  if (!fs.existsSync(stampPath)) return false;
  const st = fs.statSync(stampPath);
  const now = Math.floor(Date.now() / 1000);
  const last = Math.floor(st.mtimeMs / 1000);
  return now - last < THROTTLE_SEC;
}

function touchStamp(stampPath) {
  try {
    const dir = path.dirname(stampPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(stampPath, `${Date.now()}\n`);
  } catch (e) {
    console.error('[simpl-hooks] session-refresh: could not write stamp');
    console.error(e.stack || e);
  }
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

function gitRefreshSync(cacheDir) {
  if (!cacheDir || !fs.existsSync(path.join(cacheDir, '.git'))) return;
  try {
    execFileSync('git', ['-C', cacheDir, 'fetch', '--quiet', 'origin', 'main'], {
      stdio: 'ignore',
    });
  } catch {
    return;
  }
  const local = gitRevParse(cacheDir, 'HEAD');
  const remote = gitRevParse(cacheDir, 'origin/main');
  if (remote && local !== remote) {
    try {
      execFileSync('git', ['-C', cacheDir, 'reset', '--hard', 'origin/main', '--quiet'], {
        stdio: 'ignore',
      });
    } catch {
      /* fail open */
    }
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
      console.error(`[simpl-hooks] session-refresh: copy ${name} failed`);
      console.error(e.stack || e);
    }
  }
}

/** Sync: curl + unzip + copy (runs inside detached worker only). */
function downloadZipExtractMdcSync(destRulesDir) {
  const zipUrl = `https://github.com/${DEFAULT_REPO}/releases/download/${CURSOR_TAG}/cursor-rules.zip`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'simpl-cursor-rules-'));
  const zipPath = path.join(tmp, 'cursor-rules.zip');
  try {
    execFileSync('curl', ['-fsSL', '-L', zipUrl, '-o', zipPath], { stdio: 'ignore' });
    execFileSync('unzip', ['-o', '-q', zipPath, '-d', tmp], { stdio: 'ignore' });
    let src = path.join(tmp, 'cursor-rules');
    if (!fs.existsSync(src)) src = tmp;
    copyMdcFromDir(src, destRulesDir);
  } catch {
    /* fail open */
  } finally {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
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

function runWorker(job) {
  const { cacheDir, cwd, needMdc, skipRepoCheck } = job;
  const stampPath = throttleFilePath(cacheDir);
  try {
    if (cacheDir) gitRefreshSync(cacheDir);

    if (needMdc) {
      const dest = path.join(home(), '.cursor', 'rules');
      const src = cacheDir ? path.join(cacheDir, 'cursor-rules') : null;
      if (src && listMdcFiles(src).length > 0) {
        copyMdcFromDir(src, dest);
      } else {
        downloadZipExtractMdcSync(dest);
      }
    }

    if (cwd) runSyncCursorInternal(cwd);

    if (cwd && !skipRepoCheck) {
      try {
        const checkPath = path.join(__dirname, 'repo-context-check.js');
        if (fs.existsSync(checkPath)) {
          execFileSync(process.execPath, [checkPath, '--from-refresh-worker'], {
            cwd,
            stdio: 'ignore',
            timeout: 25_000,
          });
        }
      } catch (e) {
        console.error('[simpl-hooks] repo-context-check (worker) failed');
        console.error(e.stack || e);
      }
    }

    touchStamp(stampPath);
  } catch (e) {
    console.error('[simpl-hooks] session-refresh worker failed');
    console.error(e.stack || e);
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
    console.error('[simpl-hooks] session-refresh: could not spawn worker');
    console.error(e.stack || e);
  }
}

async function main() {
  if (process.argv[2] === '--claude-session-hook') {
    const cwd = process.cwd();
    try {
      const cacheDir = resolveCacheDir();
      if (cacheDir) gitRefreshSync(cacheDir);
      const cursorRulesDir = path.join(home(), '.cursor', 'rules');
      const needMdc = fs.existsSync(cursorRulesDir);
      spawnDetachedWorker({
        cacheDir: cacheDir || null,
        cwd,
        needMdc,
        skipRepoCheck: true,
      });
      const checkPath = path.join(__dirname, 'repo-context-check.js');
      if (fs.existsSync(checkPath)) {
        execFileSync(process.execPath, [checkPath, '--emit-claude-hook'], {
          cwd,
          stdio: 'inherit',
          timeout: 25_000,
        });
      }
    } catch (e) {
      console.error('[simpl-hooks] session-refresh --claude-session-hook failed');
      console.error(e.stack || e);
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
    const cacheDir = resolveCacheDir();
    const cursorRulesDir = path.join(home(), '.cursor', 'rules');
    const needMdc = fromCursor || fs.existsSync(cursorRulesDir);

    if (!cacheDir && !needMdc) return process.exit(0);

    const stampPath = throttleFilePath(cacheDir);
    if (shouldThrottle(stampPath)) return process.exit(0);

    const job = {
      cacheDir: cacheDir || null,
      cwd: process.cwd(),
      needMdc,
      skipRepoCheck: false,
    };
    spawnDetachedWorker(job);
  } catch (e) {
    console.error('[simpl-hooks] session-refresh failed');
    console.error(e.stack || e);
  }
  process.exit(0);
}

main();
