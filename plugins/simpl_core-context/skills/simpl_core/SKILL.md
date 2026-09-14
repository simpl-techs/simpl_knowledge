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
