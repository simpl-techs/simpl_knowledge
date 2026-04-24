#!/usr/bin/env python3
"""
Apply upstream library .agent/SKILL.md into simpl-knowledge marketplace checkout.
Bumps SemVer on integration plugin, registers plugin in marketplace.json if new,
appends provenance.jsonl and CHANGES.md reference.

Run from GitHub Actions with GITHUB_TOKEN (read PR labels for the merge commit).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


def _get_json(url: str, token: str) -> list | dict:
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode())


def _parse_semver(v: str) -> tuple[int, int, int]:
    v = (v or "1.0.0").strip()
    m = re.match(r"^(\d+)\.(\d+)\.(\d+)", v)
    if not m:
        return (1, 0, 0)
    return tuple(int(x) for x in m.groups())


def _format_semver(t: tuple[int, int, int]) -> str:
    return f"{t[0]}.{t[1]}.{t[2]}"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--library-root", type=Path, required=True)
    ap.add_argument("--marketplace-root", type=Path, required=True)
    ap.add_argument("--repo-name", required=True, help="Short repo name (directory name)")
    ap.add_argument("--full-repo", required=True, help="owner/name of library repo")
    ap.add_argument("--sha", required=True)
    args = ap.parse_args()

    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if not token:
        print("No GITHUB_TOKEN / GH_TOKEN", file=sys.stderr)
        sys.exit(1)

    repo_name: str = args.repo_name
    plugin_name = f"{repo_name}-context"
    skill_src = args.library_root / ".agent" / "SKILL.md"
    if not skill_src.is_file():
        print(f"Missing {skill_src}", file=sys.stderr)
        sys.exit(1)

    mp_root: Path = args.marketplace_root
    plugin_dir = mp_root / "plugins" / plugin_name
    skill_dir = plugin_dir / "skills" / repo_name
    skill_dir.mkdir(parents=True, exist_ok=True)
    skill_dst = skill_dir / "SKILL.md"
    skill_dst.write_text(skill_src.read_text(encoding="utf-8"), encoding="utf-8")

    manifest = plugin_dir / ".claude-plugin" / "plugin.json"
    manifest.parent.mkdir(parents=True, exist_ok=True)
    org = args.full_repo.split("/")[0]
    if not manifest.is_file():
        manifest.write_text(
            json.dumps(
                {
                    "name": plugin_name,
                    "version": "1.0.0",
                    "description": f"Integration context for {repo_name}. Auto-synced from {args.full_repo}.",
                    "author": {"name": f"{repo_name} maintainers"},
                    "keywords": [repo_name, "integration"],
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )

    # PR labels -> semver bump
    labels: set[str] = set()
    try:
        pulls = _get_json(
            f"https://api.github.com/repos/{args.full_repo}/commits/{args.sha}/pulls",
            token,
        )
        if isinstance(pulls, list):
            for pr in pulls:
                for lab in pr.get("labels") or []:
                    labels.add(str(lab.get("name", "")).lower())
    except urllib.error.HTTPError as e:
        print(f"Could not list PRs for commit (default patch bump): {e}", file=sys.stderr)

    data = json.loads(manifest.read_text(encoding="utf-8"))
    ma, mi, pa = _parse_semver(str(data.get("version", "1.0.0")))
    if "breaking" in labels or "semver-major" in labels:
        ma, mi, pa = ma + 1, 0, 0
    elif (
        "enhancement" in labels
        or "feature" in labels
        or "semver-minor" in labels
        or "feat" in labels
    ):
        mi, pa = mi + 1, 0
    else:
        pa = pa + 1

    new_ver = _format_semver((ma, mi, pa))
    data["version"] = new_ver
    manifest.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")

    mp_path = mp_root / ".claude-plugin" / "marketplace.json"
    mp = json.loads(mp_path.read_text(encoding="utf-8"))
    plugins = mp.get("plugins") or []
    found = False
    for p in plugins:
        if p.get("name") == plugin_name:
            p["version"] = new_ver
            found = True
            break
    if not found:
        plugins.append(
            {
                "name": plugin_name,
                "source": f"./plugins/{plugin_name}",
                "description": f"Integration context for {repo_name}. Auto-synced from {args.full_repo}.",
                "version": new_ver,
                "keywords": [repo_name, "integration", "simpl"],
            }
        )
    mp["plugins"] = plugins
    mp_path.write_text(json.dumps(mp, indent=2) + "\n", encoding="utf-8")

    catalog_script = mp_root / "scripts" / "ci" / "generate-catalog.js"
    if catalog_script.is_file():
        try:
            subprocess.run(
                ["node", str(catalog_script), "--root", str(mp_root)],
                check=True,
                timeout=120,
            )
        except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired) as e:
            print(f"generate-catalog.js failed (non-fatal for sync): {e}", file=sys.stderr)

    prov_path = mp_root / "provenance.jsonl"
    record = {
        "repo": args.full_repo,
        "sha": args.sha,
        "skill_name": repo_name,
        "plugin": plugin_name,
        "plugin_version": new_ver,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "actor": os.environ.get("GITHUB_ACTOR", "unknown"),
    }
    with prov_path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")

    changes = (
        mp_root
        / "plugins"
        / "simpl-standards"
        / "skills"
        / "simpl-knowledge-system"
        / "references"
        / "CHANGES.md"
    )
    changes.parent.mkdir(parents=True, exist_ok=True)
    line = (
        f"- `{record['timestamp'][:10]}` sync `{args.full_repo}` @ `{args.sha[:7]}` "
        f"→ `{plugin_name}` **v{new_ver}**\n"
    )
    prev = changes.read_text(encoding="utf-8") if changes.is_file() else ""
    changes.write_text(line + prev, encoding="utf-8")

    print(f"OK: {plugin_name} v{new_ver}")


if __name__ == "__main__":
    main()
