const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync, execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const script = path.join(root, 'scripts/ci/apply-library-sync.py');
function read(file) { return JSON.parse(fs.readFileSync(file)); }
function execute(temp, library, labels = []) {
  const code = `import importlib.util, os, sys\nfrom unittest.mock import patch\nspec = importlib.util.spec_from_file_location('library_sync', sys.argv[1])\nmodule = importlib.util.module_from_spec(spec)\nspec.loader.exec_module(module)\nlabels = __import__('json').loads(sys.argv[2])\nsys.argv = [sys.argv[1]] + sys.argv[3:]\nwith patch.dict(os.environ, {'GITHUB_TOKEN': 'fixture-only'}), patch.object(module, '_get_json', return_value=[{'labels': [{'name': label} for label in labels]}]):\n    module.main()\n`;
  return spawnSync('python3', ['-c', code, script, JSON.stringify(labels), '--library-root', path.join(temp, 'library'), '--marketplace-root', path.join(temp, 'marketplace'), '--repo-name', library, '--full-repo', `example-org/${library}`, '--sha', '0'.repeat(40)], { encoding: 'utf8', timeout: 20000, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
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
      fs.mkdirSync(path.join(temp, 'library/.agent'), { recursive: true });
      fs.writeFileSync(path.join(temp, 'library/.agent/SKILL.md'), '---\nname: example-library\ndescription: Example integration fixture for library sync testing.\n---\nFixture content.\n');
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
      const next = execute(temp, 'example-library', ['breaking']);
      assert.equal(next.status, 0, next.stderr);
      assert.equal(read(path.join(checkout, 'plugins/example-library-context/.claude-plugin/plugin.json')).version, '0.2.0');
    } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  });
});
