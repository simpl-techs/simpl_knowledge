#!/usr/bin/env node
/**
 * Generate catalog.md + catalog.json from *-context integration plugins.
 * Run from repo root (simpl_knowledge) or pass --root <path>.
 *
 * Reads each plugin's primary SKILL.md frontmatter: summary, when_to_use,
 * required_when (optional). Falls back to description + body intro when missing.
 */

const fs = require('node:fs');
const path = require('node:path');

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) return { fm: {}, body: text };
  const raw = m[1];
  const body = m[2];
  const fm = {};
  const lines = raw.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const km = /^([a-zA-Z0-9_-]+):\s*(.*)$/.exec(line);
    if (!km) {
      i += 1;
      continue;
    }
    const key = km[1];
    let rest = km[2];
    if (rest === '|' || rest === '>') {
      i += 1;
      const buf = [];
      while (i < lines.length) {
        const L = lines[i];
        if (/^[a-zA-Z0-9_-]+:/.test(L)) break;
        buf.push(L);
        i += 1;
      }
      fm[key] = buf.join('\n').replace(/^\n+|\n+$/g, '').trim();
      continue;
    }
    fm[key] = rest.replace(/^["']|["']$/g, '').trim();
    i += 1;
  }
  return { fm, body };
}

function firstHeadingLine(body) {
  const m = body.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : '';
}

function resolveMarketplaceAlias(root) {
  const cfg = path.join(root, 'config', 'simpl.json');
  try {
    const j = readJson(cfg);
    if (j.marketplace_alias) return j.marketplace_alias;
  } catch {
    /* ignore */
  }
  return process.env.MARKETPLACE_ALIAS || 'simpl';
}

function findPrimarySkillMd(pluginDir) {
  const skillsRoot = path.join(pluginDir, 'skills');
  if (!fs.existsSync(skillsRoot)) return null;
  const subs = fs
    .readdirSync(skillsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  for (const sub of subs) {
    const p = path.join(skillsRoot, sub, 'SKILL.md');
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function buildEntry(pluginName, pluginDir, marketplaceAlias) {
  const skillPath = findPrimarySkillMd(pluginDir);
  if (!skillPath) {
    return {
      plugin: pluginName,
      skill_name: null,
      summary: '(no SKILL.md — run sync)',
      when_to_use: '',
      required_when: null,
      plugin_install_command: `/plugin install ${pluginName}@${marketplaceAlias}`,
    };
  }
  const text = fs.readFileSync(skillPath, 'utf8');
  const { fm, body } = parseFrontmatter(text);
  const desc = (fm.description || '').trim();
  const summary =
    (fm.summary || '').trim() ||
    firstHeadingLine(body) ||
    desc.split('\n')[0] ||
    pluginName;
  const whenToUse =
    (fm.when_to_use || '').trim() ||
    (desc ? desc.slice(0, 500) : '');
  const req = (fm.required_when || '').trim();
  return {
    plugin: pluginName,
    skill_name: fm.name || path.basename(path.dirname(skillPath)),
    summary,
    when_to_use: whenToUse,
    required_when: req || null,
    plugin_install_command: `/plugin install ${pluginName}@${marketplaceAlias}`,
  };
}

function main() {
  const args = process.argv.slice(2);
  let root = path.resolve(__dirname, '..', '..');
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--root' && args[i + 1]) {
      root = path.resolve(args[i + 1]);
      i += 1;
    }
  }

  const pluginsDir = path.join(root, 'plugins');
  if (!fs.existsSync(pluginsDir)) {
    console.error('generate-catalog: plugins/ not found under', root);
    process.exit(1);
  }

  const alias = resolveMarketplaceAlias(root);
  const entries = [];

  for (const name of fs.readdirSync(pluginsDir)) {
    if (!name.endsWith('-context')) continue;
    const pluginDir = path.join(pluginsDir, name);
    const manifest = path.join(pluginDir, '.claude-plugin', 'plugin.json');
    if (!fs.statSync(pluginDir).isDirectory() || !fs.existsSync(manifest)) continue;
    entries.push(buildEntry(name, pluginDir, alias));
  }

  entries.sort((a, b) => a.plugin.localeCompare(b.plugin));

  const generatedAt = new Date().toISOString();
  const jsonOut = {
    generated_at: generatedAt,
    marketplace_alias: alias,
    libraries: entries,
  };

  const mdLines = [
    '# simpl internal libraries catalog',
    '',
    `Auto-generated at \`${generatedAt}\`. Do not edit by hand — run \`node scripts/ci/generate-catalog.js\` or merge a library sync PR.`,
    '',
    'Each entry summarizes an integration plugin (`*-context`). Install the plugin in Claude Code for the full SKILL. Until then, use this file to decide whether a library fits the current task.',
    '',
  ];

  for (const e of entries) {
    mdLines.push(`## ${e.plugin}`, '');
    if (e.skill_name) mdLines.push(`- **Skill**: \`${e.skill_name}\``);
    mdLines.push(`- **Summary**: ${e.summary}`);
    mdLines.push(`- **When to use**: ${e.when_to_use || '_(see skill description)_'}`);
    if (e.required_when) mdLines.push(`- **Required when**: ${e.required_when}`);
    mdLines.push(`- **Install full context (Claude Code)**: \`${e.plugin_install_command}\``);
    mdLines.push(
      `- **Skill path in cache**: \`~/.claude/plugins/cache/simpl-knowledge/plugins/${e.plugin}/skills/\``,
    );
    mdLines.push('');
  }

  fs.writeFileSync(path.join(root, 'catalog.json'), `${JSON.stringify(jsonOut, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(root, 'catalog.md'), mdLines.join('\n'), 'utf8');
  console.log(`generate-catalog: wrote ${entries.length} entries to catalog.md + catalog.json`);
}

main();
