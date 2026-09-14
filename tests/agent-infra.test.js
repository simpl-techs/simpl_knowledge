const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync, execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const temporary = [];
function write(file, data) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data); }
function fixture(agents = ['codex', 'cursor']) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'simpl-infra-'));
  temporary.push(temp);
  const home = path.join(temp, 'home with spaces');
  const bin = path.join(temp, 'bin');
  // Actions checks out PRs detached; expose that exact commit as the fixture main.
  const upstream = path.join(temp, 'upstream.git');
  execFileSync('git', ['clone', '--quiet', '--bare', root, upstream]);
  execFileSync('git', ['--git-dir', upstream, 'update-ref', 'refs/heads/main', execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()]);
  execFileSync('git', ['--git-dir', upstream, 'symbolic-ref', 'HEAD', 'refs/heads/main']);
  fs.mkdirSync(home); fs.mkdirSync(bin);
  for (const name of ['git', 'bash', 'sh', 'dirname', 'mkdir', 'cp', 'mv', 'rm', 'cat', 'head', 'date', 'sed', 'python3']) {
    const executable = execFileSync('/bin/sh', ['-c', `command -v ${name}`], { encoding: 'utf8' }).trim();
    fs.symlinkSync(executable, path.join(bin, name));
  }
  fs.symlinkSync(process.execPath, path.join(bin, 'node'));
  for (const agent of agents) fs.mkdirSync(path.join(home, `.${agent}`));
  const env = { ...process.env, HOME: home, PATH: bin, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: path.join(temp, 'gitconfig'),
    GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: `url.${upstream}.insteadOf`, GIT_CONFIG_VALUE_0: 'https://github.com/simpl-techs/simpl_knowledge.git' };
  for (const key of ['CODEX_HOME', 'CLAUDE_CONFIG_DIR', 'SIMPL_KNOWLEDGE_CACHE', 'SIMPL_KNOWLEDGE_FORCE_REFRESH', 'SIMPL_SHARED_HOOKS', 'VALIDATE_BASE_REF', 'GITHUB_BASE_REF', 'GITHUB_WORKSPACE']) delete env[key];
  return { temp, home, bin, env, upstream, cache: path.join(home, '.simpl_knowledge/cache') };
}
function run(f, command, args, options = {}) {
  return spawnSync(command, args, { cwd: root, env: f.env, encoding: 'utf8', timeout: 45000, ...options });
}
function succeeds(result) { assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}\n${result.error || ''}`); }
function bootstrap(f, ...args) { return run(f, 'bash', [path.join(root, 'scripts/team-bootstrap.sh'), ...args]); }
function sync(f) { return run(f, process.execPath, [path.join(root, 'scripts/shared-hooks/sync-codex-knowledge.js'), f.cache]); }
afterEach(() => { for (const dir of temporary.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

describe('team bootstrap', () => {
  it('installs Cursor and Codex from a fresh home and stays idempotent', () => {
    const f = fixture();
    write(path.join(f.home, '.codex/AGENTS.md'), 'Personal instructions.\n');

    const first = bootstrap(f);
    succeeds(first);
    const agents = fs.readFileSync(path.join(f.home, '.codex/AGENTS.md'), 'utf8');
    const second = bootstrap(f);

    succeeds(second);
    assert.match(first.stdout, /doctor OK/);
    assert.match(agents, /Personal instructions\.[\s\S]*`git-workflow`/);
    assert.equal(fs.readFileSync(path.join(f.home, '.codex/AGENTS.md'), 'utf8'), agents);
    const hooks = JSON.parse(fs.readFileSync(path.join(f.home, '.cursor/hooks.json')));
    assert.equal(hooks.hooks.sessionStart.length, 1);
    assert.match(hooks.hooks.sessionStart[0].command, /".*home with spaces.*adapter.js"/);
  });
  it('installs Codex alone without requiring Cursor or Claude', () => {
    const f = fixture(['codex']);

    const result = bootstrap(f);

    succeeds(result);
    assert.match(result.stdout, /doctor OK/);
    assert.equal(fs.existsSync(path.join(f.home, '.cursor')), false);
    assert.ok(fs.lstatSync(path.join(f.home, '.agents/skills/git-workflow')).isSymbolicLink());
  });
  it('leaves the filesystem untouched in dry-run mode', () => {
    const f = fixture();
    const before = fs.readdirSync(f.home);

    const result = bootstrap(f, '--dry-run');

    succeeds(result);
    assert.deepEqual(fs.readdirSync(f.home), before);
    assert.deepEqual(fs.readdirSync(path.join(f.home, '.cursor')), []);
  });
  it('fails when the remote cache cannot be fetched', () => {
    const f = fixture(['codex']);
    f.env.GIT_CONFIG_KEY_0 = `url.${path.join(f.temp, 'missing-repository')}.insteadOf`;

    const result = bootstrap(f);

    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stdout, /doctor OK|==> Done/);
  });
});

describe('Codex sync and doctor', () => {
  it('preserves required instructions when cache rules disappear', () => {
    const f = fixture(['codex']);
    succeeds(bootstrap(f));
    const agents = path.join(f.home, '.codex/AGENTS.md');
    const before = fs.readFileSync(agents, 'utf8');
    fs.rmSync(path.join(f.cache, 'cursor-rules'), { recursive: true });

    const result = sync(f);

    assert.notEqual(result.status, 0);
    assert.equal(fs.readFileSync(agents, 'utf8'), before);
    assert.match(before, /`git-workflow`/);
  });
  it('preserves external skill links and rejects incomplete synchronization', () => {
    const f = fixture(['codex']);
    succeeds(bootstrap(f));
    const link = path.join(f.home, '.codex/skills/git-workflow');
    const external = path.join(f.temp, 'personal-skill');
    write(path.join(external, 'SKILL.md'), 'Personal skill.');
    fs.unlinkSync(link); fs.symlinkSync(external, link);
    write(path.join(f.home, '.codex/skills/.system/owned.txt'), 'System skill.');

    const result = sync(f);
    const doctor = run(f, 'bash', [path.join(root, 'scripts/doctor.sh')]);

    assert.notEqual(result.status, 0);
    assert.equal(fs.readlinkSync(link), external);
    assert.equal(fs.readFileSync(path.join(f.home, '.codex/skills/.system/owned.txt'), 'utf8'), 'System skill.');
    assert.notEqual(doctor.status, 0);
    assert.match(doctor.stdout, /missing or incorrect .codex\/skills\/git-workflow/);
  });
  it('preserves text outside markers byte for byte and rejects malformed markers', () => {
    const f = fixture(['codex']);
    succeeds(bootstrap(f));
    const agents = path.join(f.home, '.codex/AGENTS.md');
    write(agents, 'before\n\n<!-- simpl_knowledge:start -->\nold\n<!-- simpl_knowledge:end -->\n\n\nafter\n');

    succeeds(sync(f));
    const updated = fs.readFileSync(agents, 'utf8');
    write(agents, 'Personal\n<!-- simpl_knowledge:start -->\nbroken');
    const result = sync(f);

    assert.ok(updated.startsWith('before\n\n<!-- simpl_knowledge:start -->'));
    assert.ok(updated.endsWith('<!-- simpl_knowledge:end -->\n\n\nafter\n'));
    assert.notEqual(result.status, 0);
    assert.equal(fs.readFileSync(agents, 'utf8'), 'Personal\n<!-- simpl_knowledge:start -->\nbroken');
  });
  it('fails doctor for missing skills and malformed hook registration', () => {
    const f = fixture();
    succeeds(bootstrap(f));
    fs.unlinkSync(path.join(f.home, '.agents/skills/git-workflow'));
    write(path.join(f.home, '.cursor/hooks.json'), '{"sessionStart": []}');

    const result = run(f, 'bash', [path.join(root, 'scripts/doctor.sh')]);

    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /doctor FAILED/);
    assert.match(result.stdout, /missing or incorrect .agents\/skills\/git-workflow/);
  });
});

describe('session refresh', () => {
  it('fetches a newer real commit and updates rules, copied hooks, skills and context', () => {
    const f = fixture();
    succeeds(bootstrap(f));
    const expected = execFileSync('git', ['-C', f.cache, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const previous = execFileSync('git', ['-C', f.cache, 'rev-parse', 'HEAD~1'], { encoding: 'utf8' }).trim();
    // Move only the disposable fixture cache back to a real preceding release.
    succeeds(run(f, 'git', ['-C', f.cache, 'reset', '--hard', previous]));
    write(path.join(f.home, '.cursor/rules/simpl-git-workflow.mdc'), 'stale');
    write(path.join(f.home, '.cursor/hooks/shared-hooks/session-refresh.js'), '// stale');
    fs.unlinkSync(path.join(f.home, '.agents/skills/git-workflow'));
    const hook = path.join(root, 'scripts/shared-hooks/session-refresh.js');

    const result = run(f, process.execPath, [hook], { cwd: f.temp, input: '{"_harness":"cursor"}' });

    succeeds(result);
    assert.match(JSON.parse(result.stdout).additional_context, new RegExp(expected.slice(0, 12)));
    const state = JSON.parse(fs.readFileSync(path.join(f.home, '.simpl_knowledge/state.json')));
    assert.equal(state.cache_sha, expected);
    assert.equal(state.last_refresh_ok, true);
    assert.ok(fs.lstatSync(path.join(f.home, '.agents/skills/git-workflow')).isSymbolicLink());
    assert.equal(fs.readFileSync(path.join(f.home, '.cursor/hooks/shared-hooks/session-refresh.js'), 'utf8'), fs.readFileSync(path.join(f.cache, 'scripts/shared-hooks/session-refresh.js'), 'utf8'));
    succeeds(run(f, 'bash', [path.join(root, 'scripts/doctor.sh')]));

    // The same SHA must still repair a missing rule rather than trust the timestamp.
    const rule = path.join(f.home, '.cursor/rules/simpl-git-workflow.mdc');
    fs.unlinkSync(rule);
    succeeds(run(f, process.execPath, [hook], { cwd: f.temp, input: '{"_harness":"cursor"}' }));
    assert.match(fs.readFileSync(rule, 'utf8'), /Conventional Commits/);

    // A filesystem failure must be surfaced to the session and persisted.
    fs.unlinkSync(rule); fs.mkdirSync(rule);
    const failed = run(f, process.execPath, [hook], { cwd: f.temp, input: '{"_harness":"cursor"}' });
    assert.match(JSON.parse(failed.stdout).additional_context, /WARNING/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(f.home, '.simpl_knowledge/state.json'))).last_refresh_ok, false);
  });
});

describe('Claude plugin refresh', () => {
  it('updates the user-scoped simpl plugin and refreshes the shared cache globally', () => {
    const f = fixture(['codex']);
    const clone = path.join(f.home, '.claude/plugins/marketplaces/simpl');
    fs.mkdirSync(path.dirname(clone), { recursive: true });
    succeeds(run(f, 'git', ['clone', '--quiet', f.upstream, clone]));
    const versions = JSON.parse(fs.readFileSync(path.join(clone, '.claude-plugin/marketplace.json'))).plugins;
    const installedFile = path.join(f.home, '.claude/plugins/installed_plugins.json');
    const installed = { plugins: Object.fromEntries(versions.filter(p => ['simpl-standards', 'simpl-memory', 'simpl-libraries'].includes(p.name)).map(p => [`${p.name}@simpl`, [{ scope: 'user', version: p.name === 'simpl-standards' ? '0.1.0' : p.version }]])) };
    installed.plugins['simpl-standards@simpl'].unshift({ scope: 'project', version: '99.0.0' });
    installed.plugins['simpl-standards@different-marketplace'] = [{ scope: 'user', version: '99.0.0' }];
    write(installedFile, JSON.stringify(installed));
    const fake = path.join(f.bin, 'claude');
    write(fake, `#!/usr/bin/env node\nconst fs=require('fs'); const path=require('path'); const args=process.argv.slice(2); if(args[1]==='update') { const file=path.join(process.env.HOME,'.claude/plugins/installed_plugins.json'); const installed=JSON.parse(fs.readFileSync(file)); const name=args[2].split('@')[0]; const versions=JSON.parse(fs.readFileSync(path.join(process.env.HOME,'.claude/plugins/marketplaces/simpl/.claude-plugin/marketplace.json'))).plugins; installed.plugins[args[2]].find(e=>e.scope==='user').version=versions.find(p=>p.name===name).version; fs.writeFileSync(file,JSON.stringify(installed)); }\n`);
    fs.chmodSync(fake, 0o755);
    f.env.CLAUDE_BIN = fake;

    const result = run(f, process.execPath, [path.join(root, 'scripts/shared-hooks/plugin-refresh.js')], { cwd: f.temp });

    succeeds(result);
    const current = JSON.parse(fs.readFileSync(installedFile)).plugins;
    assert.equal(current['simpl-standards@simpl'].find(e => e.scope === 'user').version, versions.find(p => p.name === 'simpl-standards').version);
    assert.equal(current['simpl-standards@different-marketplace'][0].version, '99.0.0');
    assert.ok(fs.lstatSync(path.join(f.home, '.codex/skills/git-workflow')).isSymbolicLink());
    assert.match(JSON.parse(result.stdout).hookSpecificOutput.additionalContext, /Claude plugins updated/);
    assert.equal(fs.readFileSync(path.join(root, 'scripts/shared-hooks/plugin-refresh.js'), 'utf8'), fs.readFileSync(path.join(root, 'plugins/simpl-standards/scripts/hooks/plugin-refresh.js'), 'utf8'));

    // CLI exit zero alone is insufficient: installed metadata must advance.
    current['simpl-standards@simpl'].find(e => e.scope === 'user').version = '0.1.0';
    write(installedFile, JSON.stringify({ plugins: current }));
    write(fake, '#!/usr/bin/env node\nprocess.exit(0);\n');
    const unchanged = run(f, process.execPath, [path.join(root, 'scripts/shared-hooks/plugin-refresh.js')], { cwd: f.temp });
    assert.match(JSON.parse(unchanged.stdout).hookSpecificOutput.additionalContext, /WARNING: plugin auto-update failed/);
  });
});

describe('legacy cache migration', () => {
  it('moves the checkout outside Claude garbage collection and relinks old skills', () => {
    const f = fixture();
    const legacy = path.join(f.home, '.claude/plugins/cache/simpl_knowledge');
    fs.mkdirSync(path.dirname(legacy), { recursive: true });
    succeeds(run(f, 'git', ['clone', '--quiet', f.upstream, legacy]));
    const skill = path.join(legacy, 'plugins/simpl-standards/skills/git-workflow');
    for (const dir of ['.agents/skills', '.codex/skills']) {
      fs.mkdirSync(path.join(f.home, dir), { recursive: true });
      fs.symlinkSync(skill, path.join(f.home, dir, 'git-workflow'));
    }
    // Reproduce the observed cleanup: tracked files missing at an unchanged SHA.
    fs.rmSync(path.join(legacy, 'cursor-rules'), { recursive: true });

    const result = bootstrap(f);

    succeeds(result);
    assert.equal(fs.existsSync(legacy), false);
    assert.ok(fs.readdirSync(path.join(f.home, '.simpl_knowledge/backups')).some(file => file.startsWith('legacy-cache-')));
    assert.equal(fs.realpathSync(path.join(f.home, '.codex/skills/git-workflow')), fs.realpathSync(path.join(f.cache, 'plugins/simpl-standards/skills/git-workflow')));
    assert.match(result.stdout, /doctor OK/);
  });
});
