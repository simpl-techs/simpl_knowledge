#!/usr/bin/env node
/**
 * secret-scan.js — shared pre-tool hook (simpl-knowledge).
 * Blocks obvious secrets in tool input. Regex + simple entropy heuristic.
 */

const PATTERNS = [
  { name: 'AWS access key', re: /\b(AKIA|ASIA)[A-Z0-9]{16}\b/ },
  { name: 'GitHub PAT', re: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/ },
  { name: 'Anthropic API key', re: /\bsk-ant-[a-zA-Z0-9_-]{20,}\b/ },
  { name: 'OpenAI API key', re: /\bsk-[a-zA-Z0-9]{40,}\b/ },
  { name: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'Stripe key', re: /\b(pk|sk|rk)_(live|test)_[A-Za-z0-9]{20,}\b/ },
  { name: 'Private key PEM', re: /-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
  { name: 'JWT', re: /\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/ },
  { name: 'GCP service account', re: /"type"\s*:\s*"service_account"/ },
  { name: 'Databricks PAT', re: /\bdapi[a-f0-9]{32,}\b/i },
  { name: 'Supabase service role', re: /\bsb_secret_[A-Za-z0-9_-]{20,}\b/ },
  { name: 'Supabase anon (long)', re: /\beyJ[a-zA-Z0-9_-]{200,}\.[a-zA-Z0-9_-]{50,}\.[a-zA-Z0-9_-]{50,}\b/ },
  { name: 'Vercel token', re: /\bvercel_[A-Za-z0-9_]{20,}\b/i },
  { name: 'Notion integration', re: /\bsecret_[A-Za-z0-9]{40,}\b/ },
  { name: 'Linear API', re: /\blin_api_[A-Za-z0-9]{20,}\b/ },
  { name: 'Google OAuth client secret', re: /\bGOCSPX-[A-Za-z0-9_-]{20,}\b/ },
];

function highEntropyAlphanumeric(s) {
  if (s.length < 40) return false;
  const subset = s.slice(0, 64);
  const uniq = new Set(subset).size;
  return uniq / subset.length > 0.35;
}

async function main() {
  const payload = await readStdin();
  if (!payload) return ok();

  const haystack = JSON.stringify(payload.tool_input || payload);

  for (const { name, re } of PATTERNS) {
    const match = haystack.match(re);
    if (match) {
      console.error(`[simpl-hooks] Blocked: possible ${name} in tool input.`);
      console.error(`[simpl-hooks]    Preview: ${match[0].slice(0, 20)}…`);
      console.error(`[simpl-hooks]    If false positive, run the command yourself outside the agent.`);
      process.exit(2);
    }
  }

  const longTokens = haystack.match(/[A-Za-z0-9+/=_-]{40,}/g) || [];
  for (const t of longTokens.slice(0, 30)) {
    if (highEntropyAlphanumeric(t)) {
      console.error('[simpl-hooks] Blocked: high-entropy token (possible secret paste).');
      console.error(`[simpl-hooks]    Preview: ${t.slice(0, 24)}…`);
      process.exit(2);
    }
  }
  ok();
}

function ok() {
  process.exit(0);
}

function readStdin() {
  return new Promise((resolve) => {
    let d = '';
    if (process.stdin.isTTY) return resolve(null);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (d += c));
    process.stdin.on('end', () => {
      try {
        resolve(JSON.parse(d));
      } catch {
        resolve(null);
      }
    });
    setTimeout(() => resolve(null), 1500);
  });
}

main().catch(() => ok());
