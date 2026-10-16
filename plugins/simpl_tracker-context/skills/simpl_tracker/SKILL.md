---
name: simpl_tracker
description: |
  Every cost at simpl goes through simpl_tracker, always: LLM calls, paid APIs, Cloud Run compute. ALWAYS load it before code that calls a model or a paid API, or deploys to Cloud Run. Load it when the user asks to track cost or spend, add an LLM call or a new provider (OpenAI, OpenRouter, DeepSeek, Cheaper Inference, enrichment or scraping APIs), create or deploy a Cloud Run service, worker pool or job, log with Discord alerts, add Langfuse tracing, or reconcile costs against a provider bill, and whenever code imports `simpl_tracker`. Never add ad hoc cost tables, cost wrappers or notification helpers.
summary: |
  Mandatory cost ledger for every simpl service. Records LLM spend per request, paid data-provider calls and Cloud Run compute in Supabase, reports any untracked cost on its own Discord channel, and ships structured logging, Discord notifications and Langfuse helpers.
when_to_use: |
  Any code that spends money: a model call (pydantic-ai, OpenAI, OpenRouter, DeepSeek, Cheaper Inference or any other provider), an LLM batch job, a paid enrichment or scraping API, or compute on Google Cloud (Cloud Run service, worker pool, job, Prefect flow). Also when adding logging with Discord alerts or Langfuse tracing, or when checking recorded costs against a provider's billing export.
required_when: |
  Always. Every cost a simpl service incurs is recorded through simpl_tracker before merging: LLM spend through CostRecordingModel request receipts (attributed by @track_cost or an LLMAccountingScope; batch results through @track_batch_cost), paid data providers through @track_cost, and Google Cloud compute through track_instance_lifetime (services, worker pools) or @track_compute (jobs, Prefect flows). No custom cost tables and no untracked paid calls.
---

# simpl_tracker integration guide

> **Maintained by**: the `simpl_tracker` repo, auto-synced to simpl_knowledge.
> **Source of truth**: `simpl-techs/simpl_tracker/.agent/SKILL.md`

## What this library is

`simpl_tracker` is where simpl records what it spends. Every cost a service incurs goes through it; there is no per-repo alternative:

| Cost | Record it with |
| --- | --- |
| LLM / model calls | `CostRecordingModel` where the model is built, attributed by `@track_cost(service="ai_llm", ...)` or an `LLMAccountingScope` (see *Recording LLM spend* below) |
| LLM batch APIs | `@track_batch_cost(process=...)` on the code that retrieves the results |
| Paid data providers | `@track_cost(service="data_enrichment", ...)` or `@track_cost(service="web_scraping", ...)` with `provider` and `sku` |
| Cloud Run compute | `track_instance_lifetime(process_name=...)` for services and worker pools, `@track_compute(process=...)` for jobs and Prefect flows |

A cost that fits none of these rows is added to simpl_tracker first, not recorded somewhere else.

It also provides structured logging, Discord notifications, runtime detection, Langfuse helpers and reconciliation against provider billing for simpl Python services.

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
- Reports take Google Cloud from its bill, not from sessions, on every day the billing export is loaded (`scripts/gcp_billing_sync.py`, every six hours). Sessions still matter: they split each billed resource across repos, processes and customers, and a resource with none is reported as unattributed. A session's `service_name` must be the Cloud Run resource name (it is when auto-detected).
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
  boundary (`simpl_tracker.transport`, installed on import). Since 0.8.2 that covers
  httpx2 too: openai >= 3 builds its default clients on httpx2, so before 0.8.2 an
  OpenAI SDK client made without an `http_client` (e.g. simpl_ia's Nebius embedder)
  left no receipt. A request no
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

**A process that loaded no tracker config still records its LLM spend.** Scripts,
notebooks, backfills and flows run on a laptop often skip step 1. Their first paid
request installs a tracker built from `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` (`configure_fallback_tracker`): LLM receipts only, no
compute (a laptop is not billed), repo name from a discoverable `tracker.yaml`,
else the Doppler project without its `simpl_` prefix. It is never built inside a
pytest run or when `SIMPL_REQUEST_ACCOUNTING` is off. Without those credentials the
request is reported as `llm_accounting.untracked_process`, as before.

**A failed call is its receipt.** When a `@track_cost(service="ai_llm")` call
raises after its request left a receipt (outcome `failed`), the decorator writes no
error event: without `provider=` that event used to land as `ai_llm/unknown` on the
cost-tracking channel for every failure.

**Code that writes a run total after `agent.run`** (a direct `track_llm_call` from
a result, outside `@track_cost`) must total only
`simpl_tracker.unrecorded_responses(result)`: since 0.6.0 every request to a known
provider already has its own receipt, and totalling the whole run counts it twice.
To attribute those receipts, run the agent inside an `LLMAccountingScope`.

`billing_provider` is decided by the host that answers, never by the label in a
config: a provider entry called "openai" pointed at a gateway bills the gateway.

**Audio transcription is not covered by the transport.** It records chat,
completions, responses and embeddings only; a transcription sends its model in a
multipart form, so an SDK `audio.transcriptions.create` call is billed with no
receipt. Use `simpl_tracker.clients.openai_audio.transcribe_audio(api_key=..., body=...,
filename=..., mime=..., client=httpx.AsyncClient())` inside an `LLMAccountingScope`:
one attempt (`gpt-4o-mini-transcribe`), intent before dispatch, usage from the
response, the audio/text token split kept in `context.audio_usage`.

**Untracked cost is reported, never refused.** No request is refused, no service
refuses to start and no run fails because a cost is not recorded. Every gap goes to
the cost-tracking Discord channel through `simpl_tracker.report_tracking_gap(event,
message, fingerprint=...)`, which reads `DISCORD_COST_TRACKING_WEBHOOK_URL` on each
call (falling back to #error when it is unset), works without a `notifications`
section in `tracker.yaml`, deduplicates by fingerprint and never raises.
Reported there: a missing or disabled tracker and receipts switched off
(`require_request_accounting` / `reassert_request_accounting` now return False and
report), missing Supabase credentials, paid requests in a process with no tracker
and no Supabase credentials,
receipts lost or still undelivered at shutdown, a backed-up receipt queue, compute
sessions that fail or never open on Cloud Run, and cost entries skipped or not
inserted. The scheduled cost jobs (`reconciliation_alert.py`,
`cheaper_inference_costs.py --apply`, `provider_spend.py --apply`) post their problems
there too and always exit 0.
Silence means recorded. Use `report_tracking_gap` for any new "cost not recorded"
path; never raise, exit non-zero or fail a job for it.

**A request is never held up by its receipt.** The intent before dispatch gets one
attempt of at most 2 s (`PRE_DISPATCH_DEADLINE_S`); if it fails the request is made
and `llm_accounting.dispatched_unrecorded` logged as a warning, not alerted: nothing is
lost yet, because the completion receipt alone records the charge, and a completion
that cannot land either is reported as `llm_accounting.reconciliation_required`. After the response, synchronous clients
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

### OpenRouter and DeepSeek: measured every hour from the account's spend

Neither offers that export over an API, but both report the account's spend:
OpenRouter's `/api/v1/credits` the cumulative usage, DeepSeek's `/user/balance` the
balance left, each for the whole account whatever key asks. `scripts/provider_spend.py`
(hourly in `.github/workflows/provider-spend.yml`; dry run by default, `--apply`
writes, always exits 0 and reports problems through `report_tracking_gap`) stores a
snapshot of each in `provider_spend_snapshot`, then compares the last day of
snapshots with the ledger over the same intervals (`ledger_spend_between`) and stores
the result in `provider_reconciliation`, which `reconciliation_alert.py` watches. An
interval with a DeepSeek top-up is left out of both sides. It says how much the
ledger misses, net; `reconcile_providers.py` with an export says which requests.

```bash
doppler run --config dev -- python scripts/provider_spend.py [--apply]
```

It needs `OPENROUTER_API_KEY`, `DEEPSEEK_API_KEY`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY` and migration `20261013170100_provider_spend_snapshots`;
the logic is in `simpl_tracker.provider_spend`.

### Google Cloud: loaded from the billing export every six hours

`scripts/gcp_billing_sync.py` (every six hours in `.github/workflows/gcp-billing.yml`;
dry run by default, `--apply` writes, always exits 0 and reports problems through
`report_tracking_gap`) reads the last four complete UTC days of the BigQuery billing
export and loads each with `cost_tracking.load_gcp_billing_day`: the day in
`gcp_billing_cost` (EUR net of credits, tax excluded, USD at the ECB rate), split
across the sessions that ran on each resource in `gcp_cost_allocation`, rollup
rebuilt. `compute_cost_daily(from, to)` is the one source of compute cost per day,
provider and repo; `run_daily_aggregation`, `infra_cost_daily` and
`infra_cost_by_provider` read it.

```bash
doppler run --config dev -- python scripts/gcp_billing_sync.py [--since 2026-07-01] [--apply]
```

It needs `GCP_BILLING_SERVICE_ACCOUNT_JSON_INLINE` (else Application Default
Credentials) and, with `--apply`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and
migration `20261016163000_gcp_billing_cost`; the logic is in `simpl_tracker.gcp_billing`
and `simpl_tracker.ecb`.

### OpenRouter streams cancelled before their answer

OpenRouter bills a stream its caller cancels for what was generated until then; a
reasoning model can generate for minutes before the client reads a single chunk, so the
receipt (`interrupted`, `unpriced`) has no body id and no amount. Since 0.8.7 it is named
by the `x-generation-id` header OpenRouter sends with the status line, and
`scripts/openrouter_costs.py settle --apply` (hourly, the first step of
`provider-spend.yml`) asks `GET /api/v1/generation?id=` what each such generation was
billed and settles it through `settle_llm_receipts`. Services pick this up when they
relock simpl-tracker. Logic: `simpl_tracker.openrouter`.

### Answers without a price

An answer whose model has no rate in `provider_pricing` is recorded with its tokens and
no amount (`state = 'unpriced'`), and its cost is in no total. On 2026-10-13 that was
$765 of OpenAI `gpt-6-sol`/`gpt-6-luna` over three weeks, because the models were
priced only under `cheaper_inference`. `cost_tracking.unpriced_llm_answers` lists them
per model, `reconciliation_alert.py` alerts on every row, and pg_cron runs
`reprice_unpriced_llm_receipts` hourly: add the model's rates (every token kind it
bills, cache writes included) and its history is priced within the hour. When a
service moves a model to a new provider, add the rates under that provider in the
same change.

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

## AssemblyAI pre-recorded speech

Use `simpl_tracker.assemblyai.AssemblyAIRequest` and
`record_assemblyai_transcript(backend, request, transcript)` off the workload's
critical path. Pass the provider's complete response for extraction; the stored
receipt excludes audio, text, prompts and credentials. `transcript=None` records a
pending request; the same request can be completed/replayed without double counting.
`assemblyai_account_key(api_key)` supplies the non-secret account fingerprint.
The backend can recover pending requests with
`pending_speech_receipts(repo, process, account)` (up to 100 at a time).
Apply migration `20261001130439_assemblyai_speech_receipts.sql` first.
Audio is priced by actual model and duration × channel count, with prompt,
keyterms and diarization add-ons. Unknown models/features/dates stay NULL and
report a tracking gap. Public rates effective 2026-10-01 are estimates; account
credits and negotiated discounts require invoice reconciliation. No historical
rate is inferred before the effective date.

## Recall.ai meeting bots

`simpl_tracker.recall.record_recall_bot(tracker, bot, repo_name=..., process_name=...,
user_id=..., customer_id=...)` records one ledger row per finished bot. Every quantity
comes from the bot JSON Recall returns (`GET /bot/{id}/`), never from our config.
Components, priced in `provider_pricing` (provider `recall_ai`, service
`meeting_recording`):
- `bot`: from the first `joining_call` to `done` (waiting room included; a `fatal`
  bot is free). Matches Recall's own `GET /billing/usage/` to the second.
- `transcription`: recordings whose transcript shortcut is `done` with a Recall
  provider (`recallai_async`, `recallai_streaming`).
- `storage`: recording seconds x 30-day periods from 7 days after `completed_at` to
  `expires_at`. A recording with no `expires_at` is kept and billed every month
  forever: it is left out, listed in `metadata.unbounded_storage_recordings` and
  reported as `meeting_recording.unbounded_storage`.

The row id comes from the bot id and `cost_tracking.record_usage_receipt` writes it
once, so webhook retries, reconcile passes and backfills cannot count a bot twice.
Blocking IO: call it off the event loop. It never raises: an unfinished bot, an
unpriced component or a ledger failure is reported on the cost-tracking channel.
Migration `20261012150000_recall_meeting_usage.sql` holds the pay-as-you-go list
prices (bot $0.50/h, transcription $0.15/h, storage $0.05 per recorded hour per 30
days). Verified 2026-10-12 against what we paid: on this measure they account for
$239.90 of the 24 x $10 top-ups bought between 2026-04-23 and 2026-10-09. The
account is self-serve pay-as-you-go (prepaid credit, automatic $10 top-ups), not a
monthly plan. Top-ups up to September 2026 are `infra_subscription` rows; October
onwards must not get one.
