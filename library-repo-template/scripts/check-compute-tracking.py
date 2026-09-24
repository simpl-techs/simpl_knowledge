#!/usr/bin/env python3
"""Warn when a deploy's workload would not record its Google Cloud compute cost.

Owned by simpl_knowledge (library-repo-template). Run it as the first Cloud Build
step of every repo that deploys to Google Cloud:

    - name: 'python:3.12-slim'
      entrypoint: 'python3'
      args: ['scripts/check-compute-tracking.py', '--kind', 'service']

--kind names what the repo deploys, once per kind:
  service      Cloud Run service       -> track_instance_lifetime(...) in the code
  worker-pool  Cloud Run worker pool   -> track_instance_lifetime(...) in the code
  job          Cloud Run job / Prefect -> @track_compute(...) in the code

It also expects a tracker.yaml with cost_tracking and infra_tracking enabled.
The rule lives in simpl_knowledge: state-and-persistence -> Observability.

It only warns and always exits 0: an untracked cost never blocks a deploy. The
running service reports the same gap on the cost-tracking Discord channel at
startup, which is where it gets fixed.
Standard library only: it runs in a bare python image before dependencies install.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

SKIP_DIRS = {".git", ".venv", "venv", "node_modules", "__pycache__", "tests", "test", ".tox"}
TRACKER_NAMES = ("tracker.yaml", "tracker.yml", "simpl_tracker.yaml", "simpl_tracker.yml")
FALSE_WORDS = {"false", "no", "off", "0", "none", "null"}

LIFETIME_CALL = re.compile(r"\b(track_instance_lifetime|InstanceLifetimeSession)\s*\(")
# A job may record per run or, like any workload, for its whole life.
JOB_CALL = re.compile(
    r"(@track_compute\s*\(|\.track_compute\s*\(|\b(track_instance_lifetime|InstanceLifetimeSession)\s*\()"
)
REQUIRED_CALL = {"service": LIFETIME_CALL, "worker-pool": LIFETIME_CALL, "job": JOB_CALL}
REQUIRED_WHAT = {
    "service": "track_instance_lifetime(process_name=...) at startup, close() on shutdown",
    "worker-pool": "track_instance_lifetime(process_name=...) at process start",
    "job": "@track_compute(process=...) on the job's entry point",
}


def _walk(root: Path, pattern: str):
    for path in root.rglob(pattern):
        if not SKIP_DIRS.intersection(path.relative_to(root).parts):
            yield path


def section_enabled(text: str, section: str) -> bool | None:
    """``section.enabled`` from a YAML file, read without a YAML parser.

    None when the section is absent. A present section without ``enabled`` is
    enabled (simpl_tracker's default). ``${VAR:-false}`` reads its default.
    """
    lines = text.splitlines()
    for i, line in enumerate(lines):
        if re.match(rf"^{re.escape(section)}\s*:\s*(#.*)?$", line):
            for inner in lines[i + 1 :]:
                if inner.strip() and not inner.startswith((" ", "\t")) and not inner.lstrip().startswith("#"):
                    break  # next top-level key
                m = re.match(r"^\s+enabled\s*:\s*(.+?)\s*(#.*)?$", inner)
                if m:
                    value = m.group(1).strip().strip("'\"")
                    env = re.fullmatch(r"\$\{[^:}]+:-([^}]*)\}", value)
                    if env:
                        value = env.group(1)
                    return value.lower() not in FALSE_WORDS
            return True
    return None


def check(root: Path, kinds: list[str]) -> list[str]:
    problems: list[str] = []

    trackers = [p for name in TRACKER_NAMES for p in _walk(root, name)]
    if not trackers:
        problems.append("no tracker.yaml: add one with cost_tracking and infra_tracking enabled")
    else:
        ok = False
        for path in trackers:
            text = path.read_text(encoding="utf-8", errors="replace")
            cost = section_enabled(text, "cost_tracking")
            infra = section_enabled(text, "infra_tracking")
            if cost and infra is not False:
                ok = True
        if not ok:
            names = ", ".join(str(p.relative_to(root)) for p in trackers)
            problems.append(
                f"{names}: cost_tracking must be enabled and infra_tracking must not be disabled"
            )

    sources = [p.read_text(encoding="utf-8", errors="replace") for p in _walk(root, "*.py")]
    for kind in kinds:
        if not any(REQUIRED_CALL[kind].search(src) for src in sources):
            problems.append(f"deploys a Cloud Run {kind} but never calls {REQUIRED_WHAT[kind]}")
    return problems


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--kind", action="append", required=True, choices=sorted(REQUIRED_CALL),
        help="what this repo deploys; repeat for each kind",
    )
    parser.add_argument("--root", default=".", help="repository root (default: .)")
    args = parser.parse_args(argv)

    try:
        problems = check(Path(args.root).resolve(), args.kind)
    except Exception as exc:  # a broken check must not block a deploy either
        print(f"WARNING compute cost tracking check could not run: {exc}", file=sys.stderr)
        return 0
    if problems:
        print("WARNING compute cost tracking is incomplete (deploy continues):", file=sys.stderr)
        for problem in problems:
            print(f"  - {problem}", file=sys.stderr)
        print(
            "Rule: simpl_knowledge state-and-persistence -> Observability. "
            "Google bills every Cloud Run instance; untracked compute is invisible in "
            "cost_tracking. The service will also report it on the cost-tracking channel.",
            file=sys.stderr,
        )
        return 0
    print(f"Compute cost tracking check passed ({', '.join(args.kind)})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
