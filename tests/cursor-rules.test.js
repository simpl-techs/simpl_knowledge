const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const temporary = [];
function write(file, data) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data); }
function skill(temp, plugin, dir, name) {
  write(path.join(temp, 'plugins', plugin, 'skills', dir, 'SKILL.md'), `---\nname: ${name}\ndescription: Example skill for rule naming tests.\n---\n# ${name}\n`);
}
// A marketplace with consistent manifests, so the validator can only fail on skill rules.
function marketplace(plugins) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'simpl-rules-'));
  temporary.push(temp);
  for (const name of plugins) write(path.join(temp, 'plugins', name, '.claude-plugin/plugin.json'), JSON.stringify({ name, version: '0.1.0' }));
  write(path.join(temp, '.claude-plugin/marketplace.json'), JSON.stringify({ plugins: plugins.map(name => ({ name, version: '0.1.0' })) }));
  return temp;
}
function run(command, args, options = {}) {
  const env = { ...process.env };
  for (const key of ['VALIDATE_BASE_REF', 'GITHUB_BASE_REF', 'GITHUB_WORKSPACE']) delete env[key];
  return spawnSync(command, args, { encoding: 'utf8', timeout: 45000, ...options, env: { ...env, ...options.env } });
}
afterEach(() => { for (const dir of temporary.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

describe('Cursor rule names', () => {
  it('fails generation and keeps the previous rules when two skills map to one file', () => {
    const temp = marketplace(['simpl_foo-context']);
    skill(temp, 'simpl_foo-context', 'simpl_foo', 'simpl_foo');
    skill(temp, 'simpl_foo-context', 'simpl-foo', 'simpl-foo');
    write(path.join(temp, 'cursor-rules/simpl-foo.mdc'), 'previous release');

    const result = run('bash', [path.join(root, 'scripts/generate-cursor-rules.sh')], { cwd: temp });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /cursor-rules\/simpl-foo\.mdc would be written by plugins\/simpl_foo-context\/skills\/simpl-foo\/SKILL\.md, plugins\/simpl_foo-context\/skills\/simpl_foo\/SKILL\.md/);
    assert.equal(fs.readFileSync(path.join(temp, 'cursor-rules/simpl-foo.mdc'), 'utf8'), 'previous release');
    assert.equal(fs.existsSync(path.join(root, 'scripts/__pycache__')), false);
  });
  it('rejects every naming rule collision in validation and names both skills', () => {
    const temp = marketplace(['alpha', 'beta']);
    skill(temp, 'alpha', 'bar', 'simpl_bar_baz');
    skill(temp, 'beta', 'bar', 'simpl-bar-baz');
    skill(temp, 'alpha', 'qux', 'qux');
    skill(temp, 'beta', 'qux', 'simpl-qux');
    skill(temp, 'beta', 'unique', 'simpl_unique');

    const result = run('bash', [path.join(root, 'scripts/ci/validate-agent-infra.sh')], { env: { GITHUB_WORKSPACE: temp } });

    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /cursor-rules\/simpl-bar-baz\.mdc would be written by plugins\/alpha\/skills\/bar\/SKILL\.md, plugins\/beta\/skills\/bar\/SKILL\.md/);
    assert.match(result.stdout, /cursor-rules\/simpl-qux\.mdc would be written by plugins\/alpha\/skills\/qux\/SKILL\.md, plugins\/beta\/skills\/qux\/SKILL\.md/);
    assert.doesNotMatch(result.stdout, /simpl-unique/);
  });
  it('accepts distinct rule names in validation', () => {
    const temp = marketplace(['alpha']);
    skill(temp, 'alpha', 'one', 'simpl_one');
    skill(temp, 'alpha', 'two', 'two');

    const result = run('bash', [path.join(root, 'scripts/ci/validate-agent-infra.sh')], { env: { GITHUB_WORKSPACE: temp } });

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /validate-agent-infra OK/);
  });
});

describe('catalog', () => {
  it('catalogs the synced skill and warns when a context plugin holds a stale copy', () => {
    const temp = marketplace(['simpl_foo-context']);
    skill(temp, 'simpl_foo-context', 'simpl-foo', 'simpl-foo');
    skill(temp, 'simpl_foo-context', 'simpl_foo', 'simpl_foo');

    const result = run(process.execPath, [path.join(root, 'scripts/ci/generate-catalog.js'), '--root', temp]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /simpl_foo-context has 2 skills \(simpl-foo, simpl_foo\); cataloguing skills\/simpl_foo/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(temp, 'catalog.json'))).libraries[0].skill_name, 'simpl_foo');
  });
});
