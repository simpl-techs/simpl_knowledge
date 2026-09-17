---
name: simpl_core
description: |
  Use this skill whenever the user asks about shared simpl platform domain logic, autopilot services, CRM/email/reports services, or code that imports `simpl_core`. ALWAYS consult this skill before adding duplicated business logic in app repos that could belong in `simpl_core`.
---

# simpl_core integration guide

> **Maintained by**: the `simpl_core` repo, auto-synced to simpl_knowledge.
> **Source of truth**: `simpl-techs/simpl_core/.agent/SKILL.md`

## What this library is

`simpl_core` is the shared Python business layer for the simpl platform. It contains reusable domain models, repositories, and services for autopilot, outreach, CRM, email, notifications, reports, ROI / capital allocation (`simpl_core.roi`), and related platform workflows.

Request accounting uses the coordinated tracker migration and library release.
`simpl_ia` captures each model response; `simpl_core` binds agent/node/pipeline
and business attribution. `track_cost` suppresses duplicate run aggregates when
request evidence exists. Unknown prices remain visible; never synthesize costs
from an unmatched provider-export difference.

## Installation

```bash
poetry add "simpl-core[composio-sdk] @ git+https://github.com/simpl-techs/simpl_core.git@main"
```

Use extras only when needed:

```bash
poetry add "simpl-core[novu,composio-sdk] @ git+https://github.com/simpl-techs/simpl_core.git@main"
poetry add "simpl-core[agent-framework] @ git+https://github.com/simpl-techs/simpl_core.git@main"
```

Base `simpl-core` installs `simpl-ia` (same pin as other platform repos) so `import simpl_ia` works in the venv. The `agent-framework` extra adds `simpl-ia[agents]` (pydantic-ai, Langfuse) for `simpl_core.agent_framework` and `simpl_ia.agents`; that submodule is not imported at `import simpl_core`.

## Basic usage

```python
from simpl_core.services.autopilot.engine import AutopilotEngine
from simpl_core.services.autopilot.eligibility_service import EligibilityService
from simpl_core.roi import calculate_company_cost, resolve_canonical
```

Prefer importing the specific service, repository, or model you need. Keep app-layer orchestration in the app repo and reusable domain behavior in `simpl_core`.

## Rules and conventions

- Put reusable platform business logic in `simpl_core`, not in `simpl_api` or `simpl_flow` copies.
- Keep database access behind repositories or services. Do not scatter raw SQL across consumers.
- Use `simpl_orm` for shared database patterns and `simpl_tracker` for tracking/logging integrations.
- Treat exported services, repositories, models, and schemas as shared API. Update this skill when changing their public behavior.

## Agent framework

`simpl_core.agent_framework` is a database-driven runtime for gating and routing AI
producer output. Pipelines, agents, validators, routes, and prompts are versioned
rows, not code. It needs the `agent-framework` extra.

Open a run against a published config version, then walk its pipeline:

```python
from simpl_core.agent_framework import resolve_engine_entry

entry = await resolve_engine_entry(
    db,
    config_key="my_root",          # required; the framework has no default key
    config_version=None,           # None selects the active version
    llm_client_resolver=resolver,
)
pipeline = await entry.loader.get_pipeline("my_pipeline")
# stamp entry.config_version_id onto the run audit
```

`resolve_engine_entry` raises `LookupError` when the config key has no ledger
version and `ConfigValidationError` when the resolved version is broken with no
good fallback. It never falls back to reading whatever component rows happen to be
active.

Nested `pipeline_id` references are a closed-document invariant. Missing
references, cycles, excess depth, and mismatched `subgraph.version` pins across
`subgraph` and fan-out pipeline branches fail `af_config_migrate`, projection,
and loader boot/load before a walk starts.

Root and nested walks use one immutable `PipelineRunInputs` envelope. Its
`domain` payload must be deeply immutable; static children share it without
copying, and mapped children freeze DB-shaped mappings and lists into an
immutable local `item` plus
`parent_items` ancestry. Consumers extend `PipelineRunInputs` for their typed,
data-only fields; clients, sessions, and services stay on coordinator factories.
Admit the envelope at the root with `PipelineRunInputs.root(domain)`. Child
failures remain branch-local: fan-out and joins report `completed`, `partial`,
`failed`, or `empty` aggregate state without terminating sibling work. Pipeline
fan-outs tolerate `partial` and `empty` aggregates; agent fan-outs pass only
when every branch passes. Public consumer-envelope fields are exposed to
`domain_inputs` resolvers and may not shadow a domain key.

An `llm_agent`'s `model` is a nested policy — a primary target plus ordered
fallbacks — resolved per agent through an `LLMClientResolver` built from
host-supplied credentials:

```python
from simpl_core.agent_framework.llm_client_resolver import (
    DefinitionLLMClientResolver,
    provider_bindings_from_env_keys,
)

resolver = DefinitionLLMClientResolver(
    provider_bindings_from_env_keys(openai_api_key=os.environ["OPENAI_API_KEY"])
)
```

Credentials are never authored in a policy document — the document names a
provider, the host binds it. Startup fails if a policy needs a binding that was not
supplied. A `model` given as a bare string uses a single shared client instead.

Domain behaviour is supplied two ways: **registries** keyed by a string in a policy
row (`PrimitiveRegistry`, `ResolverRegistry`, `RouteHandlerRegistry`, `ToolRegistry`,
`MemoryProviderRegistry`, `AgentKindRegistry`), filled at bootstrap import; and
**factory callbacks** on `NodeCoordinator` keyed by the live node. Every callback
but `resolver_context_for` is optional, and a node needing an absent one fails
closed rather than guessing.

Rules that bite consumers:

- Manifest membership, **not** `is_active`, is what a ledger-resolved run reads.
  Projected component rows are inserted inactive; re-filtering loader output on
  `is_active` empties the graph.
- A policy change needs a **new** ledger version. Editing a projected version's
  content in place and re-running a seed migration are both silent no-ops.
- Routing must be total: every routing position needs an unconditional catch-all,
  or startup fails.

### Streaming producers

A `streaming_producer` node runs its agent once, emitting `StreamEvent`s onto a
`StreamChannel` as it goes, then closes the turn with a terminal `message_final`
(or `error`) event. There is no blocking critic and no fix loop. The framework owns
the event vocabulary and the channel; the bridge that forwards events onto SSE or a
WebSocket is yours — wire it through the `stream_channel_for` / `stream_produce_for`
factories on `NodeCoordinator`.

Two node fields exist only on this kind:

- `framework_produce: true` lets the framework run the agent itself through
  `execute_agent_stream` when no consumer produce is wired, with the agent's model
  policy in force. It is an opt-in: with no consumer produce and no opt-in the node
  fails closed before any model is resolved, because that produce sends the
  prompt row to a live model with live tools and a walk with no wiring — an eval,
  a replay — must not do that by default.
- `stream_field: <name>` makes `token_delta` events carry only that output field's
  text, recovered from the JSON as it streams (text, fenced, or output-tool
  arguments alike). Without it, deltas carry the model's raw output text — JSON
  for a structured turn. The field must be a `str` of the agent's `output_schema`;
  startup warns by name when it is not.

An `llm_agent` bounds a streamed turn with `stream_timeout_seconds` (default ten
minutes) — the whole answer, tool round trips included — while `timeout_seconds`
bounds only the *opening* of each model's stream. A streamed turn runs at the
provider's default temperature and never re-asks the model: a schema-invalid
payload ends the turn. Once `message_final` has been delivered the run is recorded
with that output even if a cancellation lands during close.

Full guide: `docs/agent_framework/08-streaming-output.md`.

Full guide: `docs/agent_framework/`.

### Alerting

Every exception the framework handles is classified in one place,
`simpl_core.agent_framework.alerting`, and handed to `simpl_tracker`:

- **`#warning`** hears every exception the framework catches, converts into a
  fail-closed status, or lets escape a public entry point — once.
- **`#error`** is for work that stopped or a gate that went missing: boot gates
  failing, a malformed pipeline / validator / routing row dropped, a node whose
  author chose `escalate`, `block` or `error`, an active config version with no good
  version to fall back to — and whatever your rules promote.
- **Log only**: policy doing its job (a validator rejecting content, an exhausted fix
  loop, an unmatched route, a transient error still being retried) and any
  `ExpectedInterruption`.

Register your promotions once at bootstrap, beside handler registration:

```python
from simpl_core.agent_framework import AlertRule, add_alert_rules

add_alert_rules(
    # The ops checks exist to be seen: page on them.
    AlertRule(
        event="agent_framework.engine.validator_failed",
        pipeline_id="pipeline_ops_agent",
        severity="error",
    ),
)
```

- **Rules.** The first matching rule wins, and every field a rule sets must match:
  `event`, `exception` (by `isinstance`), `pipeline_id` (the innermost pipeline of
  the run), `node_id_prefix`. `group_by` adds run-context keys to the alert
  fingerprint. A `silent` rule needs a `reason`.
- **Rules belong to the process.** `add_alert_rules` appends only the rules not
  installed yet, compared by value, after the ones already there, and never touches
  the other settings. Every app registers its own promotions with it, the shared
  `pipeline_ops_agent` rule included, and a host that embeds another app keeps both
  apps' rules whichever bootstraps first. `alert_rules()` returns what is installed.
- **Process settings.** `configure_alerting` changes only what it is given:
  `enabled=False` keeps the logs and sends no alerts, `shared_dedup=False` keeps the
  tracker's own dedup store, and `rules=` replaces every installed rule, other apps'
  included, so pass it only for a deliberate full replace.
- **Expected interruptions.** Subclass `ExpectedInterruption` for a failure nobody
  can act on (a dropped extension channel whose work re-queues itself). It is
  recorded on its node run and logged, never alerted, and never reported as a crash.
  The node run's `error` carries `"expected": true` (so does a cancelled node's), and a
  failed fan-out whose every branch was one logs
  `agent_framework.coordinator.fan_out_interrupted` instead of `fan_out_all_failed`.
  Every subclass inherits `__simpl_notify__ = False`, which `simpl_tracker` reads: the
  exception stays silent when you log it yourself with `error=exc` too, even as another
  exception's `__cause__`. Only an explicit `notify="warning"` or `notify="error"` posts
  it.
- **Fan-out branches.** Each branch in a gather join's `gathered` dict carries
  `error_type` (the exception class it ended on, or `None`) and `expected`, beside
  `error`; read those instead of matching on the message. The fan-out's own
  `produced` adds `expected_error_branch_count`.
- **Run identifiers.** Pass your own ids as `labels={"user_id": ..., "session_id": ...}`
  to `resolve_engine_entry`, `walk_graph`, `execute_agent` or `execute_agent_stream`.
  The Sales Domain wrappers take `labels` too and hand them to every entry point they
  call: `run_sales_domain_for_user`, `run_sales_domain_pipeline`, `run_framework_walk`
  (which also binds them around its `finalize`), `open_sales_domain_runtime`,
  `resolve_admission_route`, and `TriggerRegistry.wake_agent` for its inline run.
  Every alert raised inside the call carries them, including one from a nested walk,
  a node run or a spawned task, and a label whose key ends in `_id` is counted as an
  alert entity. Labels are never persisted. The framework binds `correlation_id`,
  `pipeline_id`, `pipeline_run_id`, `node_id`, `node_run_id`, `agent_id` and the
  config version itself; a label may not take those names. You no longer need
  `bind_run_context` around a walk.
- **Report once.** Before alerting on an exception you caught from the framework,
  check `already_reported(exc)`: `True` means the tracker accepted an alert for it, or
  for an exception it was raised `from`, on `#warning` or `#error`. An alert the tracker
  refused (no notifier, a refused send) or failed to deliver does not count, so your own
  alert still applies. `resolve_engine_entry`, `walk_graph`, `execute_agent`,
  `execute_agent_stream`, `Loader.validate_boot` and `PlanRunner.run` report an
  escaping exception as `agent_framework.run.crashed` (or `run.cancelled`, one per
  pipeline) and re-raise it unchanged. Within one run, alerts group by incident under
  its outermost node run. A later event there only logs when it carries the same
  exception as an earlier alert (or one raised `from` it), or when it carries no
  exception and is an outcome of that failure, such as `error_terminal`,
  `node_error_terminal` or `transient_error_exhausted`. Exception class never decides: a
  different failure posts even when it raises the same class, and so does anything more
  severe. Exact repeats reach the tracker, which counts them in one message. A failure
  raised through a node's retries alerts once, as `transient_error_exhausted`. Only an
  alert that reached an operator groups: one the tracker refused, or accepted and then
  failed to deliver, clears its run's group, so the next outcome there posts. An outcome
  that already folded while that alert was still queued or in flight is not posted
  again; delivery is not durable.
- **Step trace.** `walk_graph` writes `pipeline_run_steps` as each step finishes, and
  once more when the walk ends, even when it raised. It is on by default for a root walk
  whose node runs go to the database (`DbNodeRunRecorder`) and that has a
  `pipeline_run_id`. Pass `step_recorder=DbStepRecorder(db)` (or any `StepRecorder`)
  to trace elsewhere, or `step_recorder=None` to turn it off. `error` is SQL NULL on
  success and `{"type", "message", "expected"}` on failure; a failed write alerts as
  `agent_framework.step_recorder.write_failed` and the recorder keeps writing. Delete a
  step recorder of your own.
- **Shared dedup.** The framework installs the Postgres dedup store itself on its first
  walk with a database (a `DbNodeRunRecorder`), once per notifier, so a recurring
  failure is one thread across flow runs; `configure_alerting(shared_dedup=False)` opts
  out. Processes also agree on who posts: one of them posts a new alert, or its
  re-post or escalation, and the others only count it. Only a process that does not run
  the framework calls `install_alert_dedup_store`.
- **Config fallbacks** are reported by the framework
  (`agent_framework.config_ledger.fallback_applied` / `fallback_exhausted`) for every
  config key. A fallback handler you register runs after that report and no longer
  needs to alert.
- **Tracker version.** Routing an alert to a channel other than its log level's, and
  carrying the exception on warnings, need
  `simpl_tracker.logging.NOTIFY_API_VERSION >= 2`. Against an older tracker only
  events whose channel matches their log level notify. On version 2 and later every
  framework call passes an explicit `notify=` (`False` for log only), so a tracker
  default that notifies exceptions never overrides the classification. A tracker with
  `ignore_callsite_modules` names the framework caller, not the alerting package, as
  each line's callsite. A tracker whose log calls answer with a bool tells the framework
  whether it accepted each alert, and the framework counts an alert as reported only
  then; a tracker that answers nothing counts as accepting. Shared-dedup delivery claims
  need a tracker that knows the `pending` dedup action and calls the store's `release`.
  Posting a deferred alert once the other post failed needs a tracker that calls the
  store's `recheck`; replacing a deleted message once needs one that passes `message_id`
  to `forget`; clearing a lost alert's group needs
  `simpl_tracker.notifications.add_undelivered_listener`. Against an older tracker a
  `pending` alert counts as sent, a deleted message's row is forgotten outright, and a
  lost alert's group keeps its rank.
- **What you delete.** Config-fallback handlers, per-item Discord alerts that repeat
  what the framework already reported (or guard them with `already_reported`), and
  your own step recorder. What stays yours: `labels=`, your `ExpectedInterruption`
  subclasses, and the rules that promote an event to `#error`.
- **Renamed events.** `agent_framework_tool_failed` →
  `agent_framework.tool_audit.tool_failed`; `tool_audit.unresolved_agent_id` and
  `tool_audit.missing_agent_run` → `agent_framework.tool_audit.*`;
  `plan_review_notification_failed` →
  `agent_framework.plan_lifecycle.review_notification_failed`.

`EVENTS` lists every event with its kind, default severity and reason, and
`testing.strict_run` derives its deny list from the same registry.

#### Alert dedup across processes

The tracker's notifier collapses repeats of one alert: the first occurrence posts,
repeats edit that message, a count of 100 or 1000 posts again, and a warning still
recurring an hour after it began escalates once to `#error`. Its own store lives in
process memory, which two Cloud Run jobs never share. The framework keeps that state in
Postgres instead (`agent_framework.alert_fingerprints`, migration
`20260914_af_alert_fingerprints.sql`), so every process shares one count and one
Discord message per alert.

- **No wiring for a framework consumer.** The first `walk_graph` whose node runs go to
  the database (`DbNodeRunRecorder`) calls `ensure_alert_dedup_store(db)` with that
  database, whatever its `step_recorder`. It reads the notifier through
  `simpl_tracker.current_notifier()` and installs `PostgresDedupStore` on it when the
  tracker is 0.5.0 or later, the notifier's config leaves dedup enabled, its store is
  still the tracker's default `InMemoryDedupStore`, and you have not opted out. The store
  takes the notifier's own `dedup_window_seconds`, `repost_thresholds` and
  `escalate_after_seconds`, so your tracker YAML's `notifications.dedup` settings apply.
  It decides once per notifier: a notifier that a later `configure_from_yaml` puts in
  place gets the store too, a walk that runs before the tracker is configured leaves the
  decision to the next walk, and every later walk costs a lookup. A failure to install
  never breaks the walk. One store per database and dedup settings serves every notifier
  in the process.
- **Opting out.** `configure_alerting(shared_dedup=False)` keeps the tracker's own
  store. A store you install on the notifier yourself is also left alone.
- **A process that notifies without walking the framework**, and only such a process,
  calls `install_alert_dedup_store(database_url)` after configuring the tracker, and
  again after any later `configure_from_yaml` / `configure_from_block`, which builds a
  fresh notifier. It returns `False` when the tracker predates 0.5.0, no notifier is
  configured, or the store cannot be built.
- **Database.** `ensure_alert_dedup_store` takes a URL or your `DatabaseManager` (it
  uses the URL the manager's engine connects with). The connecting role needs
  `SELECT, INSERT, UPDATE, DELETE` on the table. The store opens its own small engine
  on its own thread, and works over the direct host and either Supabase pooler.
- **Delivery claims.** Counting an occurrence and claiming its delivery happen in one
  short transaction. When the tracker's rule says post, re-post or escalate, the row
  takes a claim (`claim_token`, `claim_expires_at`, 180 seconds). Any other process
  counting that fingerprint meanwhile sends nothing new, or edits the existing message
  when it lost a re-post or escalation. A post completes the claim only while the claim
  is still its own, so a claim taken over after it expired keeps the newer message. A
  post that was not sent gives its claim back at once. A process that dies mid-post
  holds back that fingerprint's next message until the claim expires. A process that
  sent nothing because another held the claim keeps its alert deferred and asks the
  store again (`PostgresDedupStore.recheck`, which never counts the occurrence twice): it
  edits the message once one exists, and posts under a claim of its own when the other
  post failed or its claim expired. When an edit finds the Discord message deleted,
  `forget(fingerprint, message_id=...)` drops the row only while it still holds that
  message, so two processes that both hit the deleted message replace it once.
- **Failure.** The store never raises into the notifier. When the database fails or
  stalls (5 s), that call dedups in memory, the database is retried after 30 s, and the
  outage is logged once on the stdlib `simpl_core.agent_framework.alerting.dedup_store`
  logger. At exit it flushes queued alerts through itself before closing.

### Publishing a config version

A policy change reaches a running graph only as a **new** ledger version. A
version's content is read once, when projection turns it into component rows;
editing an applied version, or re-running its migration, changes nothing.
`af_config_migrate` writes the seed migration that carries a version. It applies
nothing. Reverting is the same operation pointed backwards --
`activate_config_version(<key>, <earlier version>)`.
It is the sole supported YAML seed generator; do not restore or alias retired
`sync_yaml`.

```bash
simpl_core af_config_migrate \
    --yaml path/to/policy.yaml --dest migrations/ \
    --config-key my_root --version 3 --parent 2 --prefix 20260807 \
    --summary "one line on what changed" [--activate]
```

```python
from simpl_core import af_config_migrate, assert_newest_seed_matches_document
```

`--prefix` is your repo's own migration number; the filename is
`<prefix>_seed_<config_key>_<version>.sql`. Without `--activate` the version is
inserted inert, to be activated as a separate deploy step. The author is your
git `user.email` unless you pass `--created-by` or set
`AGENT_FRAMEWORK_LEDGER_CREATED_BY`.

It refuses, writing nothing, when the document fails the authoring gates, when
it is identical to its parent, or when the target files already exist (pass
`replace=True` only for a version applied nowhere).

`assert_newest_seed_matches_document(migrations_dir=..., document=..., config_key=...)`
raises `AssertionError` when the authored document has drifted from the newest
seed carrying it. Call it from a test; it imports no test framework.

Both need the `agent-framework` extra — they validate through the framework's
schemas. `import simpl_core` itself stays free of that dependency; the cost is
paid on first access to either name.

## Email send-as aliases

Connected Gmail/Outlook accounts can send from a verified alias stored on `integration.user_connection.config`:

```python
from simpl_core.services.email import (
    list_user_send_as_addresses,
    set_user_send_from_email,
    SEND_FROM_EMAIL_CONFIG_KEY,
)

addresses = await list_user_send_as_addresses(
    user_id,
    "gmail",
    session=session,
    db_manager=db_manager,
    composio_api_key=...,
    composio_toolkit_versions=...,
)

await set_user_send_from_email(
    user_id,
    "gmail",
    "sales@company.com",
    session=session,
)
```

When `send_from_email` is set, `get_connected_email_service()` applies it automatically on outbound sends. Per-request overrides remain available via `SendEmailRequest(from=...)`. Aliases must already be verified in Gmail or enabled in Microsoft 365 before Composio can send from them.

For Outlook replies, consumers with a persisted conversation should pass both `threadId` and the latest stored `replyMessageId`. The adapter validates that message against Outlook before replying. `EmailNotFoundError` means Outlook definitively reports the requested conversation or reply target unavailable. An unscoped inbox or sent-items page that Outlook cannot retrieve raises `EmailMailboxPageUnavailableError`; mailbox sync logs the page, preserves its cursor, and retries it later. Runtime, connection, and malformed-response failures remain `IntegrationError` for the caller to surface.

Outlook gives a sent draft a new message id once it lands in Sent Items, so the `provider_message_id` that `send_email` returns is not the id mailbox sync later lists. `EmailDTO.internet_message_id` carries the RFC 5322 Message-ID, which survives the move. When persisting an Outlook send, pass it as `record_sent_email_message(..., internet_message_id=...)`: ingestion then recognizes the synced copy in the same thread and does not store the message twice.

A `sales_outreach.journey_log` row is its `(action_type, channel)` pair, and the pair must be in `EXECUTION_KINDS` (`repositories/outreach/journey_dispatch_rules.py`, exported from `simpl_core.repositories.outreach`): `send_message` on `email`, `linkedin_message` or `call`; `linkedin_connect` on `linkedin_connect`; `invite_call` on `calendar`. `classify(payload)` returns `executable`, `non_executable` (a verb in `NON_EXECUTABLE_ACTION_TYPES`, whatever channel it carries) or `invalid`; `execution_kind(payload)` returns the pair or `None`. Write an invitation as `action_type = "linkedin_connect"`, never as `send_message` on the connect channel: approval (`set_pending_with_version`) and the database trigger refuse the row with `invalid_transition: ...` (409 in simpl_api), as they refuse an unknown verb, a missing verb and an email send without `recipient_email`. Mirror the sets (`EXTENSION_KINDS`, `EMAIL_KINDS`, `CALENDAR_KINDS`, `SELLER_EXECUTED_KINDS`, `CONTENT_DELIVERY_VERBS`, `STANDALONE_EXTENSION_TASKS`) with a parity test against this package rather than by hand; every one of them is declared here, the four executor sets partition `EXECUTION_KINDS`, and `(invite_call, calendar)` is a calendar kind run by simpl_api on approval, not a seller-executed one.

`JourneyLogRepository.claim_pending_email_actions*` claims only due `PENDING` rows with `channel = 'email'`, an `action_type` in `EXECUTABLE_EMAIL_ACTION_TYPES` (`send_message`, derived from the email kinds) **and** a non-empty `recipient_email`. The outreach agent writes its `schedule_followup` wake-ups and other bookkeeping rows on the lead's channel with no message; they are timeline records, not sends, and the claim leaves them `PENDING`. A new kind of sendable row must be added to the table before any sender will pick it up. A send with no recipient is never claimed and a sender must never derive one: the row carries its own destination and identity, and from the moment it is `PENDING` or `RUNNING` every payload writer in the repository refuses to change any of `DELIVERY_FIELDS` -- `action_type`, `channel`, `recipient_email`, `cc_emails`, `bcc_emails`, `recipient_linkedin_url`, `recipient_linkedin_urn`, `expected_sender_account` (`assert_delivery_fields_unchanged`, raising `invalid_transition: ...`) -- whatever status the write moves the row to: a claim, a completion or a cancellation that also rewrites one is refused, and so is `admin_override_fields` switching the channel while un-approving. To change a destination, un-approve with the fields intact, edit the draft, approve again. Stamp results with `update_payload` as before; restating the approved values passes, rewriting them does not.

`JourneyRepository.get_pending_actions(ulc_id, executable_only=True)` returns only the open rows with an execution kind (queued sends and invitations, not placeholders or review cards); `cancel_pending_actions_for_ulc(..., statuses=("PENDING_APPROVAL",))` cancels drafts and leaves an approved `PENDING` row to the sender that will drain it. Both defaults are unchanged.

A Gmail, Outlook or HubSpot service built with a `ComposioConnectionService` marks its connection row and raises `StaleComposioConnectionError` (wrapped in the provider's own error) when Composio reports the account unusable: a structured expired/revoked code on a raised error, or a failed tool result relaying the provider's HTTP 401 (`data.status_code`), which marks the row `expired` with reason `COMPOSIO_PROVIDER_TOKEN_EXPIRED_REASON`. Detect it anywhere in a wrapped chain with `simpl_core.composio.stale_connection_from_error` and treat it as handled: the row is already marked, only the user reconnecting fixes it, and the class sets `__simpl_notify__ = False` so simpl_tracker's default notify skips it.

`sales_outreach.message.provider_metadata` holds identifiers, envelope, and send provenance only: the keys in `simpl_core.services.email.utils.MESSAGE_PROVIDER_METADATA_KEYS`. Subject and body are never copied into it; read them by decrypting `encrypted_subject` and `encrypted_body`. Ingestion drops any payload key outside that set, so a consumer that needs a new field in `provider_metadata` adds it to the set first.

## Entity deduplication

`simpl_core.services.dedup` is the single place identity-matching rules live for
companies and leads. Do not write your own matcher.

```python
from simpl_core.services.dedup import (
    CompanyIdentityClaim,
    CompanyResolver,
    LeadIdentityClaim,
    LeadResolver,
)

outcome = await CompanyResolver().resolve(
    CompanyIdentityClaim(linkedin_url=..., landing_url=..., email_domain=...),
    session=session,
)
if outcome.is_match:
    company_id = outcome.entity_id
elif outcome.should_escalate:
    ...  # enrich, or ask an agent; outcome.proposals / .conflicts say why
```

Resolution is the cheap rung of an escalation ladder. `matched` is the automatic
path; the other three mean *do not auto-link, escalate*, and they escalate
differently:

| action | meaning | next step |
|---|---|---|
| `ambiguous` | several candidates, nothing to choose between them | they are already loaded — often duplicates, so merge. **Never create**: the claim is probably one of them |
| `blocked` | a candidate contradicted the claim on a trusted field | do not link to it — but creating is right, the contradiction is evidence of a *different* entity |
| `insufficient_signal` | nothing found | enrich, then retry; safe to create |

**Branch on `action`, not on `is_match`.** Read as a boolean, three distinct
refusals collapse into "no objection, go ahead" — which is how a refusal to link
becomes a merge, and how "there are several" becomes a fabricated third row.

`blocked` deserves care: it means a weak signal matched but a trusted field
contradicted it. Two companies do share one domain, and one mailbox does forward
for two people, so the right response is to create the new entity and *not* link
to the refused candidate. The exception is a refusal on **scope** rather than
identity — see `require_company_scope` below — where the candidate is the same
entity, merely outside the bounds the caller asked for.

Every non-matched outcome carries `candidates` — `CandidateRef` objects with
name, LinkedIn URL, landing URL and whether the row is a placeholder — so a
caller can render a choice or log a rejection without another query.

**The resolver never picks a winner.** Where several rows match a
non-discriminating key it narrows on evidence the claim carries (exact name,
location, LinkedIn identity) and returns `ambiguous` if that does not reach
one. Ranking on apex-URL, has-LinkedIn or newer `created_at` is not evidence
about which company a message came from, and guessing produces confident wrong
matches.

Identity precedence, strongest first — company: `company_linkedin_id`,
LinkedIn URL, exact normalized landing host, a registrable-domain fallback, then
name+location (proposed, never applied). Lead: LinkedIn URL,
`mini_profile_urn`, email, then name **within an already-resolved company**.
Generic and shared email domains (gmail.com, linktr.ee, …) never resolve a
company — and the blocklist is applied *after* the registrable-domain reduction
too, so `acme.medium.com` cannot reach every company under `medium.com`.

`LeadIdentityClaim.require_company_scope` bounds the answer by `company_id`
rather than merely giving it context. Leave it off for conversation ingestion:
an email is a per-person identity, and someone who has changed employer is still
the same person, so the answer should not be withheld. Turn it on when asking
"who is named N at company C" — without it the email strategy runs first, never
consults the company, and can return someone employed elsewhere.

`CompanyResolver(domain_policy=...)` picks how far the host strategy may reach:

- `"permissive"` (default) — *attribution*, e.g. filing a conversation under a
  company. A host match is accepted unless it contradicts a LinkedIn identity
  the claim already carries.
- `"strict"` — *linking*, e.g. CRM onboarding, where the answer creates a
  durable bidirectional link. If the claim carries a LinkedIn identity that
  matched nothing, resolution stops rather than falling back to the domain, and
  a host match is only accepted against a candidate with no LinkedIn identity
  of its own.

### Unknown companies never block

Resolution can miss; ingestion must not stop. Use the placement service when you
need to proceed regardless — email ingestion, imports, the conversation
processor:

```python
from simpl_core.services.dedup import CompanyPlacementService

placed = await CompanyPlacementService().resolve_or_placeholder(
    claim, session=session, source="email_ingestion", customer_id=customer_id
)
placed.kind        # "matched" | "placeholder" | "unresolved" | "escalated"
placed.company_id  # None for "unresolved" and "escalated"
```

`"escalated"` is the `ambiguous` path: several real rows match, so the claim is
most likely one of them and a placeholder would be a third. The claim is
recorded under its identity with the candidates attached, and nothing is
created. `identity_key` is unique and reused, so getting this wrong would pin
every future sighting of that identity to the fabricated row permanently.

Two tiers, decided by what the claim carried. **Company evidence present** (a
corporate domain, or a name) creates a real `sales.company` row with
`origin='placeholder'`, recorded in `sales.unresolved_company_claim` under a
unique `identity_key` — so ten thousand import rows from one domain reuse one
placeholder. **No company evidence** records the claim and fabricates nothing:
inventing a company on no evidence asserts something false and, having no key,
could never be enriched or merged away. Nothing blocks either way —
`user_lead_connection.company_id` is nullable and the `lead_claimed` trigger
never reads it.

`LeadPlacementService.resolve_or_placeholder` does the same for people, and the
`origin` it uses is the whole point: `queue_batch_trigger` returns early for any
lead with `origin='Dummy'`, so the old fallback — parking an unidentified person
on the company's dummy lead — produced a ULC that never fired a single outreach
trigger. A placeholder lead uses `origin='placeholder'` and is treated like any
other. Journeys still wait, because `trg_ulc_create_journey_run` needs both
`full_name` and `linkedin_url`; AI triggers fire immediately.

A placeholder lead is keyed on the email address (or a name inside a resolved
company), always carries a name — a nameless one would collide with
`unique_dummy_lead_per_company` — and records the address as a `lead_contact` so
the next sighting resolves to the same person.

`ConversationService.upsert_participants` is the live caller: an external
participant it cannot identify now gets a placeholder lead instead of being
parked on the company's dummy lead. Automated mailboxes
(`is_automated_address` — `noreply@`, `bounce@`, `mailer-daemon@`) are excluded
and stay `participant_type=2`; a placeholder exists so outreach can reach
somebody, and there is nobody behind a bounce address. Dummy leads are still
used for *company* pipeline placement
(`get_or_create_company_dummy_ulc`), which represents a company rather than a
person — that is a different job and is unchanged.

`get_or_create_lead` is the lower-level writer, and only creates against an
identity the database enforces (`linkedin_url`, `mini_profile_urn`). An email or
a name can *find* a lead but is not safe to invent one from directly; that is
what the placement service's ledger exists for.

`PlaceholderReconciler` closes the loop: once enrichment writes identity onto a
placeholder, the next pass resolves it to the real company and merges it away,
retiring the `identity_key`. Placeholders are meant to liquidate, not accumulate.
A claim with no entity — tier 2, or an escalated one — is retried from its
recorded payload, so an `ambiguous` verdict settles itself once the duplicates
behind it merge. Each row is handled inside its own savepoint, and the queue
leases with `FOR UPDATE SKIP LOCKED`, stamping every row it hands back so a pass
always advances past claims that cannot resolve yet.

Retiring the claim is the **merge's** job, not the caller's. Any caller can
merge a placeholder away — `simpl_flow`'s LinkedIn enricher does — and one that
forgets leaves a row whose entity the foreign key nulls while
`resolution_state` stays `pending`: a claim with nothing to merge and nothing to
resolve, sitting at the front of the queue forever. `MergeResult.claims_retired`
reports how many were repointed.

`CompanyMergeService` / `LeadMergeService` fold a duplicate into a survivor:
nullable fields are backfilled, every known reference is repointed, colliding
rows are dropped, and the source is deleted only after a sweep proves nothing
*registered* still references it. The sweep iterates the hand-maintained
registry, not the FK catalogue, so a table missing from the list is invisible to
it; `tests/test_dedup_merge_completeness.py` checks the registries against
`pg_constraint` to keep that drift detectable. `MergeResult.skipped_tables`
lists reference tables absent from the current database — check it, because a
skipped table is also skipped by the safety sweep.

A merge runs in its own savepoint and is all-or-nothing: it blanks the source's
uniquely-indexed identity columns and flushes *before* repointing references, so
a failure partway through must not leave the source stripped. A company merge
never deletes the surplus dummy lead either — it folds it through
`LeadMergeService`, because `user_lead_connection` cascades from `sales.lead`
and `conversation_participant.participant_id` is polymorphic with no FK at all,
so a plain delete destroys connections and orphans participants, silently.

Lead merges preserve customer scope: `sales.lead_contact` rows keep their
`scope` and `user_id`, are never promoted from `user` to `global`, and are
deduplicated only within a single scope and owner. One customer's privately
sourced contact details never become visible to another.

## CRM sync scopes

A `crm_export_config` row is a *scope*. It is born in `dry_run` mode, and the
scheduled `crm_sync` flow in `simpl_flow` never claims it in that mode:
`CrmExportConfigRepository.acquire_next_config` filters on `execution_mode =
'live'`, so neither the hourly run nor the manual backfill touches a scope that
has not been promoted. Everything before promotion is API-driven:

1. `CrmDryRunService.run` evaluates the scope and stores an immutable plan in
   `integration.crm_dry_run_report`, without mutating the CRM or Simpl state.
2. `CrmDryRunService.apply` performs that plan once, through
   `ReconciliationService.run_scope_sequence` — the same sequence the scheduled
   flow runs for a live scope — over the window the report was evaluated with,
   then stamps the report (`applied_at`, `applied_by`, `applied_summary`). The
   scope stays `dry_run`; the customer verifies the writes in their CRM.
3. Promotion (in `simpl_api`) flips `execution_mode` to `live` only when the
   *latest* report is applied. A re-run after a mapping change therefore has
   to be applied and verified again before it can go live.

`apply` takes the scope lock through `CrmExportConfigRepository.claim_config`,
the only lock path that ignores execution mode, and releases it whether the
sequence succeeds or fails. It raises `CrmDryRunNotFoundError` for an unknown
scope or report and `CrmDryRunConflictError` for a live scope, an
already-applied report, a disabled scope, a scope with no workflow or pipeline,
or a scope whose lock is held — the same preconditions the scheduler's claim
query imposes, so applying never performs writes promotion would not. A report
is applied at most once; a fresh plan needs a fresh dry run.

## Transient database failures

Supabase's Supavisor pooler occasionally drops a connection handshake under
load. asyncpg surfaces it as a bare `TimeoutError` (the pooler logs
`ClientHandler: Timeout while waiting for message in state SCRAM final`), and
SQLAlchemy may re-raise it wrapped in a `DBAPIError`. The database is healthy,
so the same operation succeeds seconds later.

```python
from simpl_core.db.retry import is_retryable_db_error, run_with_db_retry

result = await run_with_db_retry(
    partial(repo.get_by_id, lead_id),
    attempts=4,
    label="email_sync.resolve_lead",
)
```

- `run_with_db_retry` re-awaits the factory from the start, so only wrap work
  that is safe to run twice.
- Retries are always bounded. Pair them with an outer scheduling guarantee (a
  Prefect schedule, a released claim) rather than raising `attempts`.
- `is_retryable_db_error` unwraps `DBAPIError.orig` and `__cause__`; use it when
  a caller needs to branch on transient-vs-permanent instead of retrying.
- `is_pool_exhaustion` is the narrower verdict: *our own* `QueuePool` refused a
  checkout (`sqlalchemy.exc.TimeoutError`), rather than anything the database or
  the pooler did. A direct-mode signal only — under Supavisor the engine runs on
  `NullPool`, which has no queue to time out on.
- Both classify; neither decides. `run_with_db_retry` retries pool exhaustion
  under its multi-second backoff, which suits coarse-grained work. Filter it back
  off with `is_pool_exhaustion` when your caller cannot afford the wait: when the
  retry is fine-grained enough that replaying it is itself load on the saturated
  pool, or when the caller holds a deadline (a renewable lease, a request budget)
  it can lose while queueing. `simpl_core.agent_framework.retry` does exactly
  that.
- `simpl_core.sales_domain.db_retry` is a back-compat alias for this module.

## Scraping contracts, object storage and operator notifications

Three small public surfaces back `simpl_scraping`; any consumer may read them.

### Scraping contracts

`simpl_core.models.scraping` and `simpl_core.repositories.scraping`, schema in
`migrations/20260911_scraping_page_contracts.sql` and
`migrations/20260915_scraping_page_deletion.sql`:

- `ScrapingPage` (`scraping.pages`): one row per `(canonical_url, representation)`.
  `latest_version_id` names the newest observed raw response.
- `ScrapingPageVersion` (`scraping.page_versions`): immutable. It stores a reference to
  the object holding the response (bucket, key, version id, stored SHA-256 and size),
  never the body. The database rejects UPDATE.
- `ScrapingExtractionPublication` (`scraping.extraction_publications`): one receipt per
  extraction job.
- `ScrapingExtractedEntity` (`scraping.extracted_entities`): the latest validated state
  per `(entity_type, entity_key)`. That pair is the unique key `data_consumer` sinks
  name in `conflict_on`, and `source_observed_at` is the column for an `update_where`
  guard.

The repositories take an `AsyncSession` and never commit, so a caller can record an
observation inside its own transaction:

```python
async with db.session_scope() as session:
    pages = ScrapingPageRepository(session)
    page_id = await pages.ensure_page(canonical_url=url, host=host)
    observation = await pages.record_observation(page_id=page_id, version=new_version)
    await session.commit()
```

Identical content reuses the existing version. The latest pointer only moves forward
in `observed_at` order, so a late commit of an older fetch cannot roll a page back.

Pages and versions may be deleted. Deleting a page deletes its versions; deleting the
version `latest_version_id` names moves the pointer to the newest remaining raw
response, or clears it. A receipt's `page_version_id` and an entity's
`source_page_version_id` read `None` once their version is gone. Stored objects are
not deleted with the rows.

`simpl_scraping`'s queue schema depends on these migrations being applied first.

### Object storage

`simpl_core.object_storage` talks to S3-compatible storage (Wasabi, AWS S3, MinIO) over
`httpx` with SigV4 signing and no SDK dependency. Every write sends its real payload
SHA-256 so the server verifies it. Every read verifies a digest from the `ObjectRef`,
an explicit value, or the object's stored `sha256` metadata.

```python
config = ObjectStorageConfig.from_env()
async with S3ObjectStore(config) as store:
    ref = await store.put_bytes(key, gzipped, content_type="text/html", content_encoding="gzip")
    body = await store.get_bytes(ref)
```

`from_env` reads `OBJECT_STORAGE_ENDPOINT_URL`, `OBJECT_STORAGE_REGION`,
`OBJECT_STORAGE_BUCKET`, `OBJECT_STORAGE_ACCESS_KEY_ID`,
`OBJECT_STORAGE_SECRET_ACCESS_KEY` and optional `OBJECT_STORAGE_ADDRESSING_STYLE`.
Persist the reference's fields, never a signed URL. A missing object raises
`ObjectNotFoundError` and a corrupt one `ObjectChecksumMismatchError`; neither comes
back as empty content. Keys with `.` or `..` segments are rejected.

### Operator notifications

`simpl_core.observability.TrackerOperatorNotifier` delivers `OperatorEvent`s to
dedicated Discord webhook URLs through tracker (>= 0.5.0 reads URLs, not webhook
blocks) and returns whether delivery succeeded, which an outbox needs before marking
an incident delivered. Context passes `redact_context` first, and the event's
`dedup_key` is tracker's fingerprint. `register_config_fallback_notifier` routes
agent-framework config fallback to operators, and `unavailable_prefect_blocks` checks
tracker JSON config blocks at startup without sending anything. Importing the module loads neither tracker, Prefect nor the agent framework.

## Sales Domain approval queue

`customer_brain.sales_domain_pending_action` holds what the Sales Domain agent proposes when HITL is on. A proposal is only good for `PENDING_ACTION_MAX_AGE_DAYS` (4) and only while it still applies to live data; `simpl_core.sales_domain.pending_action_freshness.check_pending_action_freshness` decides the second (prompt patches still land and are not already in the prompt, drafts still `PENDING_APPROVAL`, ICP filter/description not already changed or edited since, seller still active).

- `SalesDomainPendingActionService.refresh_pending()` expires old rows and withdraws the ones that no longer apply (`status = 'rejected'`, `rejection_reason` `expired: …` / `stale: …`, `decided_by` NULL). Hosts call it on their scheduled sweep; `has_open_pending` and the daily review snapshot call it themselves, so a stale row never holds a wake.
- `SalesDomainPendingActionExecutor.approve_and_execute` re-checks first. A row that no longer applies is withdrawn and `StalePendingActionError` (a `ValueError`) is raised with an operator-readable message; nothing executes. When only some drafts are still waiting, it executes on those and records the narrowed payload. `claim_for_approval` refuses rows past the age cap whichever path calls it.
- A deferred `icp_description_update` / `icp_filter_update` (`wish_list`) stores `previous_description` / `previous_wish_list`, the value it was written against, so approval never overwrites a newer edit.

## Common pitfalls

- Do not duplicate autopilot, CRM, email, or report logic in app repos before checking whether `simpl_core` already owns it.
- Do not retry a database failure without classifying it first: retrying a constraint violation or a bad query burns the backoff budget and fails identically.
- Do not add optional provider SDK usage without guarding it behind the relevant extra or import boundary.
- Do not run tests with global Python. Activate `conda activate simpl_core`, then use `poetry run ...`.

## Testing

```bash
conda activate simpl_core
poetry install
poetry run pytest
poetry run ruff check .
```

The DB-backed tests need Docker running (an ephemeral Postgres via testcontainers)
and a `psql` client on `PATH` (the schema is applied with `psql`). On macOS,
`export PATH="/opt/homebrew/opt/libpq/bin:$PATH"` before running the suite.

## Agent memory

Agents opt into memory with a `memory:` policy on the agent definition. An agent with
no `memory:` block makes zero memory calls and needs none of what follows.

**Dependency and migration.** `simpl_core[agent-framework]` now pulls `simpl_memory`.
Apply `migrations/20260719_agent_framework_memory_run_level_ops.sql` before any agent
opts into `anticipate` or `observe`: it widens the `memory_runs.op` CHECK to admit
`anticipate` / `prefetch` / `interject`, and without it those writes are rejected.

**Memory belongs to `llm_agent`.** A `memory:` block on a `deterministic` agent is
rejected at validation — a code producer has no context window to enrich and can
hold no tools, so every layer would be inert.

**Every memory capability comes from policy.** An agent never names a memory tool in
`available_tools` — the loader rejects it. `write.mode: hot_path` offers `memory_save`,
`recall.when: on_demand` offers `memory_recall`, and `observe` injects the watcher's
`reasoning_checkpoint`. The framework stages that effective set on
`ResolverContext.producer_tools`; a consumer building its own producer must bind *that*
rather than `definition.available_tools`, or injected tools never reach the model. The
bundled `LLMAgent` already does.

**Delivery is `project_into`, and only `project_into`.** A recalled block reaches a
producer by being written onto the `ai_context` object your resolver-context factory
supplies, at the leaf the policy names. The ephemeral surface is an audit mirror, not a
delivery channel. So the target must exist and must accept that attribute — a
`@dataclass(slots=True)` context without the declared leaf cannot receive it. Both
failure modes are logged (`memory_projection_no_target`, `memory_projection_failed`) and
neither fails the node, because the recall succeeded and only the handoff broke.

**Projection paths must not nest.** The reflex writes a string at its
`retrieve.project_into`; anticipation writes a namespace at its `anticipate.project_into`
(default `ai_context.memory_brief`). If one is nested under the other, the layer that
writes second overwrites the first. The boot gate reports this.

**A background write may produce several memories.** `write.mode: background` runs the
agent named in `write.agent` after a passing produce and ingests what it returns. Its
verdict evidence may carry a list under `BACKGROUND_WRITE_MEMORIES_KEY` (`"memories"`),
and each item is written separately — one provider call and one `memory_runs` row each,
because a memory is the unit the store dedups, supersedes and recalls. Evidence without
that key is ingested whole, as one memory.

**The framework runs the extractor; the host does not.** The agent named in
`write.agent` is resolved off the walk's own Loader and run through the framework's one
agent executor, so it is pinned to the run's config version and audited like any other
agent. The host owes only an LLM transport (`llm_client` / `llm_client_resolver` on the
coordinator) — there is no `background_write_spec_for` callback any more, and a host
that supplies no transport gets a logged, isolated failure rather than a silent no-op.

**The extractor's per-memory contract is `ExtractedMemory`** (exported from
`simpl_core.agent_framework`): `text` (required), `kind`, `tags`, `scope_level`,
`confidence`. It **forbids** unexpected fields — a returned item carrying one is
rejected on its own, logged, and counted into the verdict evidence under
`"rejected_memories"`; the other items still write. An item with no `scope_level`
is written at `user`. Ask the model for a field, and add it here in the same change:
the whole point of the typed contract is that the two cannot drift silently.

Keep the extractor's job to *what is worth remembering*. Do not ask it for entities,
relations, or supersession decisions: an agent writes memory for its own use, and
`simpl_memory` resolves concepts from the entry body at index time and arbitrates
supersession in its own dreaming pipeline. Structure hand-built by an extractor
duplicates that work and ages badly.

**Anticipation is per agent.** `anticipate.when: agent_start` fires once for each agent
that declares it, before its first turn — not once per run, and not per rewrite
iteration. The watcher's two-call fallback still needs a `watcher_telemetry_for` hook
supplying `thinking_tokens`; without it only the in-arc path runs.

**Failure posture.** `retrieve` failures propagate and fail the node — a declared
recall is a required input. Everything else (anticipation, the watcher, the ledger)
is best-effort: it logs and the run proceeds. When testing, use
`simpl_core.agent_framework.testing.strict_run`, which turns those swallowed
failures into test failures.

## What this library does NOT do

- Does not expose the HTTP API. That is `simpl_api`.
- Does not schedule or deploy Prefect workflows. That is `simpl_flow`.
- Does not own generic ORM primitives. That is `simpl_orm`.
- Does not own tracking/logging helpers. That is `simpl_tracker`.

## Where to go next

- Source: `https://github.com/simpl-techs/simpl_core`
- Internal conventions: `.agent/INTERNAL.md`
