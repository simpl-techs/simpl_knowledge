#!/usr/bin/env python3
"""List the dev/stg configs that hold a production model key, and load dev keys.

A model key (model-keys.txt) on dev or stg must be a separate key created at the
provider: the cost ledger and the provider bill tell production from tests only
by the key. Compares fingerprints across every Doppler project the login can
read; never prints a value. Maintainers only (needs read access to prd).

Usage:
  python3 -I scripts/doppler/check-model-keys.py
  python3 -I scripts/doppler/check-model-keys.py --load ~/.simpl/dev-model-keys.env

--load reads lines `project/KEY=value  # comment` (empty values are skipped),
writes each value on the project's dev config and on its stg config when one
exists, refuses a value that is any project's prd key, then runs the check.

Exit code 1 when a dev or stg config holds a prd model key or a line was refused.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent
NON_PRD = ("dev", "stg")
LINE = re.compile(r"^\s*([A-Za-z0-9_-]+)/([A-Z0-9_]+)\s*=\s*([^\s#]*)")

Found = dict[tuple[str, str], dict[str, str] | None]


def model_keys() -> list[str]:
    lines = (ROOT / "model-keys.txt").read_text().splitlines()
    return [line.split()[0] for line in lines if line.strip() and not line.startswith("#")]


def fingerprint(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()[:12]


def doppler_json(*args: str) -> object | None:
    result = subprocess.run(
        ["doppler", *args, "--json"], capture_output=True, text=True, timeout=60, check=False
    )
    return json.loads(result.stdout) if result.returncode == 0 else None


def fingerprints(project: str, config: str, keys: list[str]) -> dict[str, str] | None:
    """Fingerprint of each model key in one config; None when the config is unreadable."""
    secrets = doppler_json("secrets", "download", "-p", project, "-c", config, "--no-file")
    if not isinstance(secrets, dict):
        return None
    return {key: fingerprint(secrets[key]) for key in keys if secrets.get(key)}


def collect(projects: list[str], keys: list[str]) -> Found:
    jobs = [(project, config) for project in projects for config in ("prd", *NON_PRD)]
    with ThreadPoolExecutor(8) as pool:
        return dict(zip(jobs, pool.map(lambda job: fingerprints(*job, keys), jobs)))


def prd_owners(projects: list[str], found: Found) -> dict[str, list[str]]:
    owners: dict[str, list[str]] = {}
    for project in projects:
        for key, digest in (found[(project, "prd")] or {}).items():
            owners.setdefault(digest, []).append(f"{project}/prd {key}")
    return owners


def load(path: Path, keys: list[str], projects: list[str], found: Found) -> int:
    """Write the file's dev keys; return how many lines were refused."""
    owners = prd_owners(projects, found)
    refused = 0
    for number, raw in enumerate(path.read_text().splitlines(), 1):
        match = LINE.match(raw)
        if raw.lstrip().startswith("#") or not match:
            continue
        project, key, value = match.groups()
        if not value:
            continue
        where = f"line {number} {project}/{key}"
        if key not in keys:
            print(f"refused  {where}: not in model-keys.txt")
            refused += 1
            continue
        if project not in projects:
            print(f"refused  {where}: no such Doppler project")
            refused += 1
            continue
        if fingerprint(value) in owners:
            print(f"refused  {where}: that is the prd key of {', '.join(owners[fingerprint(value)])}")
            refused += 1
            continue
        for config in NON_PRD:
            if config != "dev" and found[(project, config)] is None:
                continue  # no stg config for this project
            result = subprocess.run(
                ["doppler", "secrets", "set", key, "-p", project, "-c", config, "--silent"],
                input=value, capture_output=True, text=True, timeout=60, check=False,
            )
            status = "set     " if result.returncode == 0 else "FAILED  "
            refused += result.returncode != 0
            print(f"{status} {project}/{config} {key}")
    return refused


def report(projects: list[str], found: Found) -> int:
    owners = prd_owners(projects, found)
    leaks = 0
    for project in projects:
        for config in NON_PRD:
            for key, digest in sorted((found[(project, config)] or {}).items()):
                if digest in owners:
                    leaks += 1
                    print(f"PRD KEY  {project}/{config} {key} = {', '.join(owners[digest])}")
                else:
                    print(f"ok       {project}/{config} {key}: own key")
    print(f"\n{leaks} dev/stg model keys are production keys" if leaks else "\nno production model key on dev/stg")
    return leaks


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--load", type=Path, help="file of project/KEY=value dev keys to write first")
    args = parser.parse_args()

    keys = model_keys()
    listed = doppler_json("projects")
    if not isinstance(listed, list):
        print("cannot list Doppler projects: run as a maintainer after doppler login", file=sys.stderr)
        return 2
    projects = sorted(item["id"] for item in listed)
    found = collect(projects, keys)

    refused = 0
    if args.load:
        refused = load(args.load.expanduser(), keys, projects, found)
        print()
        found = collect(projects, keys)
    leaks = report(projects, found)
    return 1 if leaks or refused else 0


if __name__ == "__main__":
    sys.exit(main())
