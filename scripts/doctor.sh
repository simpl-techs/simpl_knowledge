#!/usr/bin/env bash
# Verify detected agents against the authenticated cache; nonzero means incomplete.
set -euo pipefail
node - <<'JS'
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const home = os.homedir();
const cache = process.env.SIMPL_KNOWLEDGE_CACHE || path.join(home, '.simpl_knowledge/cache');
const marketplace = process.env.SIMPL_MARKETPLACE_NAME || 'simpl';
let failures = 0;
function check(ok, message) {
  console.log(`  ${ok ? '✓' : '✗'} ${message}`);
  if (!ok) failures++;
}
function section(label, action) {
  console.log(`\n== ${label} ==`);
  try { action(); } catch (error) { check(false, error.message); }
}
function exists(file) { return fs.existsSync(file); }
function json(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function command(name) {
  return (process.env.PATH || '').split(path.delimiter).some((dir) => {
    try { fs.accessSync(path.join(dir, name), fs.constants.X_OK); return true; } catch { return false; }
  });
}
function matches(a, b) { return exists(a) && exists(b) && fs.readFileSync(a).equals(fs.readFileSync(b)); }
function git(dir, ...args) {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function verifyClone(dir) {
  git(dir, 'fetch', '--quiet', 'origin', 'main');
  const sha = git(dir, 'rev-parse', 'HEAD');
  check(sha === git(dir, 'rev-parse', 'origin/main'), `cache matches origin/main (${sha.slice(0, 12)})`);
  check(git(dir, 'status', '--porcelain', '--untracked-files=no') === '', `tracked cache content clean: ${dir}`);
}
const cursor = command('cursor') || exists(path.join(home, '.cursor')) || exists(path.join(home, 'Library/Application Support/Cursor'));
const claude = command('claude') || exists(path.join(home, '.claude/plugins/installed_plugins.json'));
const codex = command('codex') || exists(path.join(home, '.codex')) || exists(path.join(home, '.agents/skills'));
check(cursor || claude || codex, 'at least one supported agent detected');
section('simpl_knowledge cache', () => verifyClone(cache));
if (cursor) {
  section('Cursor hooks + shared-hooks', () => {
    const hooks = json(path.join(home, '.cursor/hooks.json'));
    const entries = hooks.hooks?.sessionStart;
    check(!hooks.sessionStart && Array.isArray(entries) && entries.some(e => /adapter\.js.*session-refresh/.test(e.command)), 'hooks.sessionStart registered under hooks as array');
    check(matches(path.join(cache, 'scripts/cursor-hooks/adapter.js'), path.join(home, '.cursor/hooks/adapter.js')), 'adapter matches cache');
    const source = path.join(cache, 'scripts/shared-hooks');
    for (const file of fs.readdirSync(source).filter(f => f.endsWith('.js'))) {
      check(matches(path.join(source, file), path.join(home, '.cursor/hooks/shared-hooks', file)), `shared-hooks/${file} matches cache`);
    }
  });
  section('Cursor rules vs cache', () => {
    const source = path.join(cache, 'cursor-rules');
    const rules = fs.readdirSync(source).filter(f => /^simpl-.*\.mdc$/.test(f));
    check(rules.length > 0, 'generated Cursor rules available');
    for (const file of rules) check(matches(path.join(source, file), path.join(home, '.cursor/rules', file)), `${file} matches cache`);
  });
}
if (claude) {
  const clone = path.join(home, '.claude/plugins/marketplaces', marketplace);
  section('Claude marketplace clone', () => verifyClone(clone));
  section('Claude plugins + auto-update', () => {
    const versions = new Map(json(path.join(clone, '.claude-plugin/marketplace.json')).plugins.map(p => [p.name, p.version]));
    const installed = json(path.join(home, '.claude/plugins/installed_plugins.json')).plugins;
    const settings = json(path.join(home, '.claude/settings.json'));
    const known = json(path.join(home, '.claude/plugins/known_marketplaces.json'));
    check(known[marketplace]?.autoUpdate === true, 'marketplace autoUpdate enabled');
    const names = new Set(['simpl-standards', 'simpl-memory', 'simpl-libraries']);
    for (const key of Object.keys(installed)) if (key.endsWith(`@${marketplace}`)) names.add(key.split('@')[0]);
    for (const name of names) {
      const key = `${name}@${marketplace}`;
      const entries = installed[key];
      const entry = (Array.isArray(entries) ? entries : [entries]).find(e => e?.scope === 'user');
      check(Boolean(versions.get(name)) && entry?.version === versions.get(name), `${name}: installed ${entry?.version || 'missing'} / marketplace ${versions.get(name)}`);
      check(settings.enabledPlugins?.[key] === true, `${key} enabled for user`);
      if (entry?.installPath) {
        check(json(path.join(entry.installPath, '.claude-plugin/plugin.json')).version === versions.get(name), `${name} cached manifest matches`);
      } else check(false, `${name} installPath missing`);
    }
  });
}
if (codex) section('Codex skills + AGENTS.md', () => {
  const sources = [];
  for (const plugin of fs.readdirSync(path.join(cache, 'plugins'))) {
    const dir = path.join(cache, 'plugins', plugin, 'skills');
    if (!exists(dir)) continue;
    for (const skill of fs.readdirSync(dir)) if (exists(path.join(dir, skill, 'SKILL.md'))) sources.push({ name: skill, dir: path.join(dir, skill) });
  }
  check(sources.length > 0 && new Set(sources.map(s => s.name)).size === sources.length, 'nonempty unique cache skill names');
  for (const root of ['.agents/skills', '.codex/skills']) {
    let linked = 0;
    for (const source of sources) {
      const dest = path.join(home, root, source.name);
      if (fs.lstatSync(dest, { throwIfNoEntry: false })?.isSymbolicLink() && exists(dest) && fs.realpathSync(dest) === fs.realpathSync(source.dir)) linked++;
      else check(false, `missing or incorrect ${root}/${source.name}`);
    }
    check(linked === sources.length, `${linked}/${sources.length} cache skills linked in ${root}`);
  }
  const text = fs.readFileSync(path.join(home, '.codex/AGENTS.md'), 'utf8');
  const start = '<!-- simpl_knowledge:start -->';
  const end = '<!-- simpl_knowledge:end -->';
  const block = text.slice(text.indexOf(start), text.indexOf(end));
  check(text.split(start).length === 2 && text.split(end).length === 2 && text.indexOf(end) > text.indexOf(start), 'one complete managed AGENTS.md block');
  check(block.includes('`git-workflow`'), 'managed block requires git-workflow');
});
section('Refresh status', () => {
  const file = path.join(home, '.simpl_knowledge/state.json');
  if (exists(file)) { const state = json(file); check(state.last_refresh_ok !== false, `last refresh: ${state.last_error || 'OK'}`); }
  else console.log('  - first session refresh has not run yet');
});
console.log(`\ndoctor ${failures ? `FAILED (${failures})` : 'OK'}`);
process.exitCode = failures ? 1 : 0;
JS
