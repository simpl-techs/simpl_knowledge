---
name: simpl_agent_sandbox
description: |
  Use this skill whenever the user asks about running agent-written code inside an
  isolated sandbox with no network (Vercel Sandbox), about sandbox providers, or
  about code that imports `simpl_agent_sandbox`. ALWAYS
  consult it before adding sandbox or VM execution code to another repo. It is
  NOT about `simpl_sandbox`, the local stack that runs simpl repos against a
  local database.
---

# simpl_agent_sandbox integration guide

> **Maintained by**: the simpl_agent_sandbox repo, auto-synced to simpl_knowledge.
> **Source of truth**: `simpl-techs/simpl_agent_sandbox/.agent/SKILL.md`

**Status: experimental.** It runs on a personal Vercel Hobby account with test data
only. Not for production data until SimpL's own Vercel Pro team and a DPA covering
Sandbox exist. Plan: `simpL/plans/agent-sandbox-plan.md`.

## What this library is

Short-lived VMs for one task each, behind a `SandboxProvider` protocol. The first
version ships the code box: model-written code runs with no network at all. The
provider and the images also hold a browser box limited to one site, but no runner
uses it yet: the browse runner is parked on the `feature/eng-865-browse-runner` branch.
Providers: `vercel` (Vercel Sandbox over httpx, no SDK) and `fake` (in memory, for
tests). The package takes bytes in and gives bytes out; storage stays with the caller.
It moved here from `simpl_core.sandbox` (`simpl-techs/simpl_core#335`).

## Installation

```toml
# pyproject.toml of the consuming repo; internal git deps follow main
"simpl-agent-sandbox @ git+https://github.com/simpl-techs/simpl_agent_sandbox.git@main"
```

Its only runtime dependency is httpx. The code task runner needs the `tasks` extra
(simpl_ia with its agents, simpl_tracker): `simpl-agent-sandbox[tasks] @ ...`.

## Basic usage (the 90% case)

```python
from simpl_agent_sandbox import NetworkPolicy, SandboxConfig, SandboxFile, SandboxSpec
from simpl_agent_sandbox.vercel import VercelSandboxProvider

config = SandboxConfig.from_env()  # SANDBOX_VERCEL_TOKEN, _TEAM_ID, _PROJECT_ID required
async with VercelSandboxProvider(config.vercel) as provider:
    spec = SandboxSpec(
        image=config.workbench_image,
        network=NetworkPolicy.deny_all(),  # only_sites([...]) needs allow_sites, below
        region=config.region,
        timeout_s=600,  # Vercel stops the sandbox then, even if this process dies
        tags={"task": "press-kit"},
    )
    session = await provider.create(spec)
    try:
        await provider.write_files(session, [SandboxFile("/workspace/in/a.csv", data)])
        result = await provider.run(session, ["python3", "job.py"], timeout_s=120, cwd="/workspace")
        outputs = await provider.read_files(session, ["/workspace/out/report.pdf"])
    finally:
        usage = await provider.destroy(session)  # record it with simpl_tracker
```

## Rules and conventions

- There is no default network policy, region or timeout. A provider declares what it
  enforces in `capabilities()` and raises `SandboxUnsupportedError` for anything else,
  before creating a sandbox; it never falls back to a weaker policy.
- The Vercel provider offers a `sites` policy only when `VercelSandboxConfig.allow_sites`
  is true (`SANDBOX_VERCEL_ALLOW_SITES=true`). It is off by default, so a caller cannot
  open the network by code alone: the host has to turn it on as well.
- `NetworkPolicy.only_sites` takes bare domains (subdomains included) and refuses IPs,
  wildcards and shared front ends such as `googleapis.com` or `cloudfront.net`, which
  would let the sandbox reach other tenants by domain fronting.
- `run` takes an argv (no shell unless you run one), streams output to `on_output`, and
  returns a `CommandResult` with each stream cut to `output_limit_chars` (head and tail).
  A non-zero exit is a result; `timed_out` marks a command killed at `timeout_s`.
  `on_output` gets every byte uncut: never forward it to a model or store it as is.
- `read_files` maps a missing file to None. Errors are the `simpl_agent_sandbox.errors`
  classes only; no Vercel type, id or error leaves the adapter (`SandboxSession.provider_ref`
  is opaque: never log or store it).
- `destroy` returns a `SandboxUsage` (run time, active CPU when known, vCPUs, memory,
  region, our sandbox name), or None when the sandbox was already gone. Its fields match
  `simpl_tracker.sandbox.SandboxUsage`: the caller records it; this package never does.
- `sweep(tag_key=..., tag_value=..., older_than=...)` destroys only non-persistent
  sandboxes carrying that tag.
- Hosts build each provider from config and register it once at startup in
  `SandboxProviderRegistry`; a policy names the provider to use.
- The browser image carries the T0 path-A pieces in `/opt/sbx`: start `browserd.py <site>`
  detached (Chromium plus an in-browser site filter), then run `act.py '<json action>'`
  once per action (navigate, snapshot, click, click_ref, type). The filter lets through
  only GET, HEAD and OPTIONS to the task's sites, in every tab, popup, frame and worker.
  It does not see WebSockets: in this image a page script can still open one to the
  allowed site. No runner uses this image in the first version.
- Images: `images/{workbench,browser}/`, tags pinned in `config.py` as the content hash
  of each folder. Build and push with
  `python -m simpl_agent_sandbox.images.build <image> --project <vercel project>`, then
  run the probe `tests/test_conformance_probe.py` (`SANDBOX_LIVE=1`) before pinning or
  using a new tag.

## Code task runner (`simpl_agent_sandbox.tasks`)

`run_code_task` (D4) starts one workbench with no network, runs a DeepSeek sub-agent
inside it with its own low-level tools, and destroys the sandbox. This package imports
simpl_ia's agents and pydantic-ai: install the library with the `tasks` extra
(`simpl-agent-sandbox[tasks] @ git+https://github.com/simpl-techs/simpl_agent_sandbox.git@main`).

```python
from simpl_agent_sandbox.tasks import (
    CsvCheck,
    PdfCheck,
    StructuredClientModel,
    TaskBudget,
    TaskInput,
    deepseek_client,
    run_code_task,
)

# The host passes the key; one model per task groups its receipts under one agent_run_id.
model = StructuredClientModel(deepseek_client(deepseek_key), process_name="ops.marketing.code_task")
result = await run_code_task(
    "Turn the press kit into a one-page A4 brief ...",
    [TaskInput("simpl-press-kit.zip", zip_bytes)],  # staged into /workspace/in
    [
        PdfCheck("/workspace/out/press-brief.pdf", pages=1, page_size_pt=(595, 842)),
        CsvCheck("/workspace/out/inventory.csv", rows=7, columns=("path", "bytes")),
    ],
    TaskBudget(max_steps=30, wall_clock_s=600),
    provider,
    model=model,
    tags={"task": "press-brief"},
    on_usage=record_usage,  # (sandbox_id, SandboxUsage | None, destroy error | None), T7
)
result.outcome, result.files, result.steps, result.usage
```

- **No network, always**: the runner creates the workbench with `NetworkPolicy.deny_all()`;
  no argument changes it, the provider deletes a sandbox Vercel did not create that
  way, and the Vercel provider refuses any `sites` policy unless `allow_sites` is on.
- **One action per model turn**, through native tool calling: each tool is a
  pydantic-ai output tool, so the model answers with exactly one tool call, our code
  performs it and the next turn starts from a fresh prompt. Tools: `write_file`, `run`
  (one bash command line), `read_file`, `done`.
- **Model calls** go through simpl_ia's `StructuredLLMClient`, built from a typed
  `ModelPolicy` plus a credential binding (`deepseek_client`, default `deepseek-flash`),
  and run inside an `LLMAccountingScope(process_name=..., agent_run_id=...)`, so every
  request leaves a simpl_tracker receipt. Pass your own `SubAgentModel` to swap models.
- **Caps** (`TaskBudget`): steps (default 30, at most 60), wall clock (default 600 s;
  the sandbox lives exactly this long, D5), a timeout on every model call and command,
  and output files per file, in total and by count. A file over a cap stays in the
  sandbox and is listed in `skipped_files`; checked files are read first, and `done`
  is refused while a checked file is over a cap (the refusal names the cap). Every
  call after the loop is cut to the sandbox's remaining life; a read that fails then
  becomes a skipped file. When it is a checked file, the outcome is `OUTPUT_MISSING`
  instead of `DONE`, and `detail` names the checked files that did not come back.
- **Loop guard**: the same action with the same effect twice in the last 6 steps puts a
  warning in the next prompt; a third time ends the task with `LOOP_STOPPED`.
- **Done gate**: `done` is accepted only when the caller's checks pass, otherwise
  refused with the failing checks named. A task that runs out of steps or time still
  ends `DONE` when the final checks pass and every checked file comes back. Checks
  run inside the workbench from a script passed on the command line, each on a file
  directly in `/workspace/out/` (the only files that come back): `FileExists`,
  `FileSize`, `PdfCheck` (pages, page size), `ImageCheck` (pixels), `VideoCheck`
  (duration, frame size), `CsvCheck` (rows, columns), `JsonKeysCheck` (exact or
  contained keys).
- **Untrusted content**: everything the sandbox printed is fenced in the prompt with a
  fresh mark per prompt. `CodeTaskResult.summary` is `UntrustedText`; output files are
  untrusted bytes to store, never to run or render on a server.
- **Results**: `outcome` (`TaskOutcome`: done, output_missing, step_cap, time_cap,
  loop_stopped, model_failed, sandbox_failed) with `detail`, the files, the check
  verdicts, the step log (`StepRecord`: action, short detail and result, model and
  sandbox time), `model_usage` (requests and tokens) and `usage` (`SandboxUsage` from
  `destroy()`). The step log is returned, never stored here (D7).
- **Errors**: a failed `create` raises `SandboxError` (nothing ran). After that, sandbox
  and model failures are outcomes; an unexpected error raises `TaskRunError` with the
  step log and token count so far; a cancellation is re-raised. In every case the
  sandbox is destroyed in a shielded task that then calls `on_usage` (a `UsageSink`),
  so the cost reaches the caller even after a cancellation. `cleanup_error` says when
  the destroy failed (logged with the sandbox id); the provider timeout still ends it.
  A sink that raises is logged and never replaces the result. Before the host shuts
  down, it awaits `drain_destroys()`, so destroys whose callers were cancelled finish;
  a destroy cancelled anyway reports `(sandbox_id, None, "CancelledError")`.
- **Observing**: pass a `TaskObserver` subclass to `run_code_task` to see each step and
  each command's output as it arrives; what it receives is raw and must never reach a
  model or `tool_call_runs`.

## Testing

Use the fake provider; it refuses exactly what Vercel refuses.

```python
from simpl_agent_sandbox import NetworkPolicy, SandboxSpec
from simpl_agent_sandbox.fake import FakeOutcome, FakeSandboxProvider


async def handler(sandbox, argv):
    return FakeOutcome(stdout="done\n")


provider = FakeSandboxProvider(handler=handler)
session = await provider.create(
    SandboxSpec(image="any", network=NetworkPolicy.deny_all(), region="fra1", timeout_s=60)
)
result = await provider.run(session, ["python3", "job.py"], timeout_s=10)
```

## What this library does NOT do

- It is not `simpl_sandbox`, the local cross-repo dev stack with a local Supabase.
- It holds no storage: bytes go in and bytes come out; the caller stores files.
- It records no costs: `destroy` returns usage for the caller to record with simpl_tracker.
- It registers no agent tools: `code_task` lives in simpl_core's agent framework, which
  depends on this library.

## Where to go next

- Source: `https://github.com/simpl-techs/simpl_agent_sandbox`
- Owner: Jackie Wang
