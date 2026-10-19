---
name: state-and-persistence
description: "simpl-wide rules for state machines, idempotency, database sessions/transactions/locking, async/IO discipline, bounded execution, and observability. ALWAYS consult when touching status/state fields, writing repositories, opening transactions, claiming work in queue-style tables, holding sessions across awaits, retrying external IO, fanning out concurrent calls, adding background workers, instrumenting commands with logs/metrics, recording a real-world fact about a ULC (user-lead connection: messages, inbound, calls, charges, contracts; it must write an `outreach_events` row; a stage change is not an event), or deploying anything to Google Cloud (cost tracking is mandatory and must never block)."
---

# State and persistence discipline

> **Auto-distributed via simpl_knowledge. Edit it in `simpl-techs/simpl_knowledge`, where changes go straight to `main`.**

This skill is always-on. It governs the runtime behavior of code that owns state or talks to slow IO.

## State, status, idempotency

- Status fields are typed enums, not free-form strings: allowed values live in code, so a new state needs a code change.
- Document the state machine's allowed transitions. The repository, or a guard at the write seam, rejects illegal ones.
- Every transition status ("in progress", "claimed", "locked") needs a grace period: a timestamp and a reclaim window, so a crashed worker cannot pin the row forever.
- Reclaim from the row's timestamp, not an in-process heartbeat, so a second worker takes over a stale claim without coordinating with the first worker's memory.
- Terminal states (completed, failed, canceled) are terminal. A retry path creates a new attempt; it never resurrects the row.
- Persist idempotency keys so they outlive the request and a retry from another process still deduplicates.
- **A link we send (email, Slack, Teams) changes nothing when it is opened.** Opening it shows a page; the change happens only on a POST from a button the person presses. This covers one-time sign-in tokens (invite, reset, magic link), unsubscribe, and every approve / confirm / reject / accept link. Mail security scanners (Microsoft Defender Safe Links and the like) open every link in an email before the person does, and some run the page's script too. So a GET handler never spends a token or writes, and the page never fires its action from `useEffect` or an auto-submitting form. Why: on 2026-10-19 a CEO's onboarding invite showed "expired" twice because the scanner had spent the token (ENG-876, simpl_sales `/login/continue`). Test it: the handler's test asserts that a GET of the link leaves the token and the row unchanged.

## ULC events: `outreach_events`

- **`outreach_events` records what actually happens to a ULC (`sales.user_lead_connection`)**: a lead claimed, a message sent or received, a connection accepted, an inbound lead, a call scheduled, confirmed, held or missed, a charge, a contract signed. It is the one place metrics are computed from and the full history of a ULC is read from. Every row has `ulc_id`, `lead_id` and `user_id` set.
- **A pipeline stage is not an event.** A stage is a name on the ULC; its changes live in `sales.user_lead_connection_history` (trigger `trg_log_status_change`). Keep the two apart even when they look alike: a ULC moved to Meeting Booked and a `call.scheduled` event both exist, one for the pipeline, one for the fact. Never write an event for a stage change, and never use a stage change as the record of a fact.
- **A new ULC fact ships with its event, in the same change.** A feature that records a fact about a ULC without writing its event is not finished.
- **Write the event in the code that records the fact, in the same transaction.** Python: `OutreachEventRepository.log_event` (simpl_core) on the session that writes the change. TypeScript: insert into `sales_outreach.outreach_events` in the same request, right after the write. Not in DB triggers on the source tables, even where a trigger already wakes the walk for that fact: a SQL function writes the event only when the change itself happens inside that function. One fact has one writer.
- **Naming:** `event_type` is lowercase, dot-separated and ends in a past-tense verb, like `linkedin.message.sent`, `email.message.received`, `user.action.approved`. It names the fact, not the stage (`call.scheduled`, not `meeting_booked`). Look up the existing types first and reuse one rather than add a synonym. `event_data` carries the ids of the source rows (meeting, charge, contract) so metrics can join them.
- **`timestamp` is when the fact happened**, not when the row was written: take it from the source (the message's `sent_at`, the connection's `connected_at`, the ULC's `created_at`, the trigger that carried the fact), never from when the code that handles it ran.
- **New metrics and ULC timelines read `outreach_events`**; they do not re-derive a fact from the source tables or from stage changes.
- **A new event type for a fact that already happens in production comes with a backfill** from the source table, with the original timestamps, otherwise every metric on it starts from the deploy day.
- **Tests:** the test of the code that records the fact asserts the event row (`event_type`, `ulc_id`, `timestamp`).

## Database access, transactions, locking

- Scope each session to an explicit unit of work, one logical lifecycle per request. Never leak a session across requests, jobs or background tasks, or reuse one (sync or async) across unrelated operations or background tasks.
- Transactions are short and atomic: open, run the SQL, commit. They never wrap external IO or long compute: **no LLM call, HTTP request, queue publish or arbitrary user code inside a transaction.**
- Acquire one connection per logical step, not per "process this entity". Releasing between steps prevents pool starvation under concurrency.
- Claim queue-style work with `SELECT ... FOR UPDATE SKIP LOCKED`, so workers never race on a row and `SKIP LOCKED` guarantees forward progress. Pair every claim with `claimed_at` and a reclaim window; once the window passes, another worker may re-claim it.
- Put per-statement timeouts on hot queries, so a slow query fails fast instead of pinning a connection for minutes.
- Prefer ORM/Core constructs over raw text queries. Raw SQL only for CTEs, RPCs and other features the ORM cannot express. No raw driver calls in business code when a repository exists.
- Schema-side concerns (triggers, RLS, partial indexes, view and function definitions) live in versioned migration files, never built at runtime.
- Repositories return ORM objects or typed records; services translate them to DTOs. Never pass raw row proxies up the stack.

## Async and IO

- Never hold a DB session across an LLM, HTTP or other slow await. At worst it pins a connection inside an open transaction and starves the pool; at best it wastes wallclock the event loop could spend elsewhere.
- Fetch → compute → mutate: acquire the session, run the SQL, release; call the slow IO; re-acquire if you need to write. Never fetch → wait → mutate in one session.
- No blocking or sync calls on the event loop: no `requests`, no sync DB drivers, no CPU-heavy synchronous work in an async path. Offload it to a thread pool with an explicit bound.
- Run independent awaits concurrently with structured concurrency (`asyncio.gather` or equivalent); serial awaits on independent IO waste wallclock.
- Honor cancellation: long-running coroutines check for it at await boundaries and never swallow `CancelledError` to "finish cleanly" through a shutdown.
- Backpressure over buffering: when a downstream is slow, slow the producer; never grow an unbounded in-memory queue.

## Bounded execution

- No unbounded `while True`: every loop has a max-iteration cap, a max-wallclock cap, or both.
- Retries are bounded and budgeted: per-operation retry counts, per-window retry caps and a final "give up and surface" path. Never a silent forever-retry. Surfacing rules: `data-flow-discipline` → *Failure surfacing*.
- When a loop cap or a retry budget is reached, surface it explicitly in a structured log with the entity id and the reason.
- Every external call (HTTP, LLM, RPC) has an explicit timeout.
- Worker pools, fan-out and parallel maps declare their concurrency bound (semaphore or worker pool), never "as many as the system allows". Never `gather` an unknown-sized list of LLM/HTTP calls.
- Time-based staleness checks (e.g. "is this trigger past its planned window?") use an explicit tolerance constant, not an implicit boundary.
- Cap what grows with retries (logs, JSONB blobs, in-memory aggregates): keep the most recent N, the top-K by count, and so on.

## Observability

- Every command emits a structured log with a correlation id; free-text logs without identifiers are write-only noise.
- Persist progress instead of holding it in memory: state a downstream operator might want to inspect lives in the DB or an event bus, not in a process variable.
- **Every workload deployed to Google Cloud MUST record its compute and LLM costs through simpl_tracker.** Google bills every Cloud Run instance whether or not the code says so; a workload that records nothing is an invoice line with nothing behind it in `cost_tracking`.
  - Cloud Run services and worker pools: call `track_instance_lifetime(process_name=...)` once at startup (FastAPI lifespan, worker main) and `close()` it on shutdown. They are billed for the instance's whole life, idle included, so per-request or per-task sessions undercount.
  - Cloud Run jobs and Prefect flows: `@track_compute(process=...)` on the entry point.
  - LLM spend: every request leaves a receipt (`require_request_accounting` at startup); see the `simpl_tracker` skill.
  - `tracker.yaml` has `cost_tracking.enabled: true` and `infra_tracking.enabled: true`. Doppler provides `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `DISCORD_COST_TRACKING_WEBHOOK_URL`.
  - Every `gcloud run deploy` / `worker-pools deploy` sets the label `simpl_repo=<repo>` so the GCP billing export attributes the cost.
  - Never write `cost_tracking.infra_compute_session` rows yourself.
- **An untracked cost is reported, NEVER a failure.** Nothing may refuse a request, refuse to start, fail a run, block a deploy or wait on the ledger because a cost could not be recorded.
  - Report it with `simpl_tracker.report_tracking_gap(event, message, fingerprint=...)`, which posts to the dedicated cost-tracking Discord channel (`DISCORD_COST_TRACKING_WEBHOOK_URL`), deduplicates and never raises. TypeScript apps post to the same webhook the same way (`simpl_sales/lib/cost/tracking-alerts.ts`). Every new "cost not recorded" path goes through it, never through `raise`, `throw` or a bare log line.
  - Recording is bounded and off the critical path: one short attempt before the work (simpl_tracker: at most 2 s before an LLM request is dispatched), then the work goes ahead and the record is retried in the background. Never a retry loop, a lock or a full queue that makes a request, a flow or a shutdown wait.
  - Scheduled cost jobs report too: scripts and GitHub Actions that settle, reconcile or backfill costs post what they could not record to the channel and exit 0 (`simpl_tracker/scripts/reconciliation_alert.py`, `cheaper_inference_costs.py`). A red run nobody watches is not a report. A dry run only prints.
  - Alert fields: `event` names the gap as `<area>.<gap>` (`llm_accounting.no_tracker`, `compute_tracking.missing`, `cheaper_inference.settle_incomplete`). `fingerprint` is stable per problem and service (`f"{event}:{service}"`), so a repeat updates one message instead of flooding the channel. `message` says which cost is missing and how to fix it. No secrets, tokens, PII or raw payloads.
  - In Doppler the webhook lives in `prd` only (`scripts/doppler/key-targets.txt`, `KEY@prd`), so local and staging runs never post. Workflows get `DISCORD_COST_TRACKING_WEBHOOK_URL` as a GitHub repository secret, Vercel through the Doppler sync. Never in code or in a repo. When it is unset, simpl_tracker falls back to the service's #error channel.
  - Tests: a new "cost not recorded" path gets a test that the gap is reported and that the caller does not raise, is not refused and does not wait.
  - The deploy runs `scripts/check-compute-tracking.py` (from `library-repo-template/`) as the first Cloud Build step. It only warns and always exits 0; the running service reports the same gap on the channel.
  - The channel is not the only net: `cost_tracking.provider_reconciliation` compares the ledger with what each provider billed, and `reconciliation-alert.yml` posts its drift to the same channel. That catches the spend no in-process check sees.

## Out of scope / see also

- Where code lives and how it composes (services vs repositories, packaging, dependency direction, command/query design): `architecture-discipline`.
- How data threads through layers, DTO field invariants, output validation, failure surfacing vs silent no-op: `data-flow-discipline`.
- Tests for state machines, command idempotency and concurrent-claim safety against a real Postgres, and command/query testing rules: `testing-policy`.
- Universal principles and the routing table: `coding-standards`, the hub.
