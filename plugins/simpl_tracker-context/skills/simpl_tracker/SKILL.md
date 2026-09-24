---
name: simpl_tracker
description: |
  Use this skill whenever the user asks about cost tracking, logging with notifications, Langfuse tracing, Cloud Run compute/session tracking, or code that imports `simpl_tracker`. ALWAYS consult before adding ad hoc cost, logging, or notification wrappers in simpl repos, and before creating or deploying any Cloud Run service, worker pool or job.
required_when: Any code deployed to Google Cloud (Cloud Run service, worker pool, job, Prefect flow on Cloud Run) must record its compute through simpl_tracker (track_instance_lifetime for services and worker pools, @track_compute for jobs) and its LLM spend through request receipts, before merging.
---

# simpl_tracker integration guide

> **Maintained by**: the `simpl_tracker` repo, auto-synced to simpl_knowledge.
> **Source of truth**: `simpl-techs/simpl_tracker/.agent/SKILL.md`

## What this library is

`simpl_tracker` provides shared cost tracking decorators, structured logging, Discord notifications, infrastructure compute tracking, runtime detection, and Langfuse helpers for simpl Python services.

## Installation

```bash
poetry add "simpl-tracker @ git+https://github.com/simpl-techs/simpl_tracker.git@main"
```

For local development against a sibling checkout:

```bash
poetry add --editable ../simpl_tracker
```

Restore the Git dependency before committing unless the PR intentionally changes dependency wiring.

## Basic usage

```python
from simpl_tracker import configure_from_yaml, LOG, track_cost

configure_from_yaml(supabase_client=existing_client)
LOG.info("Service started", repo="simpl-api", notify=True)

@track_cost(service="ai_llm", process="planner_agent")
def call_ai(prompt: str, user_id: str | None = None):
    return ai_client.run(prompt)
```

## Rules and conventions

- Prefer `configure_from_yaml()` once at process startup. Do not configure tracking inside hot paths.
- Use `LOG` or `get_logger(__name__)` instead of raw `print` or per-module logging setup.
- Logging wrappers: a module that forwards to `LOG` calls `simpl_tracker.ignore_callsite_modules("<its module prefix>")` once, before or after configuration, so `filename` / `func_name` / `lineno` name its caller. An app that builds its own structlog chain must add the same prefix to its `CallsiteParameterAdder(additional_ignores=...)`.
- Use `track_cost`, `track_batch_cost`, and `track_compute` instead of custom cost table writes.
- **Every Cloud Run workload MUST record its compute.** Services and worker pools call `track_instance_lifetime(process_name=...)` once at startup and `close()` it on shutdown; jobs and Prefect flows use `@track_compute(process=...)` on the entry point. `infra_tracking.enabled` must be true in `tracker.yaml`. Per-request or per-task sessions on a service or worker pool undercount: Google bills the instance's whole lifetime, idle included.
- On Cloud Run, `configure_from_yaml()` runs `require_compute_tracking()`: a report on the cost-tracking channel when infra tracking is off or no session opens within 10 minutes. It never stops the process, and the deploy-time check in simpl_knowledge only warns.
- Compute sessions that never close are closed as `timeout` by the DB sweeper and still count in reports. Do not write `infra_compute_session` rows yourself.
- Notification failures must remain fail-safe; they should log but not block the workload.
- Discord webhooks are raw URLs from env (`DISCORD_ERROR_WEBHOOK_URL`, `DISCORD_WARNING_WEBHOOK_URL`, `DISCORD_SUCCESS_WEBHOOK_URL`), interpolated in `tracker.yaml`. Do not load Prefect `DiscordWebhook` blocks. Cost-tracking gaps go to their own channel through `DISCORD_COST_TRACKING_WEBHOOK_URL`, read directly from the environment (not from `tracker.yaml`).
- Notify API version 3 (`simpl_tracker.logging.NOTIFY_API_VERSION`). Every level method takes `notify: bool | "info" | "warning" | "error"` (default `NOTIFY_DEFAULT`), `error: BaseException | str | None`, `notify_fingerprint` and `notify_entities`. `True` maps the level to its channel; a string picks the channel; `False` always silences. An exception `error=` reaches every channel with its traceback. Every level method and `notify_*` helper returns a `bool`: `True` when the alert was accepted (queued, or delivered with `async_delivery` off) or skipped only because report-once found its exception already announced on that channel or a higher one; `False` when no channel applies, the silent marker applies, there is no notifier, notifications are suppressed, the service is disabled or closed, or `send` refused or raised. Accepted is not delivered.
- Exceptions notify by default: with `notifications.default_notify: exceptions` (the default), a `warning` / `error` / `exception` call carrying an exception object (`error=exc`, or the active one in `exception()`) posts to #warning with no `notify=`. `notifications.default_notify: off` or env `SIMPL_TRACKER_DEFAULT_NOTIFY=off` (env wins) turns it off. **Upgrade impact:** bumping to 0.5.0 makes every existing `LOG.exception` / `error=exc` call post to #warning, so add `notify=False` where a failure is expected, mark the exception class `__simpl_notify__ = False`, or set `default_notify: off`.
- The notification context merges bound `structlog.contextvars`, `bind()` values and the call's kwargs, with `extra={...}` flattened.
- Report once: the logger skips a notify for an exception object already announced on any channel, or raised `from` one that was (the explicit `__cause__` chain, up to 10 links). `__context__` is never followed, so an exception raised while an announced one is being handled still posts. An exception group counts as announced when the group was, or when every exception in it was (each by the same rules, nested groups included). Only an explicit higher string channel (`notify="error"` after a warning) posts it again; `notify=True` and the `notify_*` helpers never do. Only the exception passed is marked, and an accepted alert that is never delivered releases its mark again (a mark a higher channel set meanwhile stays). Boundary alerts need no check: `LOG.notify_error(msg, error=exc)` posts nothing for an exception the framework already announced, or for `AppError(...)` raised `from` it. `simpl_tracker.notifications.was_notified(exc)` reports the mark along the same chain.
- Silencing expected exceptions: an exception whose class or instance sets `__simpl_notify__ = False` is logged, but the default policy, `notify=True` and the `notify_*` helpers never notify it. The same holds when a marked exception is the `__cause__` of the logged one, never its `__context__`. An explicit string channel (`notify="warning"` / `"error"`) still posts. A non-empty exception group whose exceptions are all silent (nested groups included) is silent too. The tracker only reads the attribute, so a library sets it on its own base class without importing simpl_tracker.
- Delivery is asynchronous: `send()` queues and a daemon thread posts. Exit flushes for up to 5 s; call `simpl_tracker.flush_notifications()` before `os._exit`. In tests, use `NotificationConfig(async_delivery=False)` or `service.flush()`. An accepted alert that still fails (the backend reports failure after its own retries, delivery raises, it is dropped from a full queue, a deferred alert's claim never resolves or the deferred list overflows, or its message keeps disappearing) is not retried: its report-once mark is released, it is logged at ERROR on the stdlib `simpl_tracker` logger (level, message, error type, fingerprint, reason; never the webhook URL), it is counted in `notifier_status().failed_deliveries`, and every undelivered listener is called. `flush()` means processed, not delivered, and never waits for deferred alerts.
- Undelivered listeners: `simpl_tracker.add_undelivered_listener(callback)` / `remove_undelivered_listener(callback)`, also exported from `simpl_tracker.notifications`. Registration is process-wide, idempotent and independent of the notifier. `callback(context)` runs once per lost alert, with a read-only mapping of that alert's notification context (top-level kwargs such as `root_node_run_id` included), on the thread that settles it and with notifications suppressed. Each item folded into a failed batch edit fires on its own; delivered, accepted-pending and still-deferred alerts never fire. A raising listener is logged at WARNING and the others still run. Use it to drop state that assumed the alert arrived.
- A wrapper that replaces `NotificationService.send` must accept and forward `fingerprint=` and `entities=` keywords. Otherwise the tracker drops them for that wrapper and alerts fall back to the default fingerprint.
- Dedup edits the first message while a fingerprint keeps recurring within the window, posts a fresh message at 100 and 1000 occurrences, and escalates a warning still recurring after an hour to the error channel once. It is in-process by default.
- Supplying a DedupStore (shared dedup for short-lived processes): pass `configure_from_yaml(dedup_store=store)` / `configure_from_block(name, dedup_store=store)`, or call `simpl_tracker.install_dedup_store(store)` after configuration. It swaps the store on the notifier already installed, returns False when there is none, and is safe while alerts are queued. A store implements `hit` / `record_post` / `forget(fingerprint, *, message_id=None)`, plus optional `release` and `recheck`, and reuses `simpl_tracker.notifications.dedup_action`. A store shared across processes claims delivery atomically when it decides `post` / `repost` / `escalate`; while the claim is live it answers other processes `"pending"` (no message exists yet; `DedupHit.claim_expires_at` set) or `"edit"` (one does), `record_post` completes the claim, and `release(fingerprint)` or expiry frees it. The service calls `release` after a post the store authorised was not sent or raised. With async delivery and a store that defines `recheck(fingerprint, *, level, service_name, entities, now)`, a `"pending"` alert is deferred unsettled (its mark stays live) and its fingerprint rechecked at `min(claim_expires_at, now + 15 s)`, never sooner than 1 s. `recheck` never counts the occurrence again and answers `"edit"` (a message exists: every deferred alert is delivered, plus one best-effort count edit), `"pending"` (a live claim elsewhere, with `claim_expires_at`), or `"post"` (claimed for this process, a missing or expired row restarting at count 1: one post settles them all); never `"repost"` / `"escalate"`. Deferred for more than 600 s, or evicted past 1024 waiting alerts (oldest first), they end undelivered; close and exit settle what is left as delivered with one WARNING. Synchronously, or without `recheck`, `"pending"` is accepted as before. After a Discord 404 the service calls `forget(fingerprint, message_id=<the message it edited>)`, so a newer message or a claim is kept (a `forget` without the keyword is called without it), rereads with `recheck` (or `hit`) and follows the answer, for at most 2 rounds per alert. `release` and `recheck` are read with `getattr`, so stores without them still install. A wrapper around the notifier must delegate attribute access to the `NotificationService` or define `set_dedup_store(store)` that forwards to it. Read the installed notifier with `simpl_tracker.current_notifier()` (returned as installed, possibly a wrapper, or `None`; read-only), never `simpl_tracker.logging._GLOBAL_NOTIFIER`. Its read-only `config` gives `dedup_enabled`, `dedup_window_seconds`, `repost_thresholds`, `escalate_after_seconds` and `service_name` for sizing a shared store.
- Assert wiring at boot with `simpl_tracker.notifier_status().configured`; its `failed_deliveries` counts accepted alerts that were never delivered, and `deferred` the alerts waiting right now on another process's delivery claim. Set `notifications.strict: true` (or `SIMPL_TRACKER_STRICT_NOTIFICATIONS=1`) to raise `NotificationConfigError` on dead webhook config.

- For request accounting, use `simpl_tracker.llm_model.CostRecordingModel` and
  `simpl_tracker.llm_accounting.LLMAccountingScope`. Since 0.6.0
  `request_accounting` is on by default; only `SIMPL_REQUEST_ACCOUNTING=false`
  switches it off. See the README contract.
- Since 0.6.0 every POST to a billable provider endpoint is also seen at the httpx
  boundary (`simpl_tracker.transport`, installed on import). A request no
  `CostRecordingModel` wrapped is still recorded (`capture='transport'`, process
  named by the scope or `unwrapped:<caller>`), and logs
  `llm_accounting.unwrapped_call` once per call site: wrap it for attribution. A
  request whose caller timed out or was cancelled keeps running in the background
  and is recorded with its real usage as outcome `abandoned`; the caller still gets
  its own timeout. Self-hosted endpoints go in `cost_tracking.llm_hosts`
  (`{host: provider}`). `SIMPL_TRANSPORT_ACCOUNTING=false` switches it off.
- `CostEntry.cost_usd` and `TrackingResult.cost_usd` may be `None` for unknown LLM
  prices. Never replace unknown amounts with a fabricated zero.
- Drain `simpl_tracker.llm_accounting.drain_llm_receipts()` during graceful shutdown.
- Request receipts bypass legacy required-ID skipping; missing attribution is
  retained. Their delivery is idempotent and suppresses enclosing run totals.

## Common pitfalls

- Do not use the older `Tracker.from_env()` event-tracker API wording; this repo exposes cost/logging/tracing helpers.
- A missing webhook URL mutes that notification level and must never raise. If notifications are enabled and no URL resolved at all, startup logs an error (strict mode raises).
- `*_webhook_block_name` keys are dead since 0.4.0; they log an error naming the `*_webhook_url` replacement.
- A test that asserts on a backend right after a notify must set `async_delivery=False` or call `flush()` first.
- Do not require `user_id` or `ulc_id` unless the repo config explicitly does so.

## Testing

```bash
conda activate simpl_tracker
poetry install
poetry run pytest
poetry run ruff check .
```

Tests marked `real_api` require real provider keys and should not be run by default.

## Recording LLM spend: the same four things in every repo

Do not invent a per-repo arrangement. Every service records LLM spend the same
way, and everything it needs is exported from `simpl_tracker` directly:

1. **`tracker.yaml`** with `cost_tracking` enabled. `request_accounting` defaults to
   true since 0.6.0, and `configure_from_yaml` runs the startup guard itself.
2. **Wrap the model where it is built**, at the one place the service constructs
   a pydantic-ai model:

   ```python
   from simpl_tracker import CostRecordingModel

   model = CostRecordingModel(
       OpenAIChatModel(name, provider=provider),
       provider=billing_provider,   # the account billed, from the host that answers
       api_key=api_key, base_url=base_url,
   )
   ```

3. **Attribution.** `@track_cost(service="ai_llm", process=...)` already opens an
   `LLMAccountingScope`, so a decorated call site needs nothing further — and the
   receipt suppresses the decorator's run-level row, so the charge is never
   counted twice. A service without those decorators opens the scope itself,
   around the agent run.
4. **Drain.** `drain_llm_receipts()` at shutdown; it also waits for abandoned
   requests still finishing. `require_request_accounting("<service>")` still
   works, but `configure_from_yaml` already calls it for the configured repo.

A call site that forgets step 2 is no longer lost: the transport records it and
names it `unwrapped:<caller>`. Step 2 is what gives it a process name and a
pre-dispatch intent tied to the model call.

**Code that writes a run total after `agent.run`** (a direct `track_llm_call` from
a result, outside `@track_cost`) must total only
`simpl_tracker.unrecorded_responses(result)`: since 0.6.0 every request to a known
provider already has its own receipt, and totalling the whole run counts it twice.
To attribute those receipts, run the agent inside an `LLMAccountingScope`.

`billing_provider` is decided by the host that answers, never by the label in a
config: a provider entry called "openai" pointed at a gateway bills the gateway.

**Untracked cost is reported, never refused.** No request is refused, no service
refuses to start and no run fails because a cost is not recorded. Every gap goes to
the cost-tracking Discord channel through `simpl_tracker.report_tracking_gap(event,
message, fingerprint=...)`, which reads `DISCORD_COST_TRACKING_WEBHOOK_URL` on each
call (falling back to #error when it is unset), works without a `notifications`
section in `tracker.yaml`, deduplicates by fingerprint and never raises.
Reported there: a missing or disabled tracker and receipts switched off
(`require_request_accounting` / `reassert_request_accounting` now return False and
report), missing Supabase credentials, paid requests in a process with no tracker,
receipts lost or still undelivered at shutdown, a backed-up receipt queue, compute
sessions that fail or never open on Cloud Run, and cost entries skipped or not
inserted. The scheduled cost jobs (`reconciliation_alert.py`,
`cheaper_inference_costs.py --apply`) post their problems there too and always exit 0.
Silence means recorded. Use `report_tracking_gap` for any new "cost not recorded"
path; never raise, exit non-zero or fail a job for it.

**A request is never held up by its receipt.** The intent before dispatch gets one
attempt of at most 2 s (`PRE_DISPATCH_DEADLINE_S`); if it fails the request is made
and `llm_accounting.dispatched_unrecorded` reported. The charge is usually not lost:
the completion receipt alone records it. After the response, synchronous clients
write the receipt on a background thread; `flush_sync_receipts()` waits for them and
`drain_llm_receipts()` includes them. `cost_tracking.block_when_unrecordable` is
still accepted in `tracker.yaml` and has no effect.

## Reconciling the ledger against provider billing

`simpl_tracker.reconciliation` classifies ledger rows against a provider's own export:
`aligned`, `missing_in_ledger`, `missing_at_provider`, `amount_differs`, and the
unrecorded amount per group. It is pure and has no dependencies beyond the standard
library; the exports, database and arguments live in `scripts/reconcile_providers.py`:

```bash
doppler run -- python scripts/reconcile_providers.py \
    --openrouter ~/Downloads/openrouter.csv --deepseek ~/Downloads/deepseek.zip \
    --from 2026-08-20 --to 2026-09-18 --out report.json
```

The script is read-only and needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
OpenRouter matches per request, on the `generation_id` the tracker stores in
`external_request_id`. DeepSeek publishes daily totals and bills on Europe/Rome days,
so the ledger is bucketed into Rome days and compared on tokens as well as cost —
tokens are what separate a wrong rate from a request that never reached the ledger.

A number that agrees on cost but not on tokens is not reconciled. Report the
difference; do not append an export to the ledger to close it.

### Cheaper Inference: priced from its catalog, settled from its export

Cheaper Inference sends no amount on its answers and sets its price per request, so its
calls are costed twice by `scripts/cheaper_inference_costs.py` (dry run by default,
`--apply` writes; always exits 0: with `--apply`, an unreadable export row, a bill that
fails to settle, missing credentials or a crashed run go to the cost-tracking channel
through `report_tracking_gap`, and a dry run only prints them):

```bash
doppler run --config dev -- python scripts/cheaper_inference_costs.py pricing --apply
doppler run --config dev -- python scripts/cheaper_inference_costs.py settle --apply
doppler run --config dev -- python scripts/cheaper_inference_costs.py settle --since 2026-09-01 --apply
```

`pricing` syncs the gateway's ZDR catalog into `provider_pricing`: calls are estimated
at those rates when recorded. The first sync opens every price from 2026-09-01, so
calls recorded before it are estimated too; a moved price opens from the day of the
sync and keeps the model's other pricing tiers.

`settle` brings the ledger to what the usage export says each request was billed, as
OpenRouter's answers carry their amount: a receipt takes the billed amount, matched on
the `x-ci-request-id` it carries as `external_request_id`, and a billed request no
receipt names gets an export row at that amount (`metadata.backfill`), which the
receipt replaces if it lands later. The window runs from the start of `--since` (two
days ago by default; an early date backfills) to 30 minutes ago. Each applied run then
reconciles the window per request, like OpenRouter's, without the export rows, and
stores it in `provider_reconciliation`, which `reconciliation_alert.py` watches.
`.github/workflows/cheaper-inference-costs.yml` runs `settle --apply` hourly and
`pricing --apply` daily; nothing else needs to schedule them.

Every recorder names a Cheaper Inference request by `x-ci-request-id`: the transport
for unwrapped and abandoned requests, and `CostRecordingModel` through the transport,
whatever the client reports as the response id. The logic is in
`simpl_tracker.cheaper_inference` (`plan_pricing`, `apply_pricing`, `read_bills`,
`apply_settlement`, `reconcile`) for a scheduled job to call. Both commands need
`CHEAPER_INFERENCE_API_KEY` (`usage:read` scope for `settle`), `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`; `settle` needs migration
`20260923190000_cheaper_inference_settlement`.

## What this library does NOT do

- Does not own business workflow logic. Use `simpl_core` or the app repo.
- Does not define database ORM primitives. Use `simpl_orm`.
- Does not replace Langfuse itself; it provides simpl wrappers and propagation helpers.

## Where to go next

- Source: `https://github.com/simpl-techs/simpl_tracker`
- Consumer config example: `config/tracker.yaml` in app repos
- Internal conventions: `.agent/INTERNAL.md`
