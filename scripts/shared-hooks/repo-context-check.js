#!/usr/bin/env node
/**
 * repo-context-check.js — Compare current repo to simpl-knowledge/library-repo-template.
 * Read-only unless writing the drift report. Used by session-refresh, Claude hook, /bootstrap-repo-context.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const THROTTLE_MS = 12 * 3600 * 1000;

/** Same set as library-repo-template/scripts/bootstrap.sh */
const TRACKED_REL_PATHS = [
  '.agent/SKILL.md',
  '.agent/INTERNAL.md',
  '.agent/README.md',
  '.claude/settings.json',
  '.claude/commands/update-skill.md',
  '.claude/hooks/session-start-refresh.sh',
  '.claude/hooks/sync-cursor-internal.sh',
  'scripts/sanitize-commit-digest.py',
  '.cursor/hooks/adapter.js',
  '.cursor/hooks.json',
  '.cursor/rules/repo-internal.mdc',
  '.github/workflows/auto-update-skill.yml',
  '.github/workflows/sync-skill-to-marketplace.yml',
  '.github/pull_request_template.md',
  'CLAUDE.md',
];

const OWNED_BY_ORG = new Set([
  '.claude/commands/update-skill.md',
  '.claude/hooks/session-start-refresh.sh',
  '.claude/hooks/sync-cursor-internal.sh',
  'scripts/sanitize-commit-digest.py',
  '.cursor/hooks/adapter.js',
  '.github/workflows/auto-update-skill.yml',
  '.github/workflows/sync-skill-to-marketplace.yml',
  '.github/pull_request_template.md',
  '.cursor/rules/repo-internal.mdc',
]);

const OWNED_BY_REPO = new Set([
  '.agent/SKILL.md',
  '.agent/INTERNAL.md',
  '.agent/README.md',
  'CLAUDE.md',
  '.claude/settings.json',
  '.cursor/hooks.json',
]);

const PLACEHOLDER_RE =
  /REPLACE-ME-with-repo-name|\bREPO-NAME\b|\bREPLACE-ME\b/;

function home() {
  return os.homedir();
}

function resolveSimplKnowledgeRoot() {
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

function isGitRepo(cwd) {
  try {
    execFileSync('git', ['-C', cwd, 'rev-parse', '--is-inside-work-tree'], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

/** Opt-in: repo already chose simpl-knowledge conventions (conservative gate). */
function isOptedIn(cwd) {
  if (fs.existsSync(path.join(cwd, '.agent'))) return true;
  if (fs.existsSync(path.join(cwd, 'CLAUDE.md'))) return true;
  if (fs.existsSync(path.join(cwd, '.claude', 'settings.json'))) return true;
  if (fs.existsSync(path.join(cwd, '.cursor', 'hooks.json'))) return true;
  if (fs.existsSync(path.join(cwd, '.cursor', 'rules', 'repo-internal.mdc'))) return true;
  return false;
}

function execGit(cwd, args) {
  try {
    return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function inferRepoName(cwd) {
  const pkg = path.join(cwd, 'package.json');
  if (fs.existsSync(pkg)) {
    try {
      const j = JSON.parse(fs.readFileSync(pkg, 'utf8'));
      if (j.name && typeof j.name === 'string') return j.name.replace(/^@[^/]+\//, '');
    } catch {
      /* ignore */
    }
  }
  const cargo = path.join(cwd, 'Cargo.toml');
  if (fs.existsSync(cargo)) {
    const t = fs.readFileSync(cargo, 'utf8');
    const m = t.match(/^\s*name\s*=\s*"([^"]+)"/m);
    if (m) return m[1];
  }
  const goMod = path.join(cwd, 'go.mod');
  if (fs.existsSync(goMod)) {
    const t = fs.readFileSync(goMod, 'utf8');
    const m = t.match(/^\s*module\s+(\S+)/m);
    if (m) {
      const parts = m[1].split('/');
      return parts[parts.length - 1] || 'repo';
    }
  }
  const py = path.join(cwd, 'pyproject.toml');
  if (fs.existsSync(py)) {
    const t = fs.readFileSync(py, 'utf8');
    let m = t.match(/^\s*name\s*=\s*"([^"]+)"/m);
    if (m) return m[1];
    m = t.match(/\[project\][\s\S]*?^\s*name\s*=\s*"([^"]+)"/m);
    if (m) return m[1];
  }
  const url = execGit(cwd, ['remote', 'get-url', 'origin']);
  if (url) {
    const base = url.split(/[/:]/).pop() || '';
    const name = base.replace(/\.git$/, '');
    if (name) return name;
  }
  return path.basename(path.resolve(cwd)) || 'repo';
}

function templateRef(cacheRoot) {
  try {
    return execFileSync('git', ['-C', cacheRoot, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'unknown';
  }
}

function normalizeContent(s) {
  const withNl = String(s).replace(/\r\n/g, '\n');
  return withNl
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .join('\n')
    .trim();
}

function applyTemplateSubstitutions(s, repoName) {
  return String(s)
    .replace(/REPLACE-ME-with-repo-name/g, repoName)
    .replace(/REPO-NAME/g, repoName)
    .replace(/REPLACE-ME/g, repoName);
}

function normalizedTemplateHashSource(raw, repoName) {
  return normalizeContent(applyTemplateSubstitutions(raw, repoName));
}

function hasPlaceholderMarkers(repoRaw) {
  return PLACEHOLDER_RE.test(String(repoRaw));
}

function reportPath(cwd) {
  return path.join(cwd, '.claude', '.simpl-repo-report.json');
}

function isReportThrottled(cwd) {
  const p = reportPath(cwd);
  if (!fs.existsSync(p)) return false;
  const st = fs.statSync(p);
  return Date.now() - st.mtimeMs < THROTTLE_MS;
}

function analyzeOne(relPath, cwd, templateDir, repoName) {
  const tmplFile = path.join(templateDir, relPath);
  if (!fs.existsSync(tmplFile)) {
    return { path: relPath, status: 'skipped', reason: 'no_template_file' };
  }
  const tmplRaw = fs.readFileSync(tmplFile, 'utf8');
  const repoFile = path.join(cwd, relPath);

  if (!fs.existsSync(repoFile)) {
    return { path: relPath, status: 'missing' };
  }
  const repoRaw = fs.readFileSync(repoFile, 'utf8');
  if (hasPlaceholderMarkers(repoRaw)) {
    return { path: relPath, status: 'placeholder_only' };
  }
  const tNorm = normalizedTemplateHashSource(tmplRaw, repoName);
  const rNorm = normalizeContent(repoRaw);
  const h1 = crypto.createHash('sha256').update(tNorm, 'utf8').digest('hex');
  const h2 = crypto.createHash('sha256').update(rNorm, 'utf8').digest('hex');
  if (h1 === h2) return { path: relPath, status: 'aligned' };
  return { path: relPath, status: 'outdated' };
}

/**
 * @param {string} cwd
 * @param {{ skipGate?: boolean, skipThrottle?: boolean }} options
 */
function analyzeRepo(cwd, options = {}) {
  const skipGate = options.skipGate === true;
  const skipThrottle = options.skipThrottle === true;

  if (!skipGate && !isGitRepo(cwd)) {
    return {
      skipped: 'not_git',
      optedIn: false,
      items: [],
      hasDrift: false,
      repoName: null,
      templateDir: null,
      templateRef: null,
    };
  }
  if (!skipGate && !isOptedIn(cwd)) {
    return {
      skipped: 'not_opted_in',
      optedIn: false,
      items: [],
      hasDrift: false,
      repoName: inferRepoName(cwd),
      templateDir: null,
      templateRef: null,
    };
  }

  const cacheRoot = resolveSimplKnowledgeRoot();
  if (!cacheRoot) {
    return {
      skipped: 'no_cache',
      optedIn: true,
      items: [],
      hasDrift: false,
      repoName: inferRepoName(cwd),
      templateDir: null,
      templateRef: null,
    };
  }
  const templateDir = path.join(cacheRoot, 'library-repo-template');
  if (!fs.existsSync(templateDir)) {
    return {
      skipped: 'no_template_dir',
      optedIn: true,
      items: [],
      hasDrift: false,
      repoName: inferRepoName(cwd),
      templateDir: null,
      templateRef: templateRef(cacheRoot),
    };
  }

  const repoName = inferRepoName(cwd);
  const items = TRACKED_REL_PATHS.map((rel) => analyzeOne(rel, cwd, templateDir, repoName));
  const hasDrift = items.some((i) =>
    ['missing', 'placeholder_only', 'outdated'].includes(i.status),
  );

  return {
    skipped: null,
    optedIn: true,
    items,
    hasDrift,
    repoName,
    templateDir,
    templateRef: templateRef(cacheRoot),
    cacheRoot,
  };
}

function writeReport(cwd, result) {
  const p = reportPath(cwd);
  if (!result.hasDrift) {
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const payload = {
      generated_at: new Date().toISOString(),
      template_ref: result.templateRef,
      repo_name: result.repoName,
      items: result.items,
    };
    fs.writeFileSync(p, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  } catch (e) {
    console.error('[simpl-hooks] repo-context-check: could not write report');
    console.error(e.stack || e);
  }
}

function buildHookMessage(result) {
  const bad = result.items.filter((i) =>
    ['missing', 'placeholder_only', 'outdated'].includes(i.status),
  );
  if (bad.length === 0) return '';
  const preview = bad
    .slice(0, 6)
    .map((i) => `${i.path} (${i.status})`)
    .join('; ');
  const more = bad.length > 6 ? `; +${bad.length - 6} more` : '';
  return `simpl-knowledge: ${bad.length} file(s) drift vs library-repo-template. Suggest /bootstrap-repo-context. ${preview}${more}`;
}

function printHuman(result) {
  if (result.skipped === 'not_git') {
    console.log('Not a git repository — skip.');
    return;
  }
  if (result.skipped === 'not_opted_in') {
    console.log('Repo not opted in to simpl-knowledge template markers — skip.');
    return;
  }
  if (result.skipped === 'no_cache') {
    console.log('simpl-knowledge cache not found — run team-bootstrap or add marketplace.');
    return;
  }
  if (result.skipped === 'no_template_dir') {
    console.log('library-repo-template missing in cache — pull simpl-knowledge.');
    return;
  }
  console.log(`Repo: ${result.repoName}  template_ref: ${result.templateRef}`);
  for (const i of result.items) {
    if (i.status === 'skipped') console.log(`  [skip] ${i.path} ${i.reason || ''}`);
    else console.log(`  [${i.status}] ${i.path}`);
  }
  console.log(result.hasDrift ? '\nDrift detected.' : '\nAligned.');
}

function main() {
  const cwd = process.cwd();
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const skipGateCli = args.includes('--skip-gate');
  const fromWorker = args.includes('--from-refresh-worker');
  const emitHook = args.includes('--emit-claude-hook');
  const printHumanFlag = args.includes('--print');
  const machine = args.includes('--machine');

  try {
    if (machine || printHumanFlag || force) {
      const result = analyzeRepo(cwd, { skipGate: skipGateCli, skipThrottle: true });
      if (machine) {
        process.stdout.write(`${JSON.stringify(result)}\n`);
      } else {
        printHuman(result);
      }
      return process.exit(0);
    }

    if (emitHook) {
      if (!force && isReportThrottled(cwd)) return process.exit(0);
      const result = analyzeRepo(cwd, { skipGate: false });
      writeReport(cwd, result);
      if (!result.hasDrift) return process.exit(0);
      const msg = buildHookMessage(result);
      const line = {
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: msg,
        },
      };
      process.stdout.write(`${JSON.stringify(line)}\n`);
      return process.exit(0);
    }

    if (fromWorker) {
      if (!force && isReportThrottled(cwd)) return process.exit(0);
      const result = analyzeRepo(cwd, { skipGate: false });
      writeReport(cwd, result);
      return process.exit(0);
    }

    // default: same as fromWorker (manual run)
    if (!force && isReportThrottled(cwd)) return process.exit(0);
    const result = analyzeRepo(cwd, { skipGate: false });
    writeReport(cwd, result);
    if (result.hasDrift) printHuman(result);
    return process.exit(0);
  } catch (e) {
    console.error('[simpl-hooks] repo-context-check failed');
    console.error(e.stack || e);
    return process.exit(0);
  }
}

module.exports = {
  analyzeRepo,
  TRACKED_REL_PATHS,
  OWNED_BY_ORG,
  OWNED_BY_REPO,
  resolveSimplKnowledgeRoot,
  inferRepoName,
  writeReport,
  reportPath,
  normalizedTemplateHashSource,
  normalizeContent,
  applyTemplateSubstitutions,
};

if (require.main === module) {
  main();
}
