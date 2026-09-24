const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync, execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const script = path.join(root, 'scripts/ci/apply-library-sync.py');
function read(file) { return JSON.parse(fs.readFileSync(file)); }
function git(...args) { return execFileSync('git', args, { encoding: 'utf8' }).trim(); }
function writeSkill(temp, library, body) {
  fs.mkdirSync(path.join(temp, library, '.agent'), { recursive: true });
  fs.writeFileSync(path.join(temp, library, '.agent/SKILL.md'), `---\nname: ${library}\ndescription: Example integration fixture for library sync testing.\n---\n${body}\n`);
}
function execute(temp, library, { marketplace = path.join(temp, 'marketplace'), labels = [], publish = false } = {}) {
  const code = `import importlib.util, os, sys\nfrom unittest.mock import patch\nspec = importlib.util.spec_from_file_location('library_sync', sys.argv[1])\nmodule = importlib.util.module_from_spec(spec)\nspec.loader.exec_module(module)\nlabels = __import__('json').loads(sys.argv[2])\nsys.argv = [sys.argv[1]] + sys.argv[3:]\nwith patch.dict(os.environ, {'GITHUB_TOKEN': 'fixture-only'}), patch.object(module, '_get_json', return_value=[{'labels': [{'name': label} for label in labels]}]):\n    module.main()\n`;
  const args = ['--library-root', path.join(temp, library), '--marketplace-root', marketplace, '--repo-name', library, '--full-repo', `example-org/${library}`, '--sha', '0'.repeat(40)];
  return spawnSync('python3', ['-c', code, script, JSON.stringify(labels), ...args, ...(publish ? [] : ['--no-publish'])], { encoding: 'utf8', timeout: 60000, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
}
// A bare origin whose main is this repo's HEAD, plus a clean clone of it (what the library workflow checks out).
function originWithCheckout(temp) {
  const origin = path.join(temp, 'origin.git');
  const checkout = path.join(temp, 'marketplace');
  git('init', '--quiet', '--bare', origin);
  git('-C', root, 'push', '--quiet', origin, 'HEAD:refs/heads/main');
  git('clone', '--quiet', '--branch', 'main', origin, checkout);
  return { origin, checkout };
}
function originVersion(origin, file, name) {
  const json = JSON.parse(git('--git-dir', origin, 'show', `main:${file}`));
  return name ? json.plugins.find(p => p.name === name)?.version : json.version;
}
describe('library sync releases', () => {
  it('bumps standards for CHANGES.md and passes the real PR version gate', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'simpl-library-sync-'));
    try {
      // Arrange: real checkout; only the external GitHub labels request is mocked.
      const checkout = path.join(temp, 'marketplace');
      execFileSync('git', ['clone', '--quiet', root, checkout]);
      execFileSync('git', ['-C', checkout, 'update-ref', 'refs/remotes/origin/main', 'HEAD']);
      fs.copyFileSync(path.join(root, 'scripts/ci/validate-agent-infra.sh'), path.join(checkout, 'scripts/ci/validate-agent-infra.sh'));
      writeSkill(temp, 'example-library', 'Fixture content.');
      const standardsFile = path.join(checkout, 'plugins/simpl-standards/.claude-plugin/plugin.json');
      const before = read(standardsFile).version.split('.').map(Number);
      const beforeMemory = fs.readFileSync(path.join(checkout, 'plugins/simpl-memory/.claude-plugin/plugin.json'), 'utf8');

      // Act.
      const result = execute(temp, 'example-library');
      const validation = spawnSync('bash', [path.join(checkout, 'scripts/ci/validate-agent-infra.sh')], { cwd: checkout, env: { ...process.env, GITHUB_WORKSPACE: checkout, VALIDATE_BASE_REF: 'main' }, encoding: 'utf8' });

      // Assert.
      assert.equal(result.status, 0, result.stderr);
      const version = `${before[0]}.${before[1]}.${before[2] + 1}`;
      assert.equal(read(standardsFile).version, version);
      assert.equal(read(path.join(checkout, '.claude-plugin/marketplace.json')).plugins.find(p => p.name === 'simpl-standards').version, version);
      assert.equal(read(path.join(checkout, 'plugins/example-library-context/.claude-plugin/plugin.json')).version, '0.1.0');
      assert.equal(fs.readFileSync(path.join(checkout, 'plugins/simpl-memory/.claude-plugin/plugin.json'), 'utf8'), beforeMemory);
      assert.equal(validation.status, 0, validation.stdout + validation.stderr);

      // A breaking pre-stable release remains in 0.x.y.
      writeSkill(temp, 'example-library', 'Fixture content, breaking revision.');
      const next = execute(temp, 'example-library', { labels: ['breaking'] });
      assert.equal(next.status, 0, next.stderr);
      assert.equal(read(path.join(checkout, 'plugins/example-library-context/.claude-plugin/plugin.json')).version, '0.2.0');
    } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  });

  it('lands on main on top of a sync that won the push race', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'simpl-library-sync-'));
    try {
      // Arrange: a rival library sync is committed elsewhere and reaches origin main
      // right while our push is in flight (pre-push hook), so our first push is rejected.
      const { origin, checkout } = originWithCheckout(temp);
      const rival = path.join(temp, 'rival-checkout');
      git('clone', '--quiet', '--branch', 'main', origin, rival);
      writeSkill(temp, 'rival-library', 'Rival fixture content.');
      assert.equal(execute(temp, 'rival-library', { marketplace: rival }).status, 0);
      git('-C', rival, 'add', '-A');
      git('-C', rival, '-c', 'user.name=fixture', '-c', 'user.email=fixture@example.com', 'commit', '--quiet', '-m', 'sync(rival-library): fixture');
      const hook = path.join(checkout, '.git/hooks/pre-push');
      fs.writeFileSync(hook, `#!/bin/sh\n[ -f "${temp}/raced" ] && exit 0\ntouch "${temp}/raced"\nenv -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE git -C "${rival}" push --quiet origin HEAD:main\n`);
      fs.chmodSync(hook, 0o755);
      const before = originVersion(origin, 'plugins/simpl-standards/.claude-plugin/plugin.json').split('.').map(Number);
      writeSkill(temp, 'example-library', 'Fixture content.');

      // Act.
      const result = execute(temp, 'example-library', { publish: true });

      // Assert: ours sits on top of the rival, versions recomputed on the rival's main.
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.deepEqual(git('--git-dir', origin, 'log', '--format=%s', '-2', 'main').split('\n'), [
        'sync(example-library): update SKILL.md from upstream 0000000',
        'sync(rival-library): fixture',
      ]);
      const standards = `${before[0]}.${before[1]}.${before[2] + 2}`;
      assert.equal(originVersion(origin, 'plugins/simpl-standards/.claude-plugin/plugin.json'), standards);
      assert.equal(originVersion(origin, '.claude-plugin/marketplace.json', 'simpl-standards'), standards);
      assert.equal(originVersion(origin, '.claude-plugin/marketplace.json', 'rival-library-context'), '0.1.0');
      assert.equal(originVersion(origin, '.claude-plugin/marketplace.json', 'example-library-context'), '0.1.0');
    } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  });

  it('pushes nothing when main already carries the same SKILL.md', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'simpl-library-sync-'));
    try {
      // Arrange.
      const { origin } = originWithCheckout(temp);
      writeSkill(temp, 'example-library', 'Fixture content.');
      assert.equal(execute(temp, 'example-library', { publish: true }).status, 0);
      const published = git('--git-dir', origin, 'rev-parse', 'main');

      // Act.
      const again = execute(temp, 'example-library', { publish: true });

      // Assert.
      assert.equal(again.status, 0, again.stderr);
      assert.equal(git('--git-dir', origin, 'rev-parse', 'main'), published);
    } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  });
});
