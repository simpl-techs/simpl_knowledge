#!/usr/bin/env python3
"""List the dev/stg configs that hold a production model key.

A model key (model-keys.txt) on dev or stg must be a separate key created at the
provider: the cost ledger and the provider bill tell production from tests only
by the key. Compares fingerprints across every Doppler project the login can
read; never prints a value. Maintainers only (needs read access to prd).

Usage:
  python3 -I scripts/doppler/check-model-keys.py

Exit code 1 when a dev or stg config holds a prd model key.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent
NON_PRD = ("dev", "stg")


def model_keys() -> list[str]:
    lines = (ROOT / "model-keys.txt").read_text().splitlines()
    return [line.split()[0] for line in lines if line.strip() and not line.startswith("#")]


def doppler_json(*args: str) -> object | None:
    result = subprocess.run(
        ["doppler", *args, "--json"], capture_output=True, text=True, timeout=60, check=False
    )
    return json.loads(result.stdout) if result.returncode == 0 else None


def fingerprints(project: str, config: str, keys: list[str]) -> dict[str, str] | None:
    """Short sha256 of each model key in one config; None when the config is unreadable."""
    secrets = doppler_json("secrets", "download", "-p", project, "-c", config, "--no-file")
    if not isinstance(secrets, dict):
        return None
    return {
        key: hashlib.sha256(secrets[key].encode()).hexdigest()[:12]
        for key in keys
        if secrets.get(key)
    }


def main() -> int:
    keys = model_keys()
    listed = doppler_json("projects")
    if not isinstance(listed, list):
        print("cannot list Doppler projects: run as a maintainer after doppler login", file=sys.stderr)
        return 2
    projects = sorted(item["id"] for item in listed)
    jobs = [(project, config) for project in projects for config in ("prd", *NON_PRD)]
    with ThreadPoolExecutor(8) as pool:
        found = dict(zip(jobs, pool.map(lambda job: fingerprints(*job, keys), jobs)))

    prd_owner: dict[str, list[str]] = {}
    for project in projects:
        for key, digest in (found[(project, "prd")] or {}).items():
            prd_owner.setdefault(digest, []).append(f"{project}/prd {key}")

    leaks = 0
    for project in projects:
        for config in NON_PRD:
            current = found[(project, config)]
            if not current:
                continue
            for key, digest in sorted(current.items()):
                if digest in prd_owner:
                    leaks += 1
                    print(f"PRD KEY  {project}/{config} {key} = {', '.join(prd_owner[digest])}")
                else:
                    print(f"ok       {project}/{config} {key}: own key")
    print(f"\n{leaks} dev/stg model keys are production keys" if leaks else "\nno production model key on dev/stg")
    return 1 if leaks else 0


if __name__ == "__main__":
    sys.exit(main())
