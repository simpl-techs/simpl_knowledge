#!/usr/bin/env node
/**
 * apply-repo-template.js — After user confirms: align repo files with library-repo-template.
 * Default: dry-run. Pass --write to apply.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  analyzeRepo,
  OWNED_BY_ORG,
  OWNED_BY_REPO,
  applyTemplateSubstitutions,
  writeReport,
} = require('./repo-context-check.js');

const write = process.argv.includes('--write');

function copySubst(relPath, cwd, templateDir, repoName) {
  const src = path.join(templateDir, relPath);
  if (!fs.existsSync(src)) {
    console.error(`Missing template file: ${relPath}`);
    return;
  }
  let body = fs.readFileSync(src, 'utf8');
  body = applyTemplateSubstitutions(body, repoName);
  const dest = path.join(cwd, relPath);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, body, 'utf8');
  if (relPath.endsWith('.sh')) {
    try {
      fs.chmodSync(dest, 0o755);
    } catch {
      /* ignore */
    }
  }
}

function main() {
  const cwd = process.cwd();
  try {
    execFileSync('git', ['-C', cwd, 'rev-parse', '--is-inside-work-tree'], { stdio: 'ignore' });
  } catch {
    console.error('[apply-repo-template] Not a git repository (run from repo root).');
    process.exit(1);
  }

  const result = analyzeRepo(cwd, { skipGate: true, skipThrottle: true });

  if (result.skipped === 'no_cache' || result.skipped === 'no_template_dir') {
    console.error(`[apply-repo-template] Cannot apply: ${result.skipped}`);
    process.exit(1);
  }
  if (!result.templateDir) {
    console.error('[apply-repo-template] No templateDir');
    process.exit(1);
  }

  const { repoName, templateDir, items } = result;
  const toCopy = [];
  const warnings = [];

  for (const item of items) {
    if (item.status === 'skipped' || item.status === 'aligned') continue;
    const rel = item.path;
    const org = OWNED_BY_ORG.has(rel);
    const repoOwned = OWNED_BY_REPO.has(rel);
    if (!org && !repoOwned) continue;

    if (item.status === 'outdated' && repoOwned) {
      warnings.push(
        `${rel}: outdated vs template but treated as repo-owned content — resolve manually or use /update-skill / edit file`,
      );
      continue;
    }
    if (item.status === 'missing' || item.status === 'placeholder_only' || item.status === 'outdated') {
      toCopy.push({ rel, org });
    }
  }

  if (!write) {
    console.log('Dry run (pass --write to apply).\n');
    console.log(`repo_name (inferred): ${repoName}`);
    console.log(`template: ${templateDir}\n`);
    if (warnings.length) {
      console.log('Warnings (will NOT overwrite):\n');
      for (const w of warnings) console.log(`  - ${w}`);
      console.log('');
    }
    console.log('bootstrap.sh will create any still-missing template files (idempotent).');
    console.log('Then org-owned and placeholder/missing repo-owned files below will be overwritten from template:\n');
    for (const { rel, org } of toCopy) {
      console.log(`  - ${rel} (${org ? 'org-owned' : 'repo-owned'})`);
    }
    return;
  }

  const bootstrap = path.join(templateDir, 'scripts', 'bootstrap.sh');
  execFileSync('bash', [bootstrap, repoName], { cwd, stdio: 'inherit' });

  for (const { rel } of toCopy) {
    copySubst(rel, cwd, templateDir, repoName);
    console.log(`updated ${rel}`);
  }

  try {
    const sync = path.join(cwd, '.claude', 'hooks', 'sync-cursor-internal.sh');
    if (fs.existsSync(sync)) {
      execFileSync('bash', [sync], { cwd, stdio: 'inherit' });
    }
  } catch (e) {
    console.error('[apply-repo-template] sync-cursor-internal failed');
    console.error(e.stack || e);
  }

  const fresh = analyzeRepo(cwd, { skipGate: true, skipThrottle: true });
  writeReport(cwd, fresh);
  console.log('\nDone. Review git diff, fill any remaining placeholders in .agent/* and CLAUDE.md, then commit.');
}

main();
