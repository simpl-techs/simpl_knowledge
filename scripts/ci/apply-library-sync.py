#!/usr/bin/env python3
"""
Sync an upstream library .agent/SKILL.md into the simpl_knowledge marketplace
and publish it straight to main (no PR).

Bumps SemVer on the integration plugin, registers the plugin in marketplace.json
if new, appends provenance.jsonl and a CHANGES.md line, validates, commits and
pushes to origin/main. A push rejected because another library synced first is
retried on the fresh main: versions are recomputed there, never rebased.
A SKILL.md already identical on main is a no-op.

--no-publish only applies the files to the checkout (tests, local dry runs).

Run from GitHub Actions with GITHUB_TOKEN (read PR labels for the merge commit).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

PUBLISH_ATTEMPTS = 5
BOT_NAME = "simpl_knowledge-bot"
BOT_EMAIL = "bot@simpl.farm"


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
    m = re.fullmatch(r"(\d+)\.(\d+)\.(\d+)", v.strip())
    if not m:
        raise ValueError(f"Invalid plugin version: {v}")
    return tuple(int(x) for x in m.groups())


def _format_semver(t: tuple[int, int, int]) -> str:
    return f"{t[0]}.{t[1]}.{t[2]}"


def _git(root: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", "-C", str(root), *args], capture_output=True, text=True)


def _git_ok(root: Path, *args: str) -> str:
    result = _git(root, *args)
    if result.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} failed: {result.stderr.strip()}")
    return result.stdout


def _pr_labels(full_repo: str, sha: str, token: str) -> set[str]:
    labels: set[str] = set()
    try:
        pulls = _get_json(f"https://api.github.com/repos/{full_repo}/commits/{sha}/pulls", token)
        if isinstance(pulls, list):
            for pr in pulls:
                for lab in pr.get("labels") or []:
                    labels.add(str(lab.get("name", "")).lower())
    except urllib.error.HTTPError as e:
        print(f"Could not list PRs for commit (default patch bump): {e}", file=sys.stderr)
    return labels


def apply_sync(args: argparse.Namespace, labels: set[str]) -> str | None:
    """Write the SKILL and every derived file; return the new plugin version, or None if already current."""
    repo_name: str = args.repo_name
    plugin_name = f"{repo_name}-context"
    skill_src = args.library_root / ".agent" / "SKILL.md"
    if not skill_src.is_file():
        raise FileNotFoundError(f"Missing {skill_src}")

    mp_root: Path = args.marketplace_root
    plugin_dir = mp_root / "plugins" / plugin_name
    skill_dir = plugin_dir / "skills" / repo_name
    skill_dst = skill_dir / "SKILL.md"
    manifest = plugin_dir / ".claude-plugin" / "plugin.json"
    new_plugin = not manifest.is_file()
    skill_text = skill_src.read_text(encoding="utf-8")
    if not new_plugin and skill_dst.is_file() and skill_dst.read_text(encoding="utf-8") == skill_text:
        return None

    skill_dir.mkdir(parents=True, exist_ok=True)
    skill_dst.write_text(skill_text, encoding="utf-8")

    manifest.parent.mkdir(parents=True, exist_ok=True)
    if new_plugin:
        manifest.write_text(
            json.dumps(
                {
                    "name": plugin_name,
                    "version": "0.1.0",
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
    data = json.loads(manifest.read_text(encoding="utf-8"))
    ma, mi, pa = _parse_semver(data["version"])
    if new_plugin:
        ma, mi, pa = 0, 1, 0
    elif "breaking" in labels or "semver-major" in labels:
        ma, mi, pa = (0, mi + 1, 0) if ma == 0 else (ma + 1, 0, 0)
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
        / "simpl_knowledge_system"
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

    # CHANGES.md ships inside simpl-standards, so it needs its own cache release.
    standards_manifest = mp_root / "plugins/simpl-standards/.claude-plugin/plugin.json"
    standards = json.loads(standards_manifest.read_text(encoding="utf-8"))
    major, minor, patch = _parse_semver(standards["version"])
    standards["version"] = _format_semver((major, minor, patch + 1))
    standards_manifest.write_text(json.dumps(standards, indent=2) + "\n", encoding="utf-8")
    for plugin in plugins:
        if plugin["name"] == "simpl-standards":
            plugin["version"] = standards["version"]
            break
    else:
        raise ValueError("simpl-standards is missing from marketplace.json")
    mp_path.write_text(json.dumps(mp, indent=2) + "\n", encoding="utf-8")

    return new_ver


def publish(args: argparse.Namespace, labels: set[str]) -> None:
    """Apply on the latest origin/main and push; on a lost push race, start over from the new main."""
    mp_root: Path = args.marketplace_root
    # Every retry discards the tree, so it must hold nothing but our own output.
    if _git_ok(mp_root, "status", "--porcelain").strip():
        raise SystemExit(f"{mp_root} has local changes; publish needs a clean simpl_knowledge checkout")

    for attempt in range(1, PUBLISH_ATTEMPTS + 1):
        _git_ok(mp_root, "fetch", "--quiet", "origin", "main")
        _git_ok(mp_root, "checkout", "--quiet", "--force", "--detach", "FETCH_HEAD")
        _git_ok(mp_root, "clean", "-fdq")

        new_ver = apply_sync(args, labels)
        if new_ver is None:
            print(f"{args.repo_name}: SKILL.md already current on simpl_knowledge main, nothing to publish.")
            return

        env = {k: v for k, v in os.environ.items() if k not in ("VALIDATE_BASE_REF", "GITHUB_BASE_REF")}
        env["GITHUB_WORKSPACE"] = str(mp_root)
        validation = subprocess.run(["bash", str(mp_root / "scripts/ci/validate-agent-infra.sh")], env=env)
        if validation.returncode != 0:
            raise SystemExit("validate-agent-infra failed; nothing pushed to simpl_knowledge main")

        _git_ok(mp_root, "add", "-A")
        _git_ok(
            mp_root,
            "-c", f"user.name={BOT_NAME}",
            "-c", f"user.email={BOT_EMAIL}",
            "commit", "--quiet",
            "-m", f"sync({args.repo_name}): update SKILL.md from upstream {args.sha[:7]}",
        )
        push = _git(mp_root, "push", "--quiet", "origin", "HEAD:main")
        if push.returncode == 0:
            print(f"OK: {args.repo_name}-context v{new_ver} pushed to simpl_knowledge main")
            return
        print(f"Push attempt {attempt}/{PUBLISH_ATTEMPTS} rejected: {push.stderr.strip()}", file=sys.stderr)
        time.sleep(attempt * 3)

    raise SystemExit(f"Could not push to simpl_knowledge main after {PUBLISH_ATTEMPTS} attempts")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--library-root", type=Path, required=True)
    ap.add_argument("--marketplace-root", type=Path, required=True)
    ap.add_argument("--repo-name", required=True, help="Short repo name (directory name)")
    ap.add_argument("--full-repo", required=True, help="owner/name of library repo")
    ap.add_argument("--sha", required=True)
    ap.add_argument(
        "--no-publish",
        action="store_true",
        help="Only write the files into the checkout: no validate, commit or push",
    )
    args = ap.parse_args()

    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if not token:
        print("No GITHUB_TOKEN / GH_TOKEN", file=sys.stderr)
        sys.exit(1)

    labels = _pr_labels(args.full_repo, args.sha, token)
    if not args.no_publish:
        publish(args, labels)
        return

    new_ver = apply_sync(args, labels)
    if new_ver is None:
        print(f"{args.repo_name}: SKILL.md already current, nothing to apply.")
    else:
        print(f"OK: {args.repo_name}-context v{new_ver}")


if __name__ == "__main__":
    main()
