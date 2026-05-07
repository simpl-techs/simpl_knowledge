#!/usr/bin/env node
/**
 * persist-instincts.js — merge a JSON array of extracted instincts into the local store.
 * Called by /extract-instincts after the agent produces structured JSON (no HTTP in this plugin).
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execSync } = require('node:child_process');

function main() {
  const jsonPath = process.argv[2];
  if (!jsonPath || !fs.existsSync(jsonPath)) {
    console.error('[persist-instincts] usage: persist-instincts.js <path-to-json-array.json>');
    process.exit(1);
  }

  let incoming;
  try {
    incoming = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  } catch (e) {
    console.error('[persist-instincts] invalid JSON file');
    console.error(e.stack || e);
    process.exit(1);
  }
  if (!Array.isArray(incoming)) {
    console.error('[persist-instincts] JSON root must be an array');
    process.exit(1);
  }

  let repoRoot;
  try {
    repoRoot = execSync('git rev-parse --show-toplevel', { cwd: process.cwd(), encoding: 'utf8' }).trim();
  } catch {
    console.error('[persist-instincts] not inside a git repo');
    process.exit(1);
  }
  const repoName = path.basename(repoRoot);
  const storeDir = path.join(os.homedir(), '.claude', 'simpl-memory', repoName);
  fs.mkdirSync(storeDir, { recursive: true });
  const storeFile = path.join(storeDir, 'instincts.jsonl');

  try {
    withStoreLockSync(storeDir, () => {
      const existing = loadJsonl(storeFile);
      const merged = mergeInstincts(existing, incoming.slice(0, 5));
      saveJsonl(storeFile, merged);
    });
  } catch (e) {
    console.error('[persist-instincts] failed');
    console.error(e.stack || e);
    process.exit(1);
  }

  console.log(`OK: merged into ${storeFile}`);
}

function withStoreLockSync(storeDir, fn) {
  const lockPath = path.join(storeDir, '.instincts.lock');
  const maxWait = 10_000;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      fs.writeFileSync(lockPath, `${process.pid}\n`, { flag: 'wx' });
      try {
        fn();
      } finally {
        try {
          fs.unlinkSync(lockPath);
        } catch (_) {}
      }
      return;
    } catch {
      try {
        const st = fs.statSync(lockPath);
        if (Date.now() - st.mtimeMs > 60_000) fs.unlinkSync(lockPath);
      } catch (_) {}
    }
    sleepMs(50);
  }
  throw new Error('instincts store lock timeout');
}

function sleepMs(ms) {
  try {
    if (process.platform === 'win32') {
      require('node:child_process').execSync(`powershell -NoProfile -Command "Start-Sleep -Milliseconds ${ms}"`, {
        stdio: 'ignore',
      });
    } else {
      require('node:child_process').execSync('sleep 0.05', { stdio: 'ignore' });
    }
  } catch {
    const end = Date.now() + ms;
    while (Date.now() < end) {}
  }
}

function loadJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
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

function saveJsonl(file, rows) {
  fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
}

function mergeInstincts(existing, incoming) {
  const byHash = new Map(existing.map((i) => [i.hash, i]));
  const sessionId = `s${Date.now()}`;
  for (const inc of incoming) {
    if (!inc || !inc.pattern) continue;
    const hash = normalizeHash(inc.pattern);
    const prev = byHash.get(hash);
    if (prev) {
      if (!prev.sessions?.includes(sessionId)) {
        prev.count = (prev.count || 1) + 1;
        prev.sessions = [...(prev.sessions || []), sessionId].slice(-20);
        prev.last_seen = new Date().toISOString();
      }
    } else {
      byHash.set(hash, {
        hash,
        pattern: inc.pattern,
        evidence: inc.evidence || '',
        suggestion: inc.suggestion || '',
        category: inc.category || 'general',
        count: 1,
        sessions: [sessionId],
        first_seen: new Date().toISOString(),
        last_seen: new Date().toISOString(),
        promoted: false,
        dismissed_promotion: false,
      });
    }
  }
  return [...byHash.values()];
}

function normalizeHash(s) {
  const norm = String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
  return crypto.createHash('sha256').update(norm, 'utf8').digest('hex').slice(0, 32);
}

main();
