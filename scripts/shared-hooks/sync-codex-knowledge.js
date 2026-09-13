#!/usr/bin/env node
/**
 * sync-codex-knowledge.js — expose org skills to Codex.
 *
 *   1. symlink plugins/**\/skills/<name> into the Codex global skill dirs
 *   2. upsert a managed block in ~/.codex/AGENTS.md listing the always-on skills
 *
 * Always-on names are read from the generated cursor-rules/*.mdc frontmatter
 * (alwaysApply: true) so Cursor, Claude and Codex share one source of truth.
 *
 * Invoked by team-bootstrap.sh, install-team.sh, and session-refresh.js.
 * Fail-open: never throws to the caller; logs to ~/.simpl_knowledge/refresh.log.
 *
 * Env:
 *   SIMPL_KNOWLEDGE_CACHE  — override cache dir
 *   SIMPL_CODEX_FORCE=1    — run even when no Codex install is detected
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const MARKER_START = '<!-- simpl_knowledge:start -->';
const MARKER_END = '<!-- simpl_knowledge:end -->';

function home() {
  return os.homedir();
}

function appendLog(message, err) {
  try {
    const dir = path.join(home(), '.simpl_knowledge');
    fs.mkdirSync(dir, { recursive: true });
    const lines = [
      `[${new Date().toISOString()}] sync-codex-knowledge: ${message}`,
      err && (err.stack || String(err)),
      '',
    ].filter(Boolean);
    fs.appendFileSync(path.join(dir, 'refresh.log'), lines.join('\n'));
  } catch {
    /* ignore logging failures */
  }
  console.error(`[simpl-hooks] sync-codex-knowledge: ${message}`);
  if (err) console.error(err.stack || err);
}

/** Both locations Codex reads global skills from (CLI and IDE builds differ). */
function skillDirs() {
  return [path.join(home(), '.agents', 'skills'), path.join(home(), '.codex', 'skills')];
}

function agentsMdPath() {
  return path.join(home(), '.codex', 'AGENTS.md');
}

/** Codex is in use when its home or the global skills dir already exists. */
function codexDetected() {
  if (process.env.SIMPL_CODEX_FORCE === '1') return true;
  return fs.existsSync(path.join(home(), '.codex')) || skillDirs().some((d) => fs.existsSync(d));
}

function resolveCacheDir(explicit) {
  if (explicit && fs.existsSync(explicit)) return path.resolve(explicit);
  if (process.env.SIMPL_KNOWLEDGE_CACHE) {
    const p = path.resolve(process.env.SIMPL_KNOWLEDGE_CACHE);
    if (fs.existsSync(p)) return p;
  }
  const claudeCache = path.join(home(), '.claude', 'plugins', 'cache', 'simpl_knowledge');
  if (fs.existsSync(claudeCache)) return claudeCache;
  return null;
}

/** Every skill shipped by the org plugins, keyed by directory name. */
function managedSources(cacheDir) {
  const pluginsRoot = path.join(cacheDir, 'plugins');
  if (!fs.existsSync(pluginsRoot)) return [];
  const out = [];
  for (const plugin of fs.readdirSync(pluginsRoot, { withFileTypes: true })) {
    if (!plugin.isDirectory()) continue;
    const skillsRoot = path.join(pluginsRoot, plugin.name, 'skills');
    if (!fs.existsSync(skillsRoot)) continue;
    for (const skill of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
      if (!skill.isDirectory()) continue;
      const dir = path.join(skillsRoot, skill.name);
      if (fs.existsSync(path.join(dir, 'SKILL.md'))) out.push({ name: skill.name, dir });
    }
  }
  return out;
}

/** Skill dir names are matched loosely: rule files flatten `_` to `-`. */
function slug(name) {
  return name.toLowerCase().replace(/[_-]/g, '');
}

/**
 * Always-on skill names, resolved from cursor-rules/*.mdc frontmatter
 * (alwaysApply: true) so Cursor, Claude and Codex share one source of truth.
 * Only names that map to a skill on disk are listed.
 */
function alwaysOnSkills(cacheDir, sources) {
  const rulesDir = path.join(cacheDir, 'cursor-rules');
  if (!fs.existsSync(rulesDir)) return [];
  const bySlug = new Map(sources.map((s) => [slug(s.name), s.name]));
  const names = new Set();
  for (const file of fs.readdirSync(rulesDir)) {
    if (!file.endsWith('.mdc')) continue;
    const text = fs.readFileSync(path.join(rulesDir, file), 'utf8');
    const frontmatter = text.slice(0, text.indexOf('---', 4));
    if (!/alwaysApply:\s*"?true"?/.test(frontmatter)) continue;
    const stem = path.basename(file, '.mdc').replace(/^simpl[_-]/, '');
    const skill = bySlug.get(slug(stem)) || bySlug.get(slug(`simpl_${stem}`));
    if (skill) names.add(skill);
  }
  return [...names].sort();
}

/** Symlink managed skills into one dir, dropping links that no longer resolve. */
function linkSkillsInto(destRoot, cacheDir, sources) {
  fs.mkdirSync(destRoot, { recursive: true });
  const managed = new Map(sources.map((s) => [s.name, s.dir]));

  for (const entry of fs.readdirSync(destRoot, { withFileTypes: true })) {
    const dest = path.join(destRoot, entry.name);
    if (!fs.lstatSync(dest).isSymbolicLink()) continue;
    const target = fs.readlinkSync(dest);
    const ours = target.startsWith(cacheDir) || managed.has(entry.name);
    if (ours) fs.unlinkSync(dest);
  }

  const linked = [];
  const skipped = [];
  for (const src of sources) {
    const dest = path.join(destRoot, src.name);
    if (fs.existsSync(dest)) {
      skipped.push(src.name);
      continue;
    }
    fs.symlinkSync(src.dir, dest);
    linked.push(src.name);
  }
  if (skipped.length) {
    appendLog(`${destRoot}: kept local skill dirs, not linked: ${skipped.join(', ')}`);
  }
  return { linked, skipped };
}

function linkSkills(cacheDir, sources) {
  return skillDirs().map((dir) => ({
    dir,
    ...linkSkillsInto(dir, cacheDir, sources),
  }));
}

function managedBlock(alwaysOn, cacheDir) {
  const lines = [
    MARKER_START,
    '# simpl org standards (managed by simpl_knowledge — do not edit inside this block)',
    '',
    'Org skills live in `~/.agents/skills` and `~/.codex/skills` as symlinks to the simpl_knowledge cache.',
    'Consult them before inventing conventions; do not restate their rules here.',
  ];
  if (alwaysOn.length) {
    lines.push(
      '',
      'Always read these, even when the request does not mention standards:',
      alwaysOn.map((n) => `\`${n}\``).join(', ') + '.',
    );
  }
  lines.push(
    '',
    `Internal library catalog: \`${path.join(cacheDir, 'catalog.md')}\` — read it before writing new integration code.`,
    MARKER_END,
    '',
  );
  return lines.join('\n');
}

/** Replace the managed block in place; never touch the developer's own text. */
function upsertAgentsMd(alwaysOn, cacheDir) {
  const dest = agentsMdPath();
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const block = managedBlock(alwaysOn, cacheDir);

  if (!fs.existsSync(dest)) {
    fs.writeFileSync(dest, block);
    return 'created';
  }

  const current = fs.readFileSync(dest, 'utf8');
  const start = current.indexOf(MARKER_START);
  const end = current.indexOf(MARKER_END);
  let next;
  if (start !== -1 && end !== -1 && end > start) {
    const tail = current.slice(end + MARKER_END.length).replace(/^\n+/, '');
    next = `${current.slice(0, start)}${block}${tail}`;
  } else {
    next = `${current.replace(/\s*$/, '')}\n\n${block}`;
  }
  if (next === current) return 'unchanged';
  fs.writeFileSync(dest, next);
  return 'updated';
}

function main() {
  try {
    if (!codexDetected()) {
      process.stdout.write('codex: not detected, skipped\n');
      return;
    }
    const cacheDir = resolveCacheDir(process.argv[2]);
    if (!cacheDir) {
      appendLog('no simpl_knowledge cache on disk — skipped');
      return;
    }
    const sources = managedSources(cacheDir);
    const results = linkSkills(cacheDir, sources);
    const agents = upsertAgentsMd(alwaysOnSkills(cacheDir, sources), cacheDir);
    const summary = results
      .map((r) => `${path.basename(path.dirname(r.dir))}/skills ${r.linked.length}/${sources.length}`)
      .join(', ');
    process.stdout.write(`codex: ${summary} linked, AGENTS.md ${agents}\n`);
  } catch (e) {
    appendLog('failed', e);
  }
}

main();
