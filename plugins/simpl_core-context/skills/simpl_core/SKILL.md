---
name: simpl_core
description: |
  Use this skill whenever the user asks about shared simpl platform domain logic, autopilot services, CRM/email/reports services, Reply Confidence data (the settings table, the authorization resolver and its SQL functions, return to review, the recall, the send-time check, the queued-reply counts, the what-if of a settings change), or code that imports `simpl_core`. ALWAYS consult this skill before adding duplicated business logic in app repos that could belong in `simpl_core`.
---

# simpl_core integration guide

> **Maintained by**: the `simpl_core` repo, auto-synced to simpl_knowledge.
> **Source of truth**: `simpl-techs/simpl_core/.agent/SKILL.md`

Payment frequency is separate from cost allocation: `payment_frequency` is `one_time`, `monthly`, `annual`, or null (unknown). Vendor assignments and manual expense batches persist it; classification carries it to the ledger and preserves manual decisions. It does not generate future transactions or require an end date. Existing decisions remain null; `covers_months` is never interpreted as cadence. Apply the additive `roi_payment_frequency` migration before deploying the updated Core/API.

Google Play descriptors resolve to `google play` before bank references are stripped; Google Cloud descriptors, with or without a star, resolve to `google cloud`. Play and unidentified Google charges are proposed for purchase-by-purchase review. Do not infer an app or payment frequency from the amount.

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
poetry add "simpl-core[mailbox] @ git+https://github.com/simpl-techs/simpl_core.git@main"
```

The `mailbox` extra (aioimaplib, aiosmtplib, google-cloud-kms, dnspython) is what an `imap` email connection needs at runtime; see "Email on other providers (IMAP/SMTP)". Nothing imports it at `import simpl_core.services.email`.

Base `simpl-core` installs `simpl-ia` (same pin as other platform repos) so `import simpl_ia` works in the venv. The `agent-framework` extra adds `simpl-ia[agents]` (pydantic-ai, Langfuse) for `simpl_core.agent_framework` and `simpl_ia.agents`; that submodule is not imported at `import simpl_core`.

## Basic usage

```python
from simpl_core.services.autopilot.engine import AutopilotEngine
from simpl_core.services.autopilot.eligibility_service import EligibilityService
from simpl_core.roi import (
    calculate_company_cost,
    build_people_costs_from_payroll,
    resolve_canonical,
)
```

`roi.people_costs` is rebuilt from PAYROLL bank lines via `build_people_costs_from_payroll`: a wage is filed in the month it pays for (`RETRIBUZIONE MESE LUGLIO 2026`) and F24 on Revolut is dropped. A wage is recognised by its beneficiary whether the statement names it (`IACOPO MODICA`) or the Revolut API sync does (`To IACOPO MODICA`); the roster says whose each name is (`PayrollPerson.bank_names`, from `roi.people.bank_names`, read through `WageNames.from_roster`), and a named benefit top-up (`Ricarica Fringe Mia`) is matched on the roster's bank names and person names too. The built-in lists in `payroll.py` only cover the people hired before the roster carried their names and a roster name wins over them, so a new hire's first wage needs a roster row, not a release. `plan_classification` sends every F24 delegation (`is_tax_delegation`) to PAYROLL whatever its vendor decision, so the withholdings and contributions it pays are never counted as spend on top of the reconstructed people cost. For an employee with RAL on the roster, a month that carries a wage costs the gross (RAL / 12) plus employer INPS/INAIL/TFR (`monthly_payroll_cost`), not the net paid: the withholdings leave through F24 on an account we do not ingest. The net only says which months were paid. `PayrollPerson.start` prorates the first month by day, and `inps_relief_monthly` / `inps_relief_months` waive employer INPS for a hiring incentive. From the month of `PayrollPerson.gestione_separata_from` (from `roi.people.gestione_separata_from`; a month counts when its first day is on or after that date, `PayrollPerson.in_gestione_separata(month)`), a director paid through INPS Gestione Separata costs the gross plus the company's two thirds of the Gestione Separata rate (`NORME_2026["aliquota_gestione_separata"]`, 33.72% for 2025-26, to be confirmed by the payroll consultant), with no INAIL, no TFR and no hiring relief: `monthly_payroll_cost(..., gestione_separata=True)`. Benefits (Evinrude, Coverflex) are the amounts actually paid, employees only; an unnamed benefit is shared only among the employees already on the payroll that month (from `PayrollPerson.start`, else the first wage), so a hire carries no cost before their first month; a welfare top-up is spread evenly over the months of its calendar year the person was on the payroll (a mixed "buoni pasto e welfare" line stays in its month). Contractors cost their invoices, one a month whenever they were paid (`contractor_invoice_months`): an invoice is for the month it was paid in unless that month already has a later invoice (by the contractor's own numbering, `34/2025` in the reference); then it is for the nearest earlier month left without one. So the latest invoice paid in a month is that month's, and older ones paid alongside it fill the months before. `calculate_company_cost` stays the business-plan RAL calculator and does not write the ledger. `roi.retro` is the quarter calendar of the one-shot backfill (`quarters_between`, `mondays_between`); who owes it, and from when, is decided by simpl_api from `roi.people_costs` and `roi.time_weeks` (paid months before the weekly survey with no hours), not from a list of names. `roi.people.retro_completed_at` hides it once saved.

ROI catalog `kind` is `line` (standing) or `project` (time-boxed). `awaiting_review` rows are visible to `created_by` and to anyone with `time_weeks` on that row, until publish/merge/reject. Merge (`recategorize`) remaps every person's time onto a live destination — published or another awaiting proposal (`merged_into`). Close applies to projects (`closed_on`). A proposal carries the proposer's words in `proposal_note`, and `publish` / `recategorize` / `close` stamp `decided_by` and `decided_at` when the caller passes the actor. A project takes its `category`, `lag_profile`, `roi_ranked` and `sort_order` from its line through `catalog.child_defaults(parent, ...)` — never derive them again in a consumer, or a project published under a different line keeps the category of the line it was proposed under. `remap_person_weeks` moves every hour onto the destination; `split_person_weeks(rows, source_id=..., shares=[(dest, pct), ...])` is the same move split across several destinations for one person, and refuses shares that do not add up to 100. `TimeWeekRepository.people_on(initiative_id)` says who filed time on a row, which is what an admin needs before deciding where it goes.

Ledger target: a `roi.attribution_ledger` row names either an `initiative_id` or a `person`, never both (database check). `append_person_split(records, subject_id, people, source)` splits an expense evenly over people. In `build_dataset`, each person's share follows that person's survey hours in the expense's month, as vendor cost on those lines, the same way their wage is spread. A share whose person filed no hours that month follows their nearest month with hours (the earlier one on a tie), still booked in its own month; only a person who never filed hours keeps it in `RoiDataset.undistributed[person]`, so it stays visible.

Month by month: `InitiativeSnapshot.monthly` (`YYYY-MM` → cost) carries people and vendors together, `monthly_people` the people part, and `monthly_vendor(month)` the rest. What no line carries is kept per month on `RoiDataset`: `people_without_hours` (wages of people who filed no hours, or less than 100%), `undistributed_by_month` (seats whose person never filed hours) and `untagged_by_month` (bank lines with no attribution). For any month, the non-transit lines' `monthly` plus those three and `deferred_by_month` add up to that month's `roi.people_costs` plus its non-transit spend; transit rows (`PAYROLL`, `NON-SPESA`) are not cost.

Spread payments: `roi.attribution_ledger.covers_months` (whole batch, default 1) says how many months a line's euro covers from its booking month; a vendor assignment's `covers_months` is copied onto the lines the classifier writes (trip lines stay 1). `build_dataset(..., as_of=date)` puts `amount / covers_months` in each covered month up to `as_of`'s month (today by default), on lines or on seats that then follow that month's hours. `RoiDataset.deferred_by_month` is cash minus what the lines carry (the rest of the payment in its month, minus each later month's share) and `deferred_after` is what falls after the last month shown. Only `line`, `people` and `payer` spend spreads (`vendors.SPREAD_MODES`), 1 to `MAX_COVERS_MONTHS` (60) months; `require_valid_spread` is the shared check.

Classification (`simpl_core.roi.classify.plan_classification`) turns vendor and trip decisions into ledger targets, one bank line at a time:

- A line in a trip goes where the trip goes.
- Otherwise the vendor assignment in force on the line's day decides. `line` goes to its initiative; `people` is split evenly over people; `payer` goes to the card holder; `payroll` goes to `PAYROLL`; `excluded` goes to the transit row `NOT_SPEND_ID` (`NON-SPESA`).
- `each` (a shop bought from for many reasons, like Amazon) decides nothing for the vendor: each line waits for a person to decide it (a `manuale` batch) and is `unchanged` once they have. `targets_for(mode, initiative_id=, people=, payer=, roster=)` is the one mapping from a decision to ledger targets, for a vendor and for a single line (`LINE_MODES`: line, people, payer, excluded).
- Lines no decision reaches are returned in `pending`, keyed by reason: vendor still to classify, trip-mode vendor outside any trip, a line-by-line vendor's line nobody decided, or payer not on the roster.
- A line attributed by hand is `protected`. A line whose ledger already agrees is `unchanged`.

`append_targets` writes a batch that mixes initiative and person shares. The old pattern rules (`tagging.plan_tagging`) are no longer used by the API.

Trips (`simpl_core.roi.trips`): `plan_trips(lines, known, decided)` groups travel spend by card MCC. A trip needs an anchor: airline or hotel ranges 3000-3999, Airbnb or travel agency 4722, hotel 7011, train 4112, coach 4131 or 4511. Taxis, meals, tolls, fuel and parking only join a trip on its dates. Lines chain while consecutive ones are at most 2 days apart. Lines already placed, and lines someone took out of a trip (`roi.trip_lines.trip_id` null), are never regrouped. New lines falling on a known trip's dates join it. New trips go to `DEFAULT_TRIP_INITIATIVE` (INI-60 Team e retreat) until someone decides otherwise.

Trip spend by category: `trip_category(mcc, vendor)` says what a trip line paid for, one of `TRIP_CATEGORIES` (`flights`, `rail_coach`, `lodging`, `meals`, `groceries`, `car`, `local_transport`, `unclear`). It reads the MCC; for a travel agency (4722) it reads the canonical vendor key instead (Airbnb, Booking or hotel → lodging, Kiwi → flights). An unknown agency or a line with no code is `unclear`. A hand correction is stored in `roi.trip_lines.category` (`TripLineRepository.set_category`, None clears it; `chosen_categories()` lists them) and beats the code. `TripRepository.merge(trip_id, into=...)` folds a trip into another: its lines move, the target's dates widen to cover both, the target keeps its name and decision, and the source row is deleted. That is how a booking paid weeks ahead rejoins its journey. `TripRepository.move_line(transaction_id, from_trip=..., into=...)` moves a single line instead: it keeps its category, both trips' dates are reset to their first and last line, and the trip left with no lines is deleted. Lines that change initiative either way reach the ledger on the next apply.

Revolut statement (`simpl_core.roi.revolut.parse_statement`): reads the Revolut Business CSV into `StatementLine`s with the shape `roi.transactions` already holds. The description is `Description · Reference` (the reference is how payroll dates a wage). The counterpart is the transfer beneficiary, or the description when there is none. The amount is spend, positive with the fee included; card and fee refunds come out negative. Top-ups, incoming transfers, movements that are not completed and non-EUR rows are left out and counted by reason in `skipped`. Transfers to our own other account are imported: the vendor catalog marks them `excluded`. `TransactionRepository.upsert_many` is one bulk upsert by id and answers how many lines were new.

ROI vendor catalog (`simpl_core.roi.vendors`): `vendor_key` cleans a bank description into the merchant name. It drops booking and order codes (`Airbnb * Hm22p4qmkw`, `Google Cloud Lrw2jl`, `Ryanair224tz5g3g`), billing months and legal suffixes, and keeps what follows the star for payment processors (`Paypal *deepseek`, `Sumup *trattoria`). `roi.vendor_aliases` folds the other names a vendor shows up under (`canonical_vendor`). `roi.vendor_assignments` says where a vendor's spend goes from `valid_from` on, with `mode`:

- `line`: one initiative.
- `people`: split over those people's survey hours, so a seat follows whoever uses it.
- `trip`: decided per trip.
- `payer`: each charge follows the survey hours of the card holder who paid it (`payer_person` maps "Nicolo' Fugallo" to the roster name "Nicolò").
- `payroll`: people cost.
- `excluded`: not a cost.
- `split`: shared by several lines or projects. `shares` holds `(initiative_id, percent)` pairs adding up to 100 (any number of lines, `require_valid_shares`); `split_weights` turns them into ledger weights rounded to 4 decimals that add up to exactly 1 (the largest share takes the rounding), so the line's euro is spent once. `roi.vendor_assignments.shares` (jsonb, SQL NULL for other modes) stores them. It spreads over months like `line` and can be a line-by-line answer.

A change of use is a new assignment, never an edit of the past. A quiz answer is valid from `FROM_THE_START`. `roi.vendors.proposed_*` is the answer the quiz offers already selected, never a decision. `assignment_on(assignments, vendor, day)` picks the one in force. `require_valid_assignment` is the same rule the table's checks enforce. `roi.vendors.area` and `reviewer` only decide who is asked about a vendor. `first_triage(mccs)` guesses a new vendor's area from its merchant codes: all travel or meals means `travel` with the Team e retreat proposal, all software means `tech`, anything else `admin`. `VendorRepository.fold_into(key, into)` makes a duplicate an alias; its own aliases follow it. `roi.transactions` also keeps the Revolut `kind` and the card `payer`.

Vendor decisions (`simpl_core.roi.vendor_decisions`): the dashboard, the quiz and the finance agent decide vendors through one module, so the same checks hold for all of them (vendor known, destinations live per `is_live_destination`, people on the roster, `require_valid_assignment`). `decide_vendor(session, assignment, decided_by=, note=)` is a person's decision. It also reviews any open agent act on that vendor: `confermata` when it agrees, `cambiata` when it does not. `agent_decide_vendor(session, assignment, agent=, reason=)` decides only a vendor with no assignment at all. It writes `decided_by="agente:<role>"` and the reason as the note, and records a `roi.agent_actions` row in `da_rivedere`. `merge_vendor` / `agent_merge_vendor` fold an undecided duplicate the same way; the agent's act keeps the duplicate's row and aliases, so `undo_agent_merge(session, id, by=)` brings the vendor back undecided and marks the act `cambiata`. `simpl_core.roi.vendor_lines` (`lines_by_vendor`, `vendors_all_in_trips`) is the one grouping of bank lines by vendor that simpl_api's vendor pages and the finance agent share. `confirm_agent_action(session, id, by=)` confirms an act; a reviewed act cannot be reviewed again (`agent_actions.require_review`). Nothing here writes the ledger: simpl_api's classification turns decisions into attributions.

Spend tags (`simpl_core.roi.spend_tags`, `spend_tagging`, `spend_tag_repository`) never move a euro in the ROI. People define `roi.tag_groups`. A group is `exclusive` when a line carries at most one of its tags, so its totals add up to the spend once; a non-exclusive group is for search only. `roi.tags` belong to a group and are `attivo`, `archiviato` or `unito` (`merged_into`); `is_spend` false marks movements that are not spend (transfers to our own accounts), which spend reports leave out. A group holds at most `MAX_TAGS_PER_GROUP` active tags. `create_tag` refuses a key or a name that already exists in the group. `roi.transaction_tags` keeps one row per (line, tag), `attivo` or `rimosso`, with `source` `agente` or `manuale`, the reason and who decided. A partial unique index on `(transaction_id, exclusive_group)` over active rows enforces one tag per exclusive group. `tag_line` / `untag_line` lock the line and apply `plan_tag` / `plan_untag`. A person always has the last word: the agent never removes a person's tag, never puts back a tag a person removed, and never overrides a person's choice in an exclusive group. A refusal comes back as `TagOutcome.refused`, not as an error. `merge_tags` moves a tag's lines into another tag of the same group. `untagged_line_ids(session, group)` is the agent's queue.

Vendor labels (same modules): a label of a non-exclusive group can sit on a vendor (`roi.vendor_tags`, one row per (vendor, tag), `attivo`/`rimosso`, `agente`/`manuale`, same rules). Every line of the vendor (`vendor_lines.vendor_of`) carries it unless the line decided that label itself, on or off: `spend_tags.inherited_keys`. `tags_of_lines(session, lines)` answers each line's vendor key and `CarriedTag`s (`inherited` true for the vendor's), the one resolver the Spese API and `untagged_line_ids` read. `tag_vendor` refuses exclusive groups (one tag per line is decided line by line); `untag_line` on an inherited label leaves the line an exception (`rimosso`). A person putting back the agent's tag makes it theirs (`plan_tag`). A label never takes lines out of the spend (`require_spend_label`). `merge_tags` of labels moves vendors' labels and lines' exceptions; `VendorRepository.fold_into` moves a merged vendor's labels unless the target decided them. `roi.vendors.brand` (`set_vendor_brand`, `require_brand`) is the name the Spese page groups sibling vendors under (Anthropic API and Claude.ai are "Claude"); neither labels nor brand move a euro in the ROI. Requires API migration `20261020190000_spend_labels.sql`.

Product reconciliation (`simpl_core.roi.spend_scope.product_scope`): pass active tag keys mapped to group keys, `not_spend`, MCC and movement kind. Only explicit `perimetro` product API, compute or platform subscription tags yield `eligible` with a tracker kind. Missing/mixed use or contradictory company nature/MCC yields `review`; company and non-spend yield `excluded`. This never writes tracker costs or ROI allocations. The perimeter's six keys cannot be created, renamed, archived or merged via tagging commands. `tema_spesa` is the extensible exclusive operational-theme catalog; legacy `tema` is historical and cannot accept new tags. Requires API migration `20261014160000_expense_themes_and_product_scope.sql`; migration does not infer existing lines' use.

Personal spend on the company card (`simpl_core.roi.reimbursements`): `suspicion(counterpart=, mcc=, kind=, excluded=)` says why a line looks personal (clothes, health, beauty, streaming and games, jewellery, betting, pets, toys by MCC or shop name; or a card payment already sent to `NON-SPESA`), or None. A doctor is recognised by MCC only, because an accountant is "Dott." too. `roi.reimbursements` holds the owner's review of a line, `ReimbursementStatus`: `da_rimborsare` (personal, `person` owes it), `rimborsato` (with `repaid_on`) or `aziendale` (company spend after all, no person). `ReimbursementRepository.set_status` locks the row and enforces `require_transition` (a repaid line goes back to owed before it can become company spend) and `require_fields`. The ledger stays the single source of where the euro goes: a personal line's attribution is the transit row `REIMBURSE_ID` (`RIMBORSI`), out of the ROI like `NON-SPESA`, written only by the app's reimbursement command.

Prefer importing the specific service, repository, or model you need. Keep app-layer orchestration in the app repo and reusable domain behavior in `simpl_core`.


ROI product identity: pass the transaction's `mcc` to `canonical_vendor(..., mcc=...)`
in every reader and writer. ChatGPT descriptors keep their product name before
card references are stripped; generic OpenAI is API spend. Apple MCC 5732 means
hardware, 5817/5818 or an explicit `/bill` descriptor means digital services;
Apple without evidence stays separate for review. Never infer the product from
the amount. `first_triage(..., vendor=key)` supplies the matching proposal.
Category `asset` contains Hardware (Comuni / Assegnati) and Domini. Asset rows
receive spend and stay out of the time survey and ROI ranking; the existing
`covers_months` setting controls spreading, with no new automatic lifetime.

## Rules and conventions

- Put reusable platform business logic in `simpl_core`, not in `simpl_api` or `simpl_flow` copies.
- Survey weeks: `roi.time_weeks.pct` is the normalised split (a week adds up to 100) and is what the metrics read; `hours` is what the person typed, kept beside it (null on weeks saved as percentages). `TimeWeekRepository.replace_week(person, week, allocations, hours=...)` writes both; merges and splits (`remap_person` / `split_person`) move a week's typed hours with the shares, and leave them null when the week had none. `filled_weeks_by_person()` reads every person's filled weeks in one query; `weeks_of(person)` returns one person's rows, oldest first. `roi.people.email` links a roster row to its dashboard login; `PersonRepository.by_email(email)` finds it in any letter case and never returns a `_`-prefixed row.
- `SurveyTokenRepository.ensure(person)` mints a personal survey token and never rotates an existing one; `ensure_many(persons)` does the same for a list in one insert that ignores conflicts, so two callers racing on the same person cannot fail on the primary key. Both refuse the synthetic `_`-prefixed roster rows.
- `InitiativeRepository.next_id()` holds `pg_advisory_xact_lock` on the table: id minting is a `max()+1` read-then-write and the survey proposes from a public token endpoint.
- Keep database access behind repositories or services. Do not scatter raw SQL across consumers.
- Use `simpl_orm` for shared database patterns and `simpl_tracker` for tracking/logging integrations.
- Treat exported services, repositories, models, and schemas as shared API. Update this skill when changing their public behavior.
- A seller's active hours are `outreach_prefs.active_hours` = `{"start": "HH:MM", "stop": "HH:MM", "timezone": "<IANA name>"}`: local wall clock, start inclusive, stop exclusive, start before stop, and a missing field takes 07:00 / 19:00 / UTC. `simpl_core.utils.parse_active_hours(prefs)` returns the configured `ActiveHours` or `None` for unset or invalid, and the caller decides what `None` means. `BusinessHoursScheduler.for_outreach_prefs(prefs)` schedules inside that window (Monday to Friday) and falls back to the default 09:00-18:00 Europe/Rome. `TriggerSchedulerService` builds it per trigger user, and the Sales Domain wake gate holds wakes outside a configured window. A host that still calls `BusinessHoursScheduler()` for a seller's action ignores their hours: pass the seller's prefs instead. The rules copy `sales.resolve_active_hours` in simpl_api, which gates the extension task queue and the per-user email claim (fallback 07:00-19:00 UTC).

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

**A deterministic agent takes its settings from the policy.** A `deterministic`
row with an `implementation_class` may carry `params`; `load_producer` passes them
to the class as keyword arguments, so a policy can tune a threshold or a budget
without a release. The class owns the names and their defaults and must accept a
walk with none; a name it does not take fails the walk at load (`TypeError`), and
`params` on any other row is refused at parse. Rows without `params` hash as
before.

**A `data_producer` reads a table without code.** Its `read` names a `table`, the
`columns` to take and `where` clauses whose values are literals or resolved from the
run (`domain_inputs`, `producer_output`, `verdicts`); `cardinality` is `one` or `many`.
The table is one of the platform database's by default. With `source: row_store` it
is a table of the row store instead, named as the store names it
(`{dataset}__v{version}`), and the read returns its live rows:

```yaml
- kind: data_producer
  id: post_text
  read:
    source: row_store
    table: sales_posts__v2
    columns: [text, language]
    where:
      - column: key
        op: eq
        value: {resolver: domain_inputs, path: source_key}
  output_schema:
    text: {type: str, column: text}
    language: {type: "str | None", column: language}
```

A host that runs such a read needs the `row-store` extra and `ROW_STORE_URI`. The
live validation checks the columns and their declared types against the table in the
store, as it checks a database table. Writes (`data_consumer`) go to the database only.

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

Each target names the API its model speaks: `api: chat` (the default) for a
language model, `api: decisions` for a decision model on `openrouter` -- any model
OpenRouter serves on its decisions API, such as
`perplexity/pplx-decider-v1.1-27b-20261006`, keyed by the same `openrouter`
binding as chat. A chain may mix the two; one name may appear once per API.

```yaml
model:
  name: perplexity/pplx-decider-v1.1-27b-20261006
  provider: openrouter
  api: decisions
  provider_routing: {zdr: true}
  fallbacks:
    - name: z-ai/glm-5.3-flash
      provider: openrouter
```

Credentials are never authored in a policy document — the document names a
provider, the host binds it. `Loader.validate_boot()` checks every typed policy
against the resolver it will run on — the host's, or `default_llm_client_resolver()`
when the host passes none — and fails if a binding is missing.

**New versions declare typed policies only.** A new config version whose
`llm_agent` declares `model` as a bare string is refused where versions enter the
ledger: `af_config_migrate` and `ConfigVersionRepository.insert_version` both call
`validate_new_version(content)` and raise `BareModelNameError` (a
`ConfigAuthoringError` and a `ValueError`). A bare name leaves the provider to the
host, which guessed it from the name. Versions already stored are never re-checked:
a bare-name row still projects, loads and runs on the shared `llm_client`, so
nothing running today changes. A host that publishes versions should map
`BareModelNameError` to a 4xx.

A typed policy always resolves through `resolve_agent_llm_client`. When the host
passes no `llm_client_resolver`, `default_llm_client_resolver()` binds
`<PROVIDER>_API_KEY` and `<PROVIDER>_BASE_URL` from the environment for `OPENAI`,
`DEEPSEEK`, `OPENROUTER` and `CHEAPER_INFERENCE`, so a typed row works on a host
that predates typed policies. Sales Domain capability workers whose row is typed are
built with `client.make_agent(...)` from that client rather than from the host's
`model_factory` (which still serves bare-name rows);
`SalesDomainComposition(llm_client_resolver=...)` and
`build_node_coordinator(llm_client_resolver=...)` take a host resolver when there is
one. Their `agent_runs` rows name the target that answered — model, provider,
reasoning, fallback index — and the chain's attempts, as `LLMAgent`'s do.
`LLMAgent.last_api` is the answering target's API, and `execute_agent` puts it
beside `provider` in the execution's `audit` payload (`"api": "decisions"` for a
decision model's answer), so a caller can tell the two apart without reading model
names.
`answered_target(client, run_result, agent_id=...)` names the target that answered
a run built outside `LLMAgent`.

A `self_hosted` target is a server the caller runs (llama.cpp, vLLM): it names its
`base_url` (required there, refused on any other provider), needs no binding, and
writes no cost receipt. Any non-decision target may add `extra_body`, request fields
merged into every call it sends (a call's own fields win).

An `openai` target may set `prompt_cache: explicit`: on gpt-5.6 and later the call caches
its system prompt and nothing after it, so the rest of each request is billed as uncached
input instead of being written to the cache (simpl_ia's `PromptCacheMode`); on an older
OpenAI model it changes nothing. It is refused on any other provider, and on a policy it
covers the primary only. Leave it off an agent that calls tools: explicit mode stops
OpenAI caching the growing tool-call history.

An `llm_agent` may set `request_layout`, the messages a call sends in order, so content
that repeats across calls can sit early in the request and be cached on its own:

```yaml
request_layout:
  - {prompt: full}                    # system message: the whole prompt
  - {inputs: [context.customer_prompts_source, context.icp_prompts_source], cache: true}
  - {rest: true}                      # final user message: every input not sent yet
```

A `prompt` block sends `full`, or `core` and `fragments` as two system messages. An
`inputs` block sends one user message holding the values at its dotted paths, each at
its path; `cache: true` ends it with a cache breakpoint (at most three). The layout
opens with the core, places the prompt once, ends with `rest`, and no path repeats or
contains another. A block with nothing to send sends no message. Without a layout the
whole prompt is the system message and every input one user message, which is also what
`[{prompt: full}, {rest: true}]` sends. Only `rest` is subject to the client's
`AI_MAX_USER_PROMPT_CHARS` cap and its context-window truncation.

**`lm_model`: a self-hosted model asked with its family's own request.** For a model
that takes its task as request fields rather than a prompt (NuExtract reads its
template from `chat_template_kwargs`), an `lm_model` row names the request format and
the model; a call's inputs become that format's one fixed request. Called from code
nodes only, with `execute_agent`; never a pipeline node, validator, fixer or fallback
(`Loader.validate_boot` refuses that).

```yaml
- kind: agent_definition
  id: graphia_ner
  version: 1
  agent_kind: lm_model
  request_format: nuextract          # required
  max_tokens: 1024                   # required; a call may pass its own
  model:                             # every target self_hosted; fallbacks allowed
    name: nuextract3
    provider: self_hosted
    base_url: http://127.0.0.1:8092/v1
    http_timeout_seconds: 1800       # the bound on each request
  audit_sample_rate: 0.01
```

An `lm_model` row refuses `prompt_id`, `output_schema`, `output_constraints`, tools,
`memory`, `timeout_seconds` (each request's bound is the target's
`http_timeout_seconds`), `stream_timeout_seconds` and the node-only fields
(`implementation_class`, `default_context_projection_id`, `default_fix_strategy`,
`cache_policy`, `global_validators_exclude`, `on_failure`); its targets refuse
`reasoning` and `max_invalid_responses`.

```python
from simpl_core.agent_framework import execute_agent

execution = await execute_agent(
    loader=loader, agent_id="graphia_ner", role="producer",
    inputs={"text": document, "template": template_json_text, "instructions": text},
)
if execution.lm_failure is None:
    found = execution.output          # the checked JSON object
else:
    kind = execution.lm_failure.kind  # unreachable | no_answer | not_json | cut | off_template
```

`nuextract` sends the text as the only (user) message, `max_tokens` (the call's, else
the row's), `temperature: 0`, and `chat_template_kwargs` with `template`,
`instructions` and `enable_thinking: false`; no `response_format`. The model's text
never reaches the caller: `output` is the JSON object (a Markdown fence around it
accepted; every key a template key, missing keys allowed, so `{}` is valid; a key the
model names more than once with lists has those lists joined in answer order, any
other repeat keeps its last value), or
`lm_failure` (`LMModelFailure`) says why there is none: `unreachable` (no attempt
reached a server: it is down, stop), `no_answer` (a server was reached and no target
answered: an error status, a timeout, a body with no answer), `cut` (`finish_reason`
`length`, checked before reading),
`not_json` (an empty answer included), `off_template` (`extra_keys`). Every failure
carries the call's attempt trail (`attempts`, simpl_ia's, each with its `failure`),
also written to the audit row. Inputs the
format does not take raise `ValueError` before any request. `read_answer(text,
answer_keys=...)` is the same check, for an answer kept from an earlier call.

Each call writes its own `agent_runs` row, in `execute_agent` on the Loader's
database: a failed call always; an answered one when `audit_sample_rate` draws it in
(once per call, keyed on its id), also inside a pipeline with `audit: false`. A row
with no rate follows the run, as an `llm_agent` does: every call in an audited run,
failures only in one that opted out; `audit: false` on the row, failures only. A
cancelled call writes no row, since a cancellation is not an error; its attempt trail
(the request in flight closed as `cancelled`) is logged. No token receipt. Tests pass
`completion_client_for=lambda policy: CompletionClient(policy, retry_pause_seconds=0,
transport=httpx.MockTransport(handler))`.

**A producer's output keeps the confidence its model answered with.** A decision
model (`api: decisions`, such as TypeSafe's Jev) answers each field of the output
type with a probability, which pydantic-ai puts in the response's
`provider_details`. `LLMAgent` adds it to the producer's output as `_confidence`
(`MODEL_CONFIDENCE_KEY`): `fields`, each field's confidence from 0 (undecided) to 1,
and `probabilities`, each pick-one field's full distribution. A language model
reports none, so an answer from a fallback behind a decision model has no
`_confidence`. The key is on the `agent_runs` output and
on the run surface as `<node>._confidence`. An edge routes on it directly with a
dotted key — `{key: <node>._confidence.probabilities.seller.owner, op: gt, value: 0.1}`,
or `{key: <node>._confidence, op: is_null}` for a fallback's answer — and a
`producer_output` path read from an `llm_agent` may start with `_confidence`.

**A `when` key may be a dotted path into nested values.** A key that is itself a
resolved input (or run-surface key) is read directly, and always wins. Any other
key is read through its longest dotted prefix that is one, walking the remaining
segments into nested dicts; a missing segment, or a segment applied to a
non-dict, reads as null, so `is_null` matches and every numeric operator does
not. `gte_key` and `not_member` resolve the key they name the same way. `lt` and
`gt` are the strict numeric comparisons beside `lte` and `gte`, with the same
contract: a missing or non-numeric operand on either side never matches.
`output_constraints` accept a dotted key that walks through declared `object`
fields, or into a `dict` field.

**A failed producer call says what kind of failure it was.**
`AgentExecution.require_output()` raises `ProducerCallFailed`, a `RuntimeError`
with the message it always had (so `except RuntimeError` and rescue chains keyed
on the text are unaffected), carrying `agent_id`, `failure`, the call's live
attempt trail and `kind`, from `classify_producer_failure`: `thread` (every
answer was unusable), `rejected` (the provider refused the request: 400, 413,
422), `infrastructure` (5xx, 429, 408, 401, 403, 404, a transport error, a
deadline, a cancelled attempt, the call ceiling) or `unclassified` (attempts
that disagree, an empty trail, anything unknown). It is code, not a model: each
attempt is read by its recorded outcome, its exact error class and, for an HTTP
error, the `status_code: NNN,` prefix of its message, and the call is a kind
only when every attempt is. A caller that retries work decides what to charge
from it, so an outage does not use up retries meant for bad input.

Tests use `FixedClientResolver` or `OfflineModelResolver` from
`simpl_core.agent_framework.testing`. `OfflineModelResolver(model_for=...)` builds
each agent on the real policy client (`OfflineModelClient`), with every chain member
answering offline under its target's profile and provider name; `model_for(definition,
target)` scripts a member, e.g. a primary that raises `ModelAPIError`. Both refuse a
definition without a typed policy.

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
- A route handler reads only what it declares in `requires`. Dispatch it with
  `await RouteHandlerRegistry.context_for(route, resolver_context)`, which resolves
  those inputs into `ctx.resolved` under the key a routing rule's `when` uses (the
  path's leaf). A `RouteHandlerContext` built by hand carries none of them, and the
  routing engine does not pass the matched rule's inputs on. A declared input that
  cannot be resolved raises `RouteHandlerInputError` and the handler does not run,
  so the resolver context must hold what the routing node's context held.
- A policy change needs a **new** ledger version. Editing a projected version's
  content in place and re-running a seed migration are both silent no-ops.
- Routing must be total: every routing position needs an unconditional catch-all,
  or startup fails.
- A producer routes on its verdict's `final_output`: the answer its fix loop kept, or
  the best candidate an exhausted cap surfaces, never a first answer a validator
  rejected. The engine keeps the caller's `ResolverContext.producer_output` on that
  same output.

### Turning the audit off

`audit: false` on a `pipeline` or an `agent_definition` stops the audit rows for
work nobody reads back, such as a context stage that loads the same tables on every
walk. It is declared in the ledger like any other field, so it takes a new version.

- A pipeline that opts out writes no `node_runs`, `agent_runs`, `tool_call_runs`,
  `validation_runs`, `memory_runs` or `pipeline_run_steps` for anything it runs.
  The subgraph or fan-out node that runs it from an audited parent keeps its own
  node run.
- An agent that opts out writes nothing under the node that runs it. That node's
  own run stays, because it is the pipeline's record. Called from another node (a
  fan-out branch, a join, a validator), it loses its `agent_runs` row and nothing
  else.
- Nothing inside an unaudited run can turn audit back on.
- `audit_sample_rate` (`0` to `1`, not beside `audit: false`) audits that share of
  the runs; the rest behave as `audit: false`. Drawn once per run (once per call for
  an `lm_model` row, whose drawn rows are written whatever the run declared).
- Errors are always recorded: a node run ending on an unexpected error, or a failed
  agent run, is written with the unrecorded node runs above it. Nothing else of the
  unaudited run is. Expected interruptions are not errors.
- The node still runs, routes, alerts and uses the cache as before. Run ids are still
  minted, so alerts and cost records can name a node run that has no row.

A consumer that writes its own rows against a node run (say, a column pointing at
`node_runs`) checks `simpl_core.agent_framework.audit_enabled()` first. The
framework's own writers already do. To record an error under an unaudited run,
call `node_run.record_node_run_late(handle)` first and write only if it returns
`True`.

Full guide: `docs/agent_framework/11-operating-it.md#turning-the-audit-off`.

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

### Composed prompts

An `llm_agent`'s `prompt_id` may name a `prompt_composition` instead of a
`prompt_definition`. The composition is assembled when the agent runs: its `core`
first, then every fragment whose `when` matches the agent's `inputs`, in the order
declared, each body stripped of trailing newlines and joined by `separator`.
Members are ordinary `prompt_definition` entries.

```yaml
  - kind: prompt_composition
    id: v1/outreach/writer-system         # what agent_definition.prompt_id names
    version: 1
    display_name: Writer System Prompt    # optional
    core: v1/outreach/writer-core         # always first
    separator: "\n\n"                     # the default
    fragments:                            # ordered; included when `when` matches
      - prompt_id: v1/outreach/writer-channel-email
        when: {all: [{key: channel, op: eq, value: email}]}
      - prompt_id: v1/outreach/writer-mode-reply
        when: {all: [{key: writing_brief.mode, op: eq, value: reply}]}
    is_active: true
```

- `when` is the routing grammar, read against the agent's `inputs` exactly as
  `LLMAgent.check` receives them: dotted keys walk nested dicts, a missing key
  reads null, an empty `all` always matches.
- A `prompt_id` listed in several entries is included once, at its first entry's
  position, when any entry matches: that is how a fragment says "A or B". Those
  entries must be next to each other, so the order of `fragments` is the order of
  the prompt; the schema rejects entries for one fragment split by another's.
- A `prompt_composition` and a `prompt_definition` never share an id: the
  composition would hide the definition. `af_config_migrate` and projection
  reject the document.
- `core` may not be listed as a fragment. `Loader.validate_boot()` fails when a
  member does not resolve.
- Two members of one composition never carry the same line: text two members
  need goes in a fragment of its own, selected wherever both apply, or in the
  core. `af_config_migrate` and projection reject a document in which two members
  share a line of three or more words (whitespace collapsed);
  `shared_member_lines(composition, definitions)` in
  `simpl_core.agent_framework.prompt_composition` lists those lines offline.
- Same composition version, same member versions, same inputs: same bytes. The
  core is always the leading bytes, so provider prefix caching shares it across
  every selection. Nothing per run belongs in a member; run data goes in the user
  message.

`PromptRegistry.resolve(prompt_id, loader=..., inputs=...)` and
`resolve_for_execution(prompt_id, context=..., inputs=...)` take the inputs.
`resolve` accepts `inputs=None` and keeps only the fragments that match with no
input: the check-only form, for boot gates and previews. `resolve_for_execution`
raises `ValueError` when the id names a composition and `inputs` is `None`, so a
call never runs on the core alone by omission; a single-definition prompt still
resolves without inputs. The resolved `ExecutablePrompt` names the composition
(`prompt_id`, `version`) and carries the rendering on `composition`;
`composition_pointer()` is what the run records.

- `LLMAgent.check(inputs, prompt_selection=[...])` and `stream(...,
  prompt_selection=[...])` compose with a fixed list of fragments instead of
  evaluating `when`; they pass it as `selection=` to `resolve_for_execution`, which
  `resolve` and `compose_prompt(..., selection=...)` also take. Use it to re-compose
  an earlier rendering, such as a rewrite of a draft whose inputs are no longer
  all at hand: pass the fragment ids of that draft's pointer (`members` after the
  core). The body is the core, then exactly the named fragments, each once, in the
  composition's declaration order whatever order the list has; `[]` is the core
  alone. With a selection, `resolve_for_execution` accepts `inputs=None`. A
  selection that names the core or an id that is not a fragment of the composition
  raises `ValueError`, and so does a selection for a prompt id that is not a
  composition. The recorded pointer keeps its shape: its members are the core and
  the fragments used.
- A loader you write for `PromptExecutionContext` needs only `get_prompt(prompt_id)`.
  `get_prompt_composition(prompt_id)` is optional: it is called only when the
  loader has it, and a loader without it (a test stub, say) serves no compositions,
  so every id resolves as a definition or a registered fallback. Implement it,
  returning `None` for an id that is not a composition, when the loader serves
  compositions.

`agent_runs.prompt_id` / `prompt_version` name the composition, and
`agent_runs.prompt_composition` (also on `ProducerAuditSnapshot.prompt_composition`
and the executor's `audit["prompt_composition"]`) holds the pointer:

```json
{"id": "v1/outreach/writer-system", "version": 1, "body_sha256": "<sha256 of the body>",
 "separator": "\n\n",
 "members": [{"prompt_id": "v1/outreach/writer-core", "version": 3, "body_sha256": "..."},
             {"prompt_id": "v1/outreach/writer-mode-reply", "version": 1, "body_sha256": "..."}]}
```

The pointer and the versioned `prompt_definitions` rows it names are the record:
no composed body is stored anywhere else.
`simpl_core.agent_framework.prompt_composition.reproduce_composed_body(pointer,
db=db)` rebuilds the exact body from those member versions and raises
`ValueError` when a digest disagrees. `compose_prompt(composition=...,
definitions=..., inputs=...)` and `select_fragments(composition, inputs)` are the
pure functions behind it, for tests that check a composition offline.

For a composed prompt, `(prompt_id, prompt_version)` identifies the composition,
not the text the model read. Two runs with the same pair can carry different
bodies: the fragments selected differ with the inputs, and the composition's
version does not change when a member's text changes, since members are
versioned on their own and pinned by the config version. An analysis that
compares prompt text groups by `prompt_composition->>'body_sha256'`, or by the
member versions in `prompt_composition->'members'`, not by `prompt_version`.

Apply `migrations/20261015b_af_prompt_compositions.sql` before this version is
merged or released. The `AgentRun` model maps `agent_runs.prompt_composition` on
every write, and a loader without a manifest filters graph elements on the enum
value `prompt_composition`, which errors on a database that lacks it. A service
that pins this package at `main` picks the version up on its next relock.

Full guide: `docs/agent_framework/11-operating-it.md#prompts`.

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
- **Cancellations you cause on purpose.** A `CancelledError` escaping a walk is reported
  as `agent_framework.run.cancelled`, because from inside the run a job timeout and a
  deliberate stop look alike. When your code cancels a task on purpose, for example a
  worker handing its walk back at shutdown, call
  `expect_cancellation(task, reason="worker_shutdown")` before `task.cancel()`. From
  then on a cancellation inside that task is an expected interruption: logged, never
  alerted. `expected_cancellation_reason()` returns the reason inside the task. The mark
  lasts for the task's life, so only mark a task that ends with the cancellation.
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
- **Which run wrote a row.** `run_reference(origin=None, **extra)` (exported from
  `simpl_core.agent_framework`) returns the `run_ref` of the outreach observability
  contract: `origin` (default `agent_framework`), `pipeline_id`, `pipeline_run_id`,
  `node_run_id`, `root_node_run_id`, `config_version_id`, `correlation_id`, plus what
  you pass (`decision_node`, `batch_id`, `source_action_id`), only keys with a value.
  Outside a run it is `None` unless you name an `origin` (`fast_path`, `route_handler`,
  `api`, `legacy`). `stamp_run_reference(target, key="run_ref", **kw)` sets it on a dict
  and never overwrites one already there. simpl_core stamps it for you inside a run:
  `JourneyRepository.insert_action` (`payload.run_ref`), every trigger it creates
  (`trigger_data.created_by`, with the optional `batch_id` / `source_action_id` of
  `create_trigger`, `try_insert` and `batch_id` of `schedule_followup`) and account
  coordination events (`payload.run_ref`).
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

## Email signature

`simpl_core.services.email.signature` sanitizes HTML stored on `sales.user.email_signature_html` and appends it once, under the draft and before the unsubscribe footer. The column is added by simpl_api migration `20260907_user_email_signature.sql`. Apply that migration before deploying a build whose `User` model selects the column.

## Email bounces and dead addresses

- **Recognition** (`services/email/delivery_notice.detect_delivery_failure_notice`, pure): a mail-system sender (`mailer-daemon`, `postmaster`, Exchange's `microsoftexchange…`), or a named address with a failure marker; `failed_recipients` are the addresses the notice's own text names. `address_dead` is true only when the failure says the address is gone (5.1.x, 5.2.1, 5.4.4 or `DEAD_ADDRESS_PHRASES`) and never for a policy refusal (5.7.x: the receiver refused the sender) or a full mailbox.
- **Recording** (`services/email/bounces.record_dead_addresses`): mailbox sync calls it on a thread a connection holds, before it leaves the mail-system messages out (`EmailSyncOrchestrator._record_dead_addresses`, best effort). An address a notice reports dead, and that the seller emailed in that thread, gets a `sales_outreach.email_bounce` row (one per notice and address, so a re-sync records nothing twice), `email_status = 'bounced'` on every lead's `lead_contact` rows for it (`LeadContactRepository.mark_email_bounced`), and an `email.message.bounced` event on the connection.
- **Global**: `EmailBounceRepository.is_dead(email)` is true when any customer's mailbox got such a notice for it; simpl_flow's journey email flow then blocks the send (`email.message.blocked`, reason `recipient_address_dead`), as it does for an opt-out.
- **Exchange's system sender** is a machine address (`migrations/20261019d_exchange_system_sender_automated.sql`, one row in `mappings.email_automated_pattern`): sync leaves its notices out like `mailer-daemon`'s instead of storing them as the lead's reply.
- Notices are not stored, so none wakes an outreach walk. A notice on a thread no connection holds is not read.

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

For Outlook replies, consumers with a persisted conversation should pass both `threadId` and the latest stored `replyMessageId`. The adapter validates that message against Outlook before replying. `EmailNotFoundError` means Outlook definitively reports the requested conversation or reply target unavailable. An unscoped inbox or sent-items page that Outlook cannot retrieve raises `EmailMailboxPageUnavailableError`; mailbox sync logs the page, preserves its cursor, and retries it later. Gmail's `get_email_thread` reads a thread too large for one Composio response message by message; `EmailThreadTooLargeError` means a single message is still too large, and mailbox sync quarantines that thread (`threads_failed`) and keeps going. Runtime, connection, and malformed-response failures remain `IntegrationError` for the caller to surface.

An Outlook reply can carry an attachment (one per send, as on Gmail). `OUTLOOK_REPLY_EMAIL` cannot attach, so such a reply goes through a reply draft: a file under 3 MiB is added with `OUTLOOK_ADD_MAIL_ATTACHMENT`, a larger one through a Graph upload session (`OUTLOOK_CREATE_ATTACHMENT_UPLOAD_SESSION`), whose bytes are PUT straight to the session's upload URL in chunks of 3 MiB (`simpl_core.services.email.outlook_upload_session`). A failed upload raises `IntegrationError` and the draft is not sent.

`EmailDTO.to_email` is the whole To header (every recipient, as Gmail hands it over; the Outlook adapter joins Graph's `toRecipients` the same way, and fills `cc_email` / `bcc_email` from Graph too). Read it with `parse_email_address_list`, never as one address: mailbox sync files each recipient as a participant of its own, so the mailbox owner among several recipients is on the thread.

Outlook gives a sent draft a new message id once it lands in Sent Items, so the `provider_message_id` that `send_email` returns is not the id mailbox sync later lists. `EmailDTO.internet_message_id` carries the RFC 5322 Message-ID, which survives the move. When persisting an Outlook send, pass it as `record_sent_email_message(..., internet_message_id=...)`: ingestion then recognizes the synced copy in the same thread and does not store the message twice.

A `sales_outreach.journey_log` row is its `(action_type, channel)` pair, and the pair must be in `EXECUTION_KINDS` (`repositories/outreach/journey_dispatch_rules.py`, exported from `simpl_core.repositories.outreach`): `send_message` on `email`, `linkedin_message` or `call`; `linkedin_connect` on `linkedin_connect`; `invite_call` on `calendar`. `classify(payload)` returns `executable`, `non_executable` (a verb in `NON_EXECUTABLE_ACTION_TYPES`, whatever channel it carries) or `invalid`; `execution_kind(payload)` returns the pair or `None`. Write an invitation as `action_type = "linkedin_connect"`, never as `send_message` on the connect channel: approval (`set_pending_with_version`) and the database trigger refuse the row with `invalid_transition: ...` (409 in simpl_api), as they refuse an unknown verb, a missing verb and an email send without `recipient_email`. Mirror the sets (`EXTENSION_KINDS`, `EMAIL_KINDS`, `CALENDAR_KINDS`, `SELLER_EXECUTED_KINDS`, `CONTENT_DELIVERY_VERBS`, `STANDALONE_EXTENSION_TASKS`) with a parity test against this package rather than by hand; every one of them is declared here, the four executor sets partition `EXECUTION_KINDS`, and `(invite_call, calendar)` is a calendar kind run by simpl_api on approval, not a seller-executed one. Its approval is its execution: `invite_call` and `send_calendar_invite_manually` (`APPROVAL_EXECUTED_ACTION_TYPES`) never enter `PENDING`, because nothing claims them there; `set_pending_with_version` refuses them through `assert_queueable` (`invalid_transition: ...`, 409) and the trigger `trg_journey_log_never_queue_approval_executed` refuses raw-SQL writers. Book an invite with simpl_api's `execute-invite-call`.

`JourneyLogRepository.claim_pending_email_actions*` claims only due `PENDING` rows with `channel = 'email'`, an `action_type` in `EXECUTABLE_EMAIL_ACTION_TYPES` (`send_message`, derived from the email kinds) **and** a non-empty `recipient_email`. The outreach agent writes its `schedule_followup` wake-ups and other bookkeeping rows on the lead's channel with no message; they are timeline records, not sends, and the claim leaves them `PENDING`. The per-user claim (`claim_pending_email_actions_for_user*`, the one simpl_flow's email sender uses) also takes nothing while the seller is on vacation, while their customer is in the shortlist stage of the onboarding (`sales.user_outreach_held`, simpl_api migration `20261015150100`), or outside their active hours, read through `sales.resolve_active_hours` (unset or invalid = 07:00-19:00 UTC); a due send waits `PENDING` until the window opens. `claim_pending_email_actions_for_user_with_limits` caps only outreach sends (`first_touch`, `follow_up`, any other or missing `message_type`) by the user's remaining daily email quota. A send to a lead who engaged, `QUOTA_EXEMPT_MESSAGE_TYPES` in `journey_dispatch_rules` -- a reply (`payload.message_type = 'response'`, `REPLY_MESSAGE_TYPE`) or a follow-on (`'follow_on'`, `FOLLOW_ON_MESSAGE_TYPE`: written after a call the lead took, while the lead has not written since) -- is claimed first, whatever the quota says and unpaced (`claim_pending_email_actions_for_user(quota_exempt=True)`; `False` claims outreach only), and `sales_outreach.mark_journey_log_completed` does not count a completed email reply or follow-on towards `user_action_usage` (migrations `20261012_reply_sends_outside_email_quota.sql`, then `20261014_follow_on_outside_email_quota.sql`; a LinkedIn one still counts). On LinkedIn, `sales_outreach.linkedin_pre_send_guard` lets a `follow_on` go out wherever a `follow_up` may once the lead has written: allowed when every message of the lead was known before it was decided, blocked as `inbound_after_follow_up_decided` otherwise (`20261014b_linkedin_guard_allows_follow_on.sql`). Outreach sends are also paced: each claim takes at most the remaining quota divided by the five-minute claims left in the seller's open window (`EMAIL_CLAIM_INTERVAL_MINUTES`), so a day's sends go out through the day rather than in the first run. On top of that, every claim takes an `EmailClaimPacing` (required: no caller claims unpaced), which `services.email.send_pacing.claim_paced_email_sends` builds from the `send_pacing`, `send_warmup` and `send_health` rows of `integration.mailbox_setting` and the seller's delivered `email.message.sent` events (`OutreachEventRepository.email_send_history`): nothing while their last email went out less than `min_gap_minutes` ago, at most `max_per_claim` per run and `max_per_hour` in any hour, replies included (`max_sends`); outreach at most `max_outreach_per_day` (30) a day whatever the stage allows; and while their first email through SimpL is less than `len(daily_caps) * days_per_step` days old, outreach today is capped at `daily_caps[step]` against `used_today` (`outreach_daily_cap`; replies uncapped); and after the provider refused the mailbox (`classify_send_refusal`: `blocked` for SMTP 5.7.x, spam or reputation, `limited` for a quota or rate limit; the journey email flow keeps it as `event_data.send_refusal` on the `email.message.failed` event), outreach pauses per the `send_health` row (block: 72 h, then 7 days at 10 a day; limit: 24 h) while replies still go; and when it bounces (`email.message.bounced`, see Email bounces): at least `bounce_min_count` (5) bounces and `bounce_rate_pause` (3 %) of the emails sent in the `bounce_window_days` (7) up to the latest bounce pause outreach until that bounce leaves the window, then 7 days at 10 a day. Gmail, Outlook and IMAP mailboxes alike; a missing or malformed row raises `MailboxSettingMissingError` and nothing is sent (migration `20261019b_mailbox_send_pacing.sql`). simpl_flow's journey email flow claims through `claim_paced_email_sends`. Before claiming, it hands back to the seller (`PENDING` -> `PENDING_APPROVAL`, reason in `payload.authority.block_reason`, the approval it had in `payload.send_hold`) every due email whose approval no longer stands (`hold_unconfirmed_email_sends_for_user`): an auto-approved one (written by the outreach pipeline, `created_by = 'agent_framework'`, with no `authority.approved_by`) when the seller's auto-approval, ICP override merged, no longer covers email (`auto_approval_off`); any one due or approved more than `SEND_APPROVAL_LAPSES_AFTER_HOURS` (72) ago (`approval_lapsed`); and an auto-approved outreach send (not in `QUOTA_EXEMPT_MESSAGE_TYPES`: a reply or follow-on is not rebuilt cold backlog) written within `MAILBOX_REBUILD_WINDOW_HOURS` (24) after simpl_api's `channel_activation_gate` cleared that connection's queue when a mailbox was connected (`mailbox_reconnected`). Each `approval_lapsed` hand-back writes
`pending_actions.approval_lapsed` (`APPROVAL_LAPSED_EVENT`) on the row's connection in the same
transaction, `action_id` the journey_log id, dated when the approval lapsed (due or approved
time + 72 h). A person's approval must stamp `authority.approved_by` (`set_pending_with_version`, simpl_api's `approval_stamped_payload_sql`); a pipeline row queued `PENDING` without it is read as auto-approved. If the check fails, nothing is claimed for that seller in that run. A new kind of sendable row must be added to the table before any sender will pick it up. A send with no recipient is never claimed and a sender must never derive one: the row carries its own destination and identity, and from the moment it is `PENDING` or `RUNNING` every payload writer in the repository refuses to change any of `DELIVERY_FIELDS` -- `action_type`, `channel`, `recipient_email`, `cc_emails`, `bcc_emails`, `recipient_linkedin_url`, `recipient_linkedin_urn`, `expected_sender_account` (`assert_delivery_fields_unchanged`, raising `invalid_transition: ...`) -- whatever status the write moves the row to: a claim, a completion or a cancellation that also rewrites one is refused, and so is `admin_override_fields` switching the channel while un-approving. To change a destination, un-approve with the fields intact, edit the draft, approve again. Stamp results with `update_payload` as before; restating the approved values passes, rewriting them does not.

`JourneyLogRepository.set_cancelled(journey_log_id=..., reason=None, commit=True)` rejects a `PENDING_APPROVAL` draft (writing `reason`, when given, as `payload.cancellation`), is idempotent on a `CANCELLED` row, and raises `invalid_transition: <STATUS> -> CANCELLED` for every other status: an approved `PENDING` row is not taken back. A reply Reply Confidence queued on its own is not cancelled either; it goes back to the seller's review (see "Reply Confidence settings and return to review" below).

Every `JourneyLogRepository` writer that checks or rebuilds a row (`set_pending_with_version`, `set_cancelled`, `update_payload_field(s)`, `set_active_version`, `append_regenerated_version`, `update_schedule`, `admin_override_fields`, and `update_payload` when it names a delivery field) re-reads it under its `FOR UPDATE` lock, so a caller may load the row first in the same session (as simpl_api's endpoints do) and the writer still judges the row as it is now. Each of them, `update_payload` aside, raises `ValueError("journey_log_not_found: <id>")` for a row that does not exist.

The send-time recheck (`sales_outreach.recheck_journey_log_authority`) also holds and returns a reply Reply Confidence queued, and every move of such a reply out of the queue, this hold's and the dispatch authority rule's included, is recorded as a return: see "Reply Confidence settings and return to review" below.

The outreach queue (`BatchTriggerQueueRepository`: `get_pending_triggers`, `count_dispatchable_ulcs`, `claim_next_ulc_work`, `claim_ulc_work`) hands out nothing for a seller listed in `sales_view.outreach_held_user` (simpl_api migration `20261015150100`: their customer is in the shortlist stage of the onboarding, until SimpL moves them on), replies included, unlike a vacation; the rows stay queued and run once released. The view is read once per query (`NOT IN`), not per row. `tests/setup_test_db.sql` stands a table in for it.

An `invite_call` row is booked from `payload.invite_call` (simpl_api's calendar executor sends its `proposed_start_datetime` and `timezone`); `call_data` is the copy a version carries. `JourneyLogRepository` keeps the two in step on these rows: activating a version (`append_regenerated_version(..., activate=True)`, `set_active_version`, `set_pending_with_version`) or writing `call_data` / `call_data.*` through `update_payload_field(s)` merges that call data over `invite_call`, and manual versions and the original snapshot record `invite_call`, so the version a seller sees is the invite that goes out. Edit the slot by writing `invite_call`; other rows are unchanged.

Every version in `regeneration_history` can say who produced it and in which run: `append_regenerated_version`, `update_payload_field` and `update_payload_fields` take optional `edited_by` (`user:<uuid>`, `admin:<uuid>`, `agent`) and `pipeline_run_id`, recorded on the entry (null when not passed); manual edits by different authors are never merged into one version. `admin_override_fields(..., edited_by="admin:<uuid>")` records a content or subject override as a manual version by that admin; without `edited_by` it still leaves the history alone.

`JourneyRepository.get_pending_actions(ulc_id, executable_only=True)` returns only the open rows with an execution kind (queued sends and invitations, not placeholders or review cards); `cancel_pending_actions_for_ulc(..., statuses=("PENDING_APPROVAL",))` cancels drafts and leaves an approved `PENDING` row to the sender that will drain it. Both defaults are unchanged. `ensure_journey_run(ulc_id, company_id, journey_id)` returns the ULC's active run or creates it with `ON CONFLICT (ulc_id, journey_id) DO NOTHING`, so a run another writer committed in the meantime (the autopilot upserts it just after the claim) is reused rather than failing on `journey_run_unique`; a conflict with a non-active run for that journey raises `RuntimeError`. `withdraw_drafts(ulc_id, [(action_id, reason), ...], withdrawn_by=..., trigger_ids=...)` cancels drafts of that ULC still `PENDING_APPROVAL` on its active run, each with its own reason in `payload.cancellation` (`withdrawn: true`); approved, queued, sent and other connections' rows are skipped and logged, and it returns the ids it withdrew.

A Gmail, Outlook or HubSpot service built with a `ComposioConnectionService` marks its connection row and raises `StaleComposioConnectionError` (wrapped in the provider's own error) when Composio reports the account unusable: a structured expired/revoked code on a raised error, or a failed tool result relaying the provider's HTTP 401 (`data.status_code`), which marks the row `expired` with reason `COMPOSIO_PROVIDER_TOKEN_EXPIRED_REASON`; or a `GMAIL_GET_PROFILE` result relaying a 403 for insufficient authentication scopes (the user granted no mail access), which marks the row `revoked` with reason `COMPOSIO_PROVIDER_SCOPE_MISSING_REASON`. A missing scope on any other tool stays an ordinary failure: it can be one unticked permission or a scope our auth config never requests. Detect it anywhere in a wrapped chain with `simpl_core.composio.stale_connection_from_error` and treat it as handled: the row is already marked, only the user reconnecting fixes it, and the class sets `__simpl_notify__ = False` so simpl_tracker's default notify skips it.

`sales_outreach.message.provider_metadata` holds identifiers, envelope, and send provenance only: the keys in `simpl_core.services.email.utils.MESSAGE_PROVIDER_METADATA_KEYS`. Subject and body are never copied into it; read them by decrypting `encrypted_subject` and `encrypted_body`. Ingestion drops any payload key outside that set, so a consumer that needs a new field in `provider_metadata` adds it to the set first. The sync gives `sales_outreach.conversation_thread.metadata` the same allowlist for the thread's head email: read the subject from the thread's `subject` column, never from its metadata. A Gmail message labelled `DRAFT` arrives as `EmailDTO.is_draft=True` and is never stored as a message: an unsent draft is not something the owner said. The thread's newest draft is kept in `sales_outreach.seller_draft` (one row per thread, subject and body in the vault) and returned by `ConversationReadService.fetch_for_ulc` as `seller_drafts`: context for what the seller is writing, never part of `messages`.

A reply on a thread the owner's connection already holds is stored under that connection whoever sends it: the sync no longer resolves such a thread from its newest sender, so a lead answering from another address (a shared mailbox, a longer form of the address, a new employer) is no longer dropped. When the names say the sender is the connection's lead, the address is added to the lead as a `sales.lead_contact` row with `scope='user'` (the owner), `is_primary=false` and `source='email_thread_reply'`: it never outranks the address outreach already writes to. Any other sender is stored as an unlinked participant, and the message still wakes the thread's connection.

On a mailbox a sales identity sends from with its own alias (`send_from_email` on a connection whose `mailbox_email` is a colleague's), a thread is the identity's only when that alias is on it; every other thread is the mailbox owner's, the user whose address the mailbox is (`SharedMailbox`, `load_shared_mailbox`). Each user's sync stores only its own threads and leaves the others to their user's sync, judging whose a thread is on every address it shows: the new messages' headers, the stored participant rows, and the From/To/Cc/Bcc of its stored messages (a calendar invitation stores no row for the invited mailbox). A thread an identity's sync filed under the identity's conversation with none of its aliases on it is taken back by the owner's sync the next time it stores a message there: the thread moves with its messages, draft and attachments to the owner's conversation, and the identity's owner rows become the owner's or a colleague's (`SharedMailbox.takes_back`, `ConversationThreadRepository.move_to_conversation`, `ConversationParticipantRepository.hand_owner_rows`); the identity's sync writes only as its alias (the mailbox's address is the owner's, so it types as a colleague), and neither sync learns a colleague's address of the mailbox as its own alias. A thread is the user's whose conversation holds it (`sales_outreach.conversation.owner_user_id`). When two users sync one mailbox (a sales identity whose email connection is a colleague's mailbox, sending from an alias of it), the other user's sync leaves the thread's stored participants as they are and files a new address as the owner only when it is the conversation owner's (`ConversationService.upsert_participants`). `ConversationReadService.fetch_for_ulc` gives a connection every thread with its lead that its user is on: one they hold a participant row on, one their conversation holds, or one where any of their addresses is a participant's (profile, connection mailbox and send-as, active aliases; `addresses_of_users`), whoever that row points at. So a colleague copied on a thread reads it, and a row another user's sync once claimed no longer hides it. Pass `viewer_user_id` to get `viewer_thread_ids`: the returned threads that user is on, colleagues' included, which a caller withholding colleagues' messages keeps readable. A message from an internal sender (`participant_type` 3) is read per connection, keyed on the sender row's type rather than `is_sender_owner`: one of the connection's user's own addresses is that user (`is_from_owner`); anyone else is `is_from_internal`, a colleague or the company's mail server (a delivery failure), named by `sender_name` (the colleague's user name when the address is a user's) and never the lead. `compute_stats` leaves such messages out of the user's and the lead's figures. A digest marked `head_snippets_superseded` is left out.

## Email on other providers (IMAP/SMTP)

A mailbox on a provider other than Google or Microsoft (Aruba, Namecheap, OVH, any host) is the `imap` integration (`integration_configuration` row, category `email`, seeded active and beta by `migrations/20261019_mailbox_imap_smtp.sql`; beta keeps the card admin-only until `is_beta` is cleared). Its adapter is `ImapSmtpEmailService` (`services/email/imap_smtp.py`), an ordinary `EmailService`:

```python
service = await get_connected_email_service(
    user_id, "imap",
    db_manager=db_manager,          # required: settings rows and the failed-login count
    composio_api_key=..., composio_toolkit_versions=...,   # unused for imap
    mailbox_cipher=None,            # default: KmsMailboxCipher(MAILBOX_KMS_KEY_NAME)
)
```

- **Install and environment.** The consumer installs `simpl-core[mailbox]` and sets `MAILBOX_KMS_KEY_NAME` (the Cloud KMS CryptoKey resource name, `projects/.../cryptoKeys/...`; not a secret) in Doppler. Its service account needs `roles/cloudkms.cryptoKeyEncrypterDecrypter` on that key.
- **The password** is encrypted by KMS and stored as ciphertext in `user_connection.credentials` (`EncryptedMailboxPassword.to_credentials()`), bound to the seller and the mailbox address (`mailbox_associated_data(user_id, email)`). Never store, log or return it in clear.
- **Connecting: address and password only.** simpl_api calls `connect_mailbox(db, user_id=, email=, password=, cipher=)` (`services/email/mailbox_connect.py`), which returns a `ConnectOutcome` whose `status` (`ConnectStatus`) is what the seller is told:
  - `connected`: both logins worked against a preset's servers; the password is stored KMS-encrypted and the row is `active`.
  - `use_integration`: the domain is Google or Microsoft (a `mailbox_redirect_rule` row); `integration_slug` is `gmail` or `outlook`.
  - `provider_pending`: no preset or redirect rule matches the domain. A provider request is opened or joined (`request_opened` is true once per domain: the caller tells the team). **No password is sent anywhere or stored.**
  - `wrong_password` (with the preset's `app_password_url`), `unavailable`, `rate_limited` (`connect_rate_limit` setting), `invalid_email`.
  Matching (`mailbox_presets.match_mailbox_provider`) reads the domain's MX hosts, then their reverse DNS names, against the redirect rules first and the presets second. There is no guessing: a password only ever goes to the servers of a preset an admin saved. `update_mailbox_password` reconnects an existing (even revoked) mailbox; `disconnect_mailbox` erases the ciphertext and revokes. Every attempt is a row in `integration.mailbox_connect_attempt` (no password).
- **Provider requests** (`services/email/mailbox_provider_requests.py`): one open `mailbox_provider_request` per domain, its waiting sellers in `mailbox_provider_request_waiter`, and `discovery` hints for the admin (SRV records and Thunderbird's provider database, `mailbox_discovery`; no password involved). `resolve_provider_request(session, request_id, NewPreset(row) | ExtendPreset(key, suffixes) | ExtendRedirect(key, suffixes), settings=, resolved_by=)` applies it, refuses one that would not match the request's MX hosts (`ProviderRequestError`), closes the request and returns the waiters to email; the caller then calls `mark_waiters_notified`. `dismiss_provider_request` closes one without a preset.
- **Auto-resolve** (`services/email/mailbox_auto_resolve.py`): `auto_resolve_provider_request(db, request_id, resolved_by=, transport=None, discover=discover_provider_hints)` builds a preset from fresh public sources (Thunderbird's database, then SRV records), picks the MX hosts' common parent as its suffix, checks both servers without a password (public addresses, certificate verified, a password login offered: `imap_client.imap_server_capabilities`, `smtp_client.smtp_server_auth_methods`), then saves it with `resolve_provider_request`. It never raises for a provider it cannot resolve: the returned `AutoResolveReport` has one `AutoResolveStep` per step, `ok`, `resolved` (the waiters to email, as for a manual resolution) and `as_text()`, the Markdown log an admin pastes into an agent chat. No session is held during network IO. `discovery` also carries `providers` (each database domain's display name and help page).
- **The connection row** is written by `connect_mailbox` with `mailbox_connection_config(...)` and `external_account_id` = the mailbox address.
- **Settings are rows.** `integration.mailbox_server_preset` (one per provider), `integration.mailbox_redirect_rule` (Google, Microsoft) and `integration.mailbox_setting` (one per global setting; `send_pacing`, `send_warmup` and `send_health` there pace every provider's sends, see the email claim above) are read fresh by `load_mailbox_config(session)` (settings alone: `load_mailbox_settings`) each time a connection is used; a missing setting row raises `MailboxSettingMissingError` (nothing connects), an invalid preset is skipped and logged. Every change is in `integration.mailbox_config_history`. Adding a provider is a preset row; see the ENG-864 plan for the checklist.
- **Security rules are code** (`mailbox_endpoints`): IMAP on 993 with TLS only, SMTP on 465 (TLS) or 587 (STARTTLS required), certificates verified, no address literal as a host, and every address a host resolves to must be public (no private, loopback, link-local or metadata range). The session connects to the vetted address, so DNS cannot change between the check and the connection.
- **Ids.** A message is its RFC 5322 `Message-ID` (`provider_message_id` = `internet_message_id`); a thread is the `Message-ID` of its root, from `References` or, without it, by following `In-Reply-To`. A reply passes `threadId` and `replyMessageId` as for Gmail; the adapter sets `In-Reply-To`/`References` and the subject `Re: <parent subject>`.
- **It never changes the seller's mail.** Reads use EXAMINE and `BODY.PEEK`; the only write is the copy of a sent message `APPEND`ed to Sent (a failure there is logged, never retried by sending again). `search_emails`, `mark_as_read` and `mark_as_unread` raise.
- **Failed logins.** A refused login is counted on `connection_metadata.mailbox_auth_failures`; at the `auth_failures_before_revoke` setting the row is marked `revoked` (reason `mailbox_auth_failed`) and `StaleMailboxConnectionError` is raised: a `StaleComposioConnectionError`, so `stale_connection_from_error` and simpl_flow's handling treat it as "marked, only the seller can fix it, no alert". A login that works resets the count.
- **Connections.** One IMAP connection per service object, closed after `imap_idle_close_seconds` unused or by `await service.aclose()` (a no-op on the HTTP adapters); each send opens its own SMTP connection.
- Which integrations count as email: `integration_configuration.category = 'email'` (`UserConnectionRepository.list_active_email_connections()` and `get_most_recent_active_email_provider()` without `allowed_slugs`), and in code `EMAIL_PROVIDER_SLUGS` (`services/email/schemas.py`) for "is this thread an email thread".

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

Rows storing one LinkedIn page under different spellings (`/x` and `/x/`,
`caff%C3%A8` and `caffè`, a country host) are one candidate set. Among rows
naming one page, the row holding `company_linkedin_id` is the page's record and
is kept, even over a duplicate carrying the claim's exact name: the LinkedIn
enricher merges the other rows into it and deletes them.

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

A company nobody has yet is stood in by `CompanyPlacementService.resolve_or_placeholder`
(a placeholder keyed by domain, then LinkedIn page, then name, recorded in the claim
ledger); never write a `sales.company` row inline. Placement holds
`CompanyPlacementService.lock_lookup_keys(claim, session=…)` before it resolves, so two
writers founding one company at once found it once; a caller that resolves first and
places later takes them itself before resolving.

`LeadIdentityClaim(customer_id=…)` resolves within what that customer may see (addresses
through global rows or rows private to its users, a name only through exactly one fitting
namesake, never a Dummy lead); `LeadPlacementService` keys such a claim per customer and
writes its placeholder no global address. `simpl_core.services.dedup.lead_resolver.profiles_contradict`
is the one rule for a stored LinkedIn profile contradicting a weak match.

A lead whose company is unknown waits on its own stand-in company (origin
`inbound_person`; the shared `(Unknown company)` row is legacy and leads leave it)
(`simpl_core.services.dedup.parking`: `park_lead`, `record_parked_claim`,
`move_parked_lead`), with a pending claim `LeadPlaceholderReconciler` tries on every pass
(current experience, then the claim's company evidence). Run the reconciler, and it moves
the lead with its connections and runs once one resolves.
### Email word lists

Three tables in the `mappings` schema hold the words simpl_core's email checks
use. Add or remove a word as a row; running services pick it up within ten
minutes.

- `mappings.email_provider_domain`: the domains that name a mail provider, never
  a company. `free_mail` (gmail.com, libero.it…) and `certified_mail` (Italian
  PEC hosts: pec.it, legalmail.it…). The domain after the `@` is matched exactly.
- `mappings.email_role_local_part`: local parts of a mailbox a team shares
  (info, sales, fatture…), matched against the whole part before the `@`.
- `mappings.email_automated_pattern`: text marking a mailbox nobody reads
  (noreply, mailer-daemon…), matched anywhere in the address.

The checks in `simpl_core.services.email.domain_policy` (`classify_domain`,
`is_generic_domain`, `should_resolve_company_by_domain`, `is_role_address`,
`is_automated_address`, …) and the colleague rule in `internal_identity`
(`internal_domains_of`) read an in-memory copy of the tables. Core's own
services load it. Code that calls these checks directly loads it first, or they
raise `AddressListsNotLoaded`:

```python
from simpl_core.services.email.address_lists import (
    ensure_address_lists,
    ensure_address_lists_from,
)

await ensure_address_lists(session)   # with a session
await ensure_address_lists_from(db)   # with a DatabaseManager
tenant_domains = internal_domains_of(tenant_emails)
```

Both are free while the copy is under ten minutes old. Tests install a copy with
`use_address_lists(EmailAddressLists(...))`.

### A customer's own addresses

`simpl_core.services.email.tenant_identity.load_tenant_identity(session,
customer_id)` answers which addresses and domains are a customer's own people's:
each user's profile email, what their email connections record (the synced
mailbox and the send-from alias), and the active rows of
`sales.customer_email_identity` (aliases, with the user each belongs to, and
domains). Every such address's domain counts too, unless a mail provider owns
it, and so does any host under it (`team@sales.acme.io` is acme.io's). Email sync files a participant on one of them as the owner (the owner's own
aliases, whose messages are the owner's) or a colleague, never a lead; the
conversation backfill never takes one for the counterpart.

```python
identity = await load_tenant_identity(session, customer_id)
identity.contains("someone@alias-domain.example")  # one of the customer's
identity.user_of("nico@alias-domain.example")      # the user an alias is recorded for
identity.alias_match(address, display_name)        # AliasMatch(user_id, sure) or None
```

A row's `source` is `manual`, `provider` (the mailbox's verified send-as or
proxy addresses), `sent_mail` (the From of a message in a user's Sent folder) or
`name_match`; its `status` is `active`, `proposed` (waiting for someone to set it
active or rejected) or `rejected`. Email sync fills it as it runs:

- once a day per connection it reads the mailbox's verified send-as addresses
  from the provider (Gmail's send-as settings, Outlook's proxy addresses) and
  records each one no user holds yet as that user's (`provider`; the
  connection's `config.send_as_checked_at` holds when);
- the From address of every message the provider files as sent (Gmail's SENT
  label, Outlook's Sent Items) is the owner's: it writes as the owner for the
  rest of the run and is recorded as theirs (`sent_mail`), unless it is
  another user's or a machine's;
- an outside address whose local part and display name are both a user's is
  recorded as that user's (`name_match`, active); one with only one of the two
  is proposed.

Add an alias domain by hand with a `manual` domain row.

### Handing a lead to a colleague

`simpl_core.services.account_coordination.lead_handoff.LeadHandoffService.hand_over`
records a lead-scoped `sales.account_handoff` (company and dummy connections NULL)
with one `account_handoff_ulc` mapping: the source seller's connection with the
lead to the target colleague's, each reused or created (origin `account_handoff`).
The source's drafts waiting for approval are cancelled (`account_handed_off`), and
`sales_outreach.evaluate_dispatch_authority` (rule 1b,
`migrations/20261015_lead_scoped_account_handoff.sql`) cancels any later send from
the source connection, coordination or not; outreach's trigger guard forwards the
lead's replies on it to the target as `handoff_inbound_received`. The newest
lead-scoped hand-off a connection takes part in decides: handed back, it writes
again (`LeadHandoffRepository.silenced_ulc_ids` is the same test). The target's
new connection gets no cold first touch: `wake` (a `LeadMessage`) queues
`handoff_inbound_received` with the lead's message (and, for a forward,
`trigger_data.forwarded_original`: sender, subject, text, note), unless that
message already waits on the source (the guard forwards it) or the source wrote
to the lead since it (its walk answered). Idempotent on `idempotency_key`; the
lead is locked for the transaction. Logs `account.handoff.initiated` and
`.completed` on both connections. Company-wide hand-offs are unchanged.

### Judging a conversation thread

`simpl_core.services.conversation_processing` judges one stored thread and, for a
sales thread, opens one `sales.user_lead_connection` at the funnel category the
conversation reached. That insert is the whole outreach handoff.

```python
from simpl_core.services.conversation_processing import (
    ConversationProcessor,
    SalesDecision,
    counterpart_identity,
    load_thread_bundle,
    render_transcript,
)

processor = ConversationProcessor()
bundle = await load_thread_bundle(session, thread_id)
reading = await processor.read(bundle, session=session)   # writes nothing
if reading.skip_reason is None:
    transcript = render_transcript(
        bundle,
        counterpart=reading.counterpart,
        own_participant_ids=reading.own_participant_ids,
    )
    # Who the transcript's "counterpart" is (name, email, LinkedIn profile):
    # give it to the sales check beside the transcript, or an app's
    # notification quoting a sale reads like the buyer.
    who = counterpart_identity(reading.counterpart)
    decision = SalesDecision(verdict="sales", stage="messaged", reason="...")  # your sales check
    if decision.verdict == "sales":
        result = await processor.process(
            bundle, reading, decision, session=session,
            mode="incremental",   # or "backfill" / "report_only"
        )
        result.outcome    # connection_opened / connection_existed / no_lead / ...
        result.issues     # what a person has to settle
```

`read` settles, without any model call, every thread that could not open a
connection anyway, and a LinkedIn sponsored message the owner never answered
(`reading.skip_reason`). That includes a counterpart the owner already has a
connection to (`connection_existed`, with `reading.existing_ulc_id`): the lead
ingestion linked, or, for a counterpart linked to no lead or to a dummy, the
single lead its email or LinkedIn identity matches; a name alone never counts.
On email, a LinkedIn profile link in the counterpart's own messages (signature,
quoted replies cut) is part of that identity. It also settles a counterpart
working for one of the owner's company's active customers (`existing_customer`):
anyone on the owner's team holds their lead or their company at Customer, or,
for the platform's own team, the counterpart's address is a user of any of the
platform's customers, whatever its subscription (a reactivation or a move may be
under way), or the platform's accounts hold their company domain with a running
subscription or managed engagement. A thread of a colleague's mailbox the owner
reads as a sales identity, with none of the aliases the owner sends from on it,
is settled as `colleague_mailbox_thread`: it is the mailbox owner's. A LinkedIn thread
read from another SimpL user's account (its owner-flagged messages, or a teammate's
profile row that wrote, show that user's profile and never the owner's) is settled as
`another_users_linkedin`: a thread is the owner's only when the owner wrote on it from
their own profile. A colleague's thread the owner was only copied on is
settled as `colleague_thread`: the owner never wrote on it, a teammate did, and a
colleague of the owner's customer still works the counterpart's lead (a connection
not silenced by a lead hand-off). A second connection there would make the copied
owner a second voice to the lead, woken by its own copy of every reply.
A thread among colleagues with no counterpart where a colleague forwarded the
owner, in the last two weeks (`FORWARD_HANDOFF_WITHIN`), an outside person's
message is settled as `colleague_forward` (`reading.forward`: the forward
message, who forwarded it, to which users, and the original from
`forwarded_original(body, is_internal=...)`, which reads past the forwarder's own
reply down to the outside person's message). Only the receiver's copy counts,
and only a message that is itself a forward (`is_forward_subject`: `Fwd:`, `Fw:`,
`I:`, `WG:`, after a `[EXT]` tag); a reply quoting a forward is not one. Email
sync stores such a thread only for backfill-enabled mailboxes and only under a
forward subject or a reply to one (`is_forward_thread_subject`: `Re: Fwd:`,
`R: I:` ...). `process_forward(bundle, reading, decision)`, for a forward a check
judged a sale handed over, resolves or creates the lead and hands it from the
forwarder to the one colleague the forward went to (see "Handing a lead to a
colleague"); several colleagues, an inactive colleague, no status, a lead a third
colleague still works, or a company handed to someone else are issues. Backfill
and incremental runs hand over alike; `report_only` reports `would_hand_off`.
`attach` queues no reply on a connection handed off lead by lead since the
message.
`vendor_pitch_gate(bundle, reading)` says whether a thread `read` left unsettled may
become a vendor's cold pitch the owner answers with a pitch of their own (ENG-775):
the counterpart wrote first and last, nobody on the owner's side wrote, their newest
message is at most 14 days old, the address is a person's, a LinkedIn counterpart is
1st-degree, and nobody on the team ever wrote to that address, profile or company
(`ConversationRepository.team_wrote_to`; a freemail or PEC domain names no company).
`process_vendor_pitch(bundle, reading, reason=...)` opens its connection as `process`
does (Connected, no ICP, origin `conversation_processor`) with the counterpart's
message queued flagged `vendor_pitch` and `seller_approval_required`, under an
advisory lock per customer and person: the first teammate processed answers, the
others get `vendor_pitch_duplicate`; a closed gate is `vendor_pitch_skipped:<why>`.
`process` opens the
connection for the counterpart: the lead ingestion linked (never a dummy), or the
lead its email or LinkedIn identity matches; one it creates when none exists (from
a LinkedIn identity the lead itself, from an email a placeholder with its claim);
or, for a mailbox people share (a role address, or two LinkedIn accounts behind one
address), the company's connection to its dummy lead
(`company_connection_opened`). Among several leads holding the address, the one
whose full name the counterpart's row or own messages carry is chosen; with
nothing to choose between them they come back `no_lead` with a `lead_ambiguous`
issue. A digest message (`head_snippets`, several messages run together) is no
evidence of who its participant is: neither its signature links nor its names
count. `EmailSyncOrchestrator.refill_thread(user_id, provider, thread)` reads such
a thread (`MessageRepository.digest_threads`) again from the mailbox, stores each
message on the thread's own record and marks its digests superseded, which the
reader treats as absent; it returns how many messages the thread gains (counted,
not written, on a dry-run orchestrator), or `None` when the mailbox no longer
holds the thread. The
connection takes the lead's company (`company_id`, else its current role), and the
conversation is never written. Its origin is `conversation_processor`
(`PROCESSOR_SOURCE`), or `inbound` (`INBOUND_ORIGIN`, `result.inbound`) for a
decision with `inbound=True` -- the counterpart came interested in what the
owner sells: how it works, what it costs, a trial, a purchase or a demo -- on a
thread whose first message is the counterpart's. Such a connection writes
`inbound.lead.received` in the same transaction, dated at the counterpart's first
message, with `event_data` `origin` `conversation_backfill`, `company_id`,
`conversation_id` and `thread_id` (`record_conversation_inbound` in
`conversation_processing.inbound_event`; never a second one on a connection that has the
event). `mode="report_only"` decides exactly the same and writes nothing
(`incremental` and `backfill` behave the same here: the caller decides which
threads to pass). `process` takes only a sales decision and raises `ValueError`
on any other.
On a thread that waits on the counterpart it opens at Messaged and queues a
`planner-follow-up-check` with it, so outreach proposes a follow-up. On one at
Connected or Messaged whose newest message is the counterpart's it queues that
message as `message_received`, so outreach answers it
(`result.reply_message_id`); an active
stage on a thread older than 90 days opens at Monitoring, and so does a
`deferred` stage ("maybe later") at any age. A deferral that named its day
(`SalesDecision(..., stage="deferred", recontact_on=date(2026, 7, 1))`) opens at
Messaged instead, with the follow-up due that day (`result.follow_up_at`),
queued the way outreach queues a callback the lead asked for
(`deferral_kind: scheduled_callback`) at the start of the owner's working day; a
day more than 90 days past, before the counterpart's newest message, or more than
two years after it parks at Monitoring like an undated one. Every connection it
opens without an immediate follow-up has its own `lead_claimed` closed with
`BatchTriggerQueueRepository.settle_lead_claimed(ulc_id, reason=...)`, which any
caller opening a connection that must not start with a first touch can use:
outreach's connect fast path would otherwise send an invite at any stage. Every
connection it opens also gets the lead's earlier LinkedIn messages recorded as
handled with `BatchTriggerQueueRepository.record_prior_lead_messages(ulc_id=...,
user_id=..., lead_id=..., reason=...)`; any caller opening a connection on a
conversation that already exists needs the same, or the LinkedIn pre-send guard
refuses every send on it (`inbound_message_missing_trigger`).
`simpl_core` never imports a model runtime: the sales check is the caller's.

### Unknown companies never block

Resolution can miss; ingestion must not stop. Use the placement service when you
need to proceed regardless — email ingestion, imports:

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
every future sighting of that identity to the fabricated row permanently. An
`insufficient_signal` outcome that still carries candidates escalates the same
way — the resolver found rows it declined to link (an exact name match under
`propose_by_name`), and creating alongside them has the same effect.

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

The conversation backfill (`ConversationProcessor.process`) is the live
caller: it creates the lead for a counterpart nobody is yet, and links the
participant row, only once its sales check has read the thread and judged it a
sale. Email sync does not create leads: `ConversationService.upsert_participants`
links a participant to the lead `LeadPlacementService.resolve` finds (writing
nothing) and leaves anyone else `participant_type=2`, unlinked. Standing a
placeholder in at sync made a lead of every notification, receipt and newsletter
sender before anything had read them. Automated mailboxes
(`is_automated_address` — `noreply@`, `bounce@`, `mailer-daemon@`) are never
resolved at all. Dummy leads are still
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

`LeadPlaceholderReconciler` is the lead side. Enrichment records a discovered
LinkedIn URL or URN on the placeholder's **claim**
(`UnresolvedLeadClaimRepository.record_identity`), since `sales.lead.linkedin_url`
is unique and the real person may already hold it. The pass merges the
placeholder into the lead holding that identity; when no lead holds it yet, it
creates the person first (`get_or_create_lead`, origin
`lead_placeholder_reconciler`, exported as `RECONCILED_LEAD_ORIGIN`). Only the
identity recorded on the claim creates a lead.

`LeadTwinMerger.merge_if_twins(lead_ids, session=...)` merges leads that are
one person stored twice, as `judge_lead_twins` decides: their LinkedIn
identities agree (at most one profile id, at most one profile URL, and a row
holding both when both appear), and every row without LinkedIn carries the
survivor's full name. Two ids, two URLs, a URL and an id no row links, no
LinkedIn at all, a Dummy or a placeholder: nothing is merged. Nor across
connections of more than one customer.

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

A company merge also rewrites the source's id to the survivor's in every
`sales.icp_filters.wish_list` that names it (`IcpFilterRepository.repoint_company`;
count in `MergeResult.wish_lists_repointed`). Company-list imports pin targets
and exclusions with `company.id IN ('…')` / `NOT IN` there, which no foreign key
reaches.

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

Which contact rows a seller may use is one rule,
`simpl_core.repositories.lead_contact.seller_contact_reach(user_id)`: the seller's
own rows, a colleague's (`scope='user'`, owned by another user of the seller's
customer) and global rows; never another customer's private rows, and a seller with
no customer has no colleagues. It returns SQL conditions (`own`, `colleague`,
`shared`, `visible`) and the ranking (`rank`: primary first, then own, colleague,
global). `LeadContactRepository.find_best_contact`, `record_user_contact` (a
colleague's row is `VISIBLE`; `BLOCKED_PRIVATE` means another customer's seller holds
it) and `EnrichmentService.check_contact_availability_with_scope` read through it, and
simpl-outreach's address choice must too, so a sender and the decision that wrote the
send agree. The rows stay as they were written: nothing is promoted to `global`.

A shared coordination objective follows a lead merge. When a seller is
connected to both leads and one connection is dropped, the objective's
`source_ulc_id` / `owner_ulc_id` (and its participants' `ulc_id`) move to the
surviving connection, and its `lead_id` / `company_id` follow lead and company
merges. At most one objective per source connection and responsibility may be
open, so when both connections carry an open one the merge raises
`MergeConflictError` rather than dropping live work: close one, then merge.
`FkReference(on_conflict="refuse")` is how a registry entry asks for that
instead of the default drop.

A connection a lead merge drops into the surviving one (same seller on both
leads) is recorded on the survivor as `ulc.merged` (`ULC_MERGED_EVENT`) in
`outreach_events`, with `from_ulc_id`, `to_ulc_id`, `from_lead_id`,
`to_lead_id`, in the merge's transaction. A connection that only moves to the
surviving lead records nothing.

## CRM providers

`get_crm_service` / `get_crm_export_provider` (`services/crm/factory.py`) build
a provider from `integration.integration_configuration.provider`, which must
equal the row's `slug` and the Composio toolkit slug: `hubspot` or `attio`. Both
run through Composio and the customer's `customer_connection`, and both pin a
toolkit version in `composio/client.py`. Callers never branch on the provider;
every provider returns the same shapes:

- `search_deals` rows: `{"id", "properties": {"dealstage", ...},
  "associations": {"companies": {"results": [{"id"}]}}}`.
- One stage-id string everywhere: `get_pipelines()` stage ids, `dealstage`,
  `get_deal_stages()` values and what `upsert_deal_stage_for_company` echoes.
- Fatal failures raise `CrmAuthError` / `CrmQuotaExceededError` /
  `CrmRateLimitError` (the scope's circuit breaker); per-record ones raise plain
  exceptions.
- `resolve_owner_id(email)` answers `None` when the CRM has no such owner or
  the connection cannot read owners (logged as a warning with the cause); quota
  and rate-limit failures propagate.
- `upsert_deal_stage_for_company` (the stage-mapping push) is one
  `CrmExportProvider` method built on `create_process_object` /
  `update_process_object`, the writes CRM flows use: a deal an earlier run
  created under the same `simpl_deal_key` is adopted, never created twice, and
  a rejected stage update raises.
- The Composio plumbing (connection binding, error classification, retries) is
  `services/crm/composio_provider.py`, shared by both providers.

**Attio** (`attio.py`, `attio_export.py`), as it differs from HubSpot:

| Concern | Attio |
|---|---|
| Objects | `companies`, `people` (Simpl leads), `deals`; flows name them so |
| Pipeline | the deals `stage` status attribute; pipeline id `stage`, stage ids are status ids, written by title |
| Matching | LinkedIn URL (any spelling), domain, email; a uniqueness conflict on `domains` / `email_addresses` links the existing record without writing to it |
| Values | formatted per attribute type from the live schema; attributes the workspace lacks are dropped |
| Deal | `owner` is required: the seller's workspace member, else the member who connected Attio; with neither the deal fails before writing; `associated_company` / `associated_people`; unique `simpl_deal_key` text attribute (visible, Attio has no hidden attributes) |
| Associations | a person's `company` is set only when empty; a flow association `label` names the deal's record-reference attribute |
| Messages | a note on the person (else company, else deal); found again by parent, timestamp, title and body, since notes carry no custom fields (a failed lookup raises rather than writing a second note); Attio cannot edit notes, so an update keeps the note and recreates it only if deleted |

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
already-applied report, a disabled scope, a scope with no workflow or with
neither a pipeline nor a flow, or a scope whose lock is held — the same preconditions the scheduler's claim
query imposes, so applying never performs writes promotion would not. A report
is applied at most once; a fresh plan needs a fresh dry run.

## CRM flows

A scope may declare a *flow* in `crm_export_config.config["flow"]`: which CRM
records Simpl creates and moves through a pipeline, when each is created, which
stage it sits in, and what it is named and stamped with. A new customer's CRM
process is then configuration rather than code. A scope without a flow keeps
the stage-mapping push (`crm_pipeline_config.stage_mappings`) unchanged.

```json
{
  "flow": {
    "version": 1,
    "objects": {
      "companies": {"kind": "identity"},
      "contacts": {"kind": "identity"},
      "deals": {
        "kind": "process",
        "grain": "company",
        "stages_from": "status_mapping",
        "associations": [
          {"to": "companies", "label": "deal_to_company"},
          {"to": "contacts", "label": "deal_to_contact"}
        ],
        "name": "Simpl - {company.name}",
        "create_properties": {"source": "Simpl"}
      }
    }
  }
}
```

- **Objects** are keyed by the provider's object type. `identity` objects
  (HubSpot `companies`, `contacts`) are matched and linked through
  `ensure_external_entity_link_without_overwrite`, never overwritten. `process`
  objects are Simpl-owned; HubSpot supports `deals` today. HubSpot `leads` needs
  OAuth scopes the Composio-managed app cannot grant, so it has no spec yet.
- **`grain`**: one record per Simpl contact (`contact`) or per company (`company`).
- **`stages_from: "status_mapping"`** takes the pipeline and stages from the
  scope's own status mapping (`crm_pipeline_config`), read on every plan and
  resolved with `stage_for_status` exactly as the standard push does. Prefer it
  whenever the customer's stages follow Simpl statuses: the mapping people edit
  on the scope stays the one answer to which status lands in which stage, and
  the flow adds only names, stamps, associations and `create_when`. Without
  `create_when` the record is created once the mapping puts the status in a
  stage. Only the object that mirrors the company deal (HubSpot `deals`) can use
  it, a scope with no pipeline or no mapped status is refused, and
  `forward_only` is refused because a mapping has no order.
- **`stages`** (with `pipeline`) are the alternative for stages the mapping
  cannot express. They are ordered most advanced first; the first rule that holds wins.
  `stage_policy` is `follow_status` (every change applies), `forward_only`
  (never moves to a rule listed lower) or `set_on_create`.
- **`driven_by`** (company grain): `latest_contact_change` follows whichever
  connection changed status last, as company sync always has;
  `qualifying_contacts` follows the contacts that met `create_when`, and a
  recorded driver keeps moving the record after it stops qualifying.
- **Conditions**: `status_in` (workflow status names or `status_mapping_id`s: a
  name matches that one stage, a mapping id matches its whole category,
  customer sub-stages included; archived stages are refused),
  `outreach_sent` (an outbound message in a thread the contact shares with its
  owner; a connection request is not a message), `replied` (an inbound one),
  and `all` / `any` / `not`.
- **Templates** (`name`, string property values): literal text plus `{path}`;
  `{a|b}` takes the first non-empty value. Paths are listed in
  `simpl_core.services.crm.flow.TEMPLATE_PATHS`. A name that renders empty skips
  creation with reason `name_unresolved`. Names and `create_properties` are sent
  only at creation; `on_enter` properties go with a stage change.

Flows are configured internally; the status mapping stays editable on the
scope, and a flow with `stages_from` honours it. To give a customer a custom setup:

1. Write the flow as JSON (the file may hold the flow or `{"flow": {...}}`).
2. Check it read-only against the scope and preview what it would do:
   `python scripts/check_crm_flow.py --config-id <scope> --flow flow.json --since <date>`.
   It prints `VALID` with the flow hash, or `INVALID` with the offending path,
   then counts every outcome and lists the proposed writes with names and
   stages. It never calls the CRM and stores nothing.
3. Store it with the statement `--print-sql` prints (a `jsonb_set` on
   `crm_export_config.config`), after review.
4. Run the scope's dry run from the admin screens, apply it, verify in the
   CRM, and promote, exactly as for a standard scope.

Check a flow before saving it: `parse_flow(raw)` checks structure, and
`validate_flow(flow, provider_class=..., status_names=..., status_mapping_ids=...,
sync_direction=..., status_mapping=...)` checks it against the provider, the
scope's workflow and, for `stages_from`, the scope's status mapping.
Both raise `FlowConfigError`, whose `path` names the offending part. A flow
scope must use `sync_direction = 'push'`; flows do not pull yet.

`ReconciliationService.run_scope_sequence` pushes a flow scope through
`CrmFlowEngine`, and `CrmDryRunService.run` plans it with the same planner. The
report lists `would_create_object`, `would_set_object_stage`,
`would_associate_object` and `would_skip_object` entries (each with
`object_type`, `reason`, and for writes the stage before and after and the
rendered name), counts not-due outcomes as `would_skip_object_not_due`, and
stores the flow and its `flow_hash` in `configuration_snapshot`.

Owned records live in `integration.crm_object_link` (migration
`20260916_crm_flow_object_links.sql`), keyed by a Simpl key also written to a
hidden unique CRM property, so a create that was never recorded is adopted on
the next run. A company's deal is mirrored into
`crm_export_record.external_deal_id`, which pull, engagement sync and the link
screens still read; a deal created before the scope had a flow is adopted from
there, and one without a Simpl key belongs to the customer and is never written.

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

A body too large to hold in memory goes up as a multipart upload. Each part is signed
with its own SHA-256; the caller hashes the whole body as it goes and passes the digest
to `complete_multipart_upload`, because the object's metadata is fixed before any byte
is known and so carries no `sha256`:

```python
upload = await store.create_multipart_upload(key, content_type="video/mp4")
parts = [await store.upload_part(upload, number, chunk) for number, chunk in numbered_chunks]
ref = await store.complete_multipart_upload(upload, parts, sha256_hex=whole_body_digest)
# on failure: await store.abort_multipart_upload(upload.key, upload.upload_id)
```

Every part but the last must be at least 5 MiB. `list_multipart_uploads` pages through
uploads never completed or aborted, which are billed until aborted.

### Processed rows and projections (`row_store`)

`simpl_core.row_store` keeps rows a process derives from Postgres (embeddings, detected
languages, extracted fields) in a Lance table per dataset version, on GCS, before
they are served from another system. The table is the source of truth for derived rows:
a target such as a Zilliz collection is a strict projection of it, so it can be rebuilt
or moved without computing anything again. LanceDB and DuckDB's `lance` extension read
the table as it is. Needs the `row-store` extra (`pylance`) and the catalog migration
`migrations/20260929_row_store_catalog.sql` (schema `row_store`).

```python
store = RowStore(RowStoreConfig.from_env(), RowStoreCatalog(db))
posts = store.dataset(SPEC)                  # DatasetSpec: fields, required, indexes
await posts.ensure()                         # catalog row, table, indexes
await posts.commit(rows, run_id=run_id)      # key, row_version, deleted?, fields
rows = await posts.get(keys, ["text"])       # by key; tombstones included

runner = ProjectionRunner(posts, "zilliz:sales_posts_v2", target, columns=[...])
await runner.run(max_seconds=120)            # None when another runner holds the lease
await posts.maintain()                       # indexes, bounded compaction and merges, cleanup
await posts.build_index("vector")            # sections of a declared vector or text index
```

- **A commit upserts by `key`, and a row replaces the stored one only if its
  `row_version` is not older**, so a replay is harmless. A deleted source row is a
  tombstone (`deleted=True`, fields null) so projections see the delete. Mark source
  work done only after `commit` returns; a `LeaseLostError` means it is not done.
- **One writer per dataset.** Commits run under a Postgres lease that Lance's commit
  hook re-checks, which also numbers them; other writers wait up to `lease_wait`, then
  get `LeaseBusyError`. Every Lance write runs off the event loop. The lease lives
  `lease_ttl` (90 s, renewed every 30 s), so a writer that dies frees the dataset
  before the others give up.
- **No commit or read costs more as the table grows.** A commit finds the stored rows
  of its keys through the key index (key and row_version only) and replaces them in
  one Lance commit; reads find rows on a narrow column and take the others by row id;
  once `INDEX_NEW_ROWS_AT` (10k) rows are outside the indexes, the commit indexes them
  as new segments, so no read scans more than that.
- **`maintain` costs the same however big the table grows.** It merges fragments
  smaller than `COMPACTION_TARGET_ROWS` (100k) into ones of about that size, never
  rewrites a full one, and rewrites at most `COMPACTION_MAX_ROWS` (250k) per run, one
  bin at a time, the oldest whatever its size; what is left waits for the next run. It merges an index's newest
  segments like a binary counter, at most `INDEX_SEGMENT_MAX_ROWS` (2M) rows and
  `INDEX_MERGE_MAX_BYTES` (64 MiB) from `INDEX_SEGMENTS_PER_MERGE` (64) segments a
  merge (its memory is about six times the bytes it reads); segments the size of a commit's
  always merge, and a backlog of them merges over successive runs. It also heals, best
  effort, one segment over those caps a run (built before them, or of unknown size):
  rebuilt from its fragments' rows as capped pieces, which frees the fragments
  compaction held for it (`MaintenanceResult.segments_healed`; a failure is
  `heal_error` and the rest of the run goes on). It drops indexes
  the spec no longer plans and builds a missing one per run (a new index reads its
  whole column).
  Its memory does not depend on fragment size or row width either: compaction reads
  `COMPACTION_BATCH_BYTES` (16 MiB) of rows at a time, and importing the row store
  caps Lance's read-ahead at `IO_BUFFER_BYTES` (128 MiB, `LANCE_DEFAULT_IO_BUFFER_SIZE`
  unless the process sets it). Each step logs `row_store.maintain_step` as it starts.
- **Vector and full-text indexes are declared on the spec; on a filled table they are
  built on request.** Like the scalar indexes they are outside the fingerprint, so
  declaring one is no new dataset version.
  - `DatasetSpec(vector_indexes=(VectorIndex("vector"),))`: `IVF_RQ` (1 bit a dimension,
    cosine) on a fixed-size float list.
  - `DatasetSpec(text_indexes=("text",))`: a BM25 (`INVERTED`) index under
    `TEXT_INDEX_OPTIONS`, one neutral analyzer for every language (split, lower case,
    accents folded; no stemming, no stop words), the Zilliz collections' analyzer.
  - They are kept as **sections**: segments each built from the rows of a run of
    fragments, by `Dataset.build_index(column)` alone. Lance's own update and merge of
    such an index open every segment (every section's centroids, every section's word
    dictionary), so their memory grows with the table; a section build reads only its own
    rows. A section holds at most `SECTION_MAX_ROWS` (1M) rows.
  - `build_index` is incremental. Without the index it trains the vector centroids on a
    sample (`VECTOR_TRAIN_SAMPLE_BYTES`) and builds the first sections in fragment
    order; with it, it builds the rows no section holds yet, together with the small
    sections (`SECTION_SMALL_ROWS`, 100k), into larger ones, removing those in the same
    `CreateIndex` commit. A vector section is built in pieces of `VECTOR_PIECE_ROWS`
    (50k) merged into it, on the centroids of an existing section and a rotation of its
    own (each section searches with its own model). One call builds from at most
    `SECTION_ROWS_PER_BUILD` (4M) rows, from a snapshot without the writer lease,
    which it takes only for the `CreateIndex` commit (0.8.166); `IndexBuild.rows_left`
    is what the next call has. Call it on a schedule: rows no section holds are still
    found by searches, which read them without the index. `build_index(column,
    create=False)` returns None for an index the table does not have yet: a schedule
    builds sections of the indexes a table has, and a first vector build, whose
    training holds a sample of up to 2 GiB of vectors, is a run of its own with the
    memory for it.
  - Commits and `maintain` never touch these indexes: commits index new rows into the
    scalar indexes only; maintenance does not update, merge or split a section, and
    compaction leaves the fragments of a large section as they are (a small one's are
    compacted, its remap is cheap). It never builds a vector index, and builds a
    full-text index only on an empty table. An index on an undeclared column is dropped.
  - `DatasetHealth`: `unbuilt_indexes` names a declared one not built yet;
    `section_unindexed_rows` and `most_sections` say how far a vector or full-text
    index's builds are behind, `ngram_unindexed_bytes` and `ngram_small_sections` a
    substring one's (bytes on disk, as its sections are sized: a large table has many
    full sections by design, so only those under `NGRAM_SECTION_SMALL_BYTES` count), and
    `problems()` reports each past its threshold.
  - Search a vector index with Lance's `nearest` (`refine_factor`), a full-text one with
    `full_text_query`; filter `NOT deleted` with `prefilter=True`.
- **Which datasets a host runs, and how, is a table: `row_store.dataset_configs`**
  (migration `migrations/20261009_row_store_dataset_configs.sql`). One row per dataset
  version: `kind` (the host code that builds and writes it), `dims`, `status`, and
  `params`, a JSON object of settings by section.
  - `status` is `active` (written by its kind's runs and maintained; one per kind),
    `maintained` (maintained only: a version being built, or the one just replaced) or
    `off`.
  - `RowStoreCatalog.dataset_configs(kind=None, statuses=("active", "maintained"))` and
    `active_dataset_config(kind)` return `DatasetConfig`s. `config.section("index")` is
    one section's settings; the reader checks their keys.
  - Adding a dataset, moving a kind to a new version or changing a setting is an
    `INSERT`/`UPDATE`, picked up by the next run, with no deployment.
- **A projection target gets full rows and deletes, never partial updates.** A
  `ProjectionTarget` implements `upsert(table)` and `delete(keys)`, both idempotent. The
  runner applies commits past the projection's watermark, one window at a time, and
  never reads past an open commit. Registering a projection with `applied_seq = 0` and
  running it is a rebuild.
- **A reader without the spec opens the table by name.** `StoredTable(config,
  "sales_posts__v2")` gives `schema()` and `read(columns, where=...)`: live rows only,
  `where` a pyarrow expression. It never writes, so it takes no lease and needs no
  catalog. The agent framework's `data_producer` reads the row store through it
  (`source: row_store`).
- `RowStoreConfig.from_env()` reads `ROW_STORE_URI` (`gs://<bucket>`, optionally with
  a prefix). Lance reaches the bucket with Application Default Credentials (the job's
  service account on Cloud Run, `gcloud auth application-default login` locally); no
  key is configured. Lance prefers `GOOGLE_*` credential variables in the environment,
  so set none for another account.

### Search index for any kind (`search.index`)

`simpl_core.search.index` turns a kind of object into a searchable index: a ledger of
one row per document, documents built into rows of a row-store dataset (embedded once
per distinct text, stored vectors reused by key), and a Zilliz collection kept as a
strict projection. Posts are the first kind (`PostsKind`); a new kind implements
`DocumentKind` and reuses the rest.

```python
indexer = DocumentIndexer(
    ledger=IndexLedger(db, "sales.my_kind_index", prioritized=True),
    kind=MyKind(...),            # load(claims), build(claim, loaded), stored_keys(...)
    dataset=dataset,             # needs text_hash, embedding_model and vector columns
    embedder=NebiusEmbedder(api_key=..., dims=4096, query_task="..."),
    name="my_kind",              # log events: my_kind.batch, my_kind.rows_failed
    companion=notes,             # optional: a dataset without vectors, with doc_hash
)
result = await indexer.run_batch(batch_size=100)

# or overlapped: the next batch loads and the previous one commits while one embeds
async with BatchPipeline(indexer, run_id=run_id, depth=3, on_result=record) as pipeline:
    while not pipeline.stopped:
        claimed = await pipeline.submit(100)  # returns once claimed, loaded and built
        if claimed.claimed + claimed.released < 100:
            break
# leaving the block waits for every batch to commit (or gives them back on an error)

collection = ZillizCollectionSpec(log_name="my_kind", columns=(...), schema=..., entity=...)
await create_collection(milvus, "my_kind_v1", collection, dims=512)
runner = projection_runner(dataset, milvus, "my_kind_v1", collection, dims=512)
```

- A document of several rows keys them `row_key(doc_key, part, ...)`; its stored keys
  come from `stored_row_keys(dataset, doc_keys)`, one read through the key index.
- `BuiltDocument.text_hash`/`meta_hash` equal to the ledger's (same table) settle the
  document without writing; rows a new version no longer has get tombstones.
- `BuiltDocument.companion` rows (`CompanionRow`, whatever the outcome) go to the
  indexer's `companion` dataset in the same batch, rewritten only when
  `companion_hash` differs from the `doc_hash` stored with them: a change to them alone
  never rewrites the document's own rows nor reaches their projection.
- A scoped run indexes exactly a selection: a kind's `ScopeWalk` stages a page of the
  scope (`ScopePage.pending` = its documents due now) and
  `run_batch(batch_size=..., keys=page.pending)` claims only those, then
  `walk.advance(page)`. Each scope has its own cursor (`ScanCursors`); scoped and
  general runs share the ledger, so neither redoes what the other did or holds.
- `BatchPipeline` overlaps batches (up to `depth` in hand; `depth=1` prepares one at
  a time) and commits embedded batches together: one row store commit once their rows
  reach `commit_bytes` (`COMMIT_BYTES`, 64 MiB) or the first has waited `commit_wait`
  (`COMMIT_WAIT_S`, 60 s); `commit_bytes=0` commits each batch alone. A batch with
  nothing to write settles at once. `on_result` sees each committed batch (a group's
  share one `commit_seq`); `drain()` waits for every batch in hand and commits the
  group (a scoped run drains before `walk.advance`); `deferred`/`stopped` say why it
  stopped. The embedder never gets more than `embed_concurrency` requests at once.
  A commit never carries a document twice: a batch holding a document already
  waiting commits the group first.
- A scanner's mark must leave a claim in place (never `claim_token = NULL`): the batch
  holding the row gives it back after its commit, and it is claimed again from its new
  state. Clearing it lets one run hold the document twice.
- `Dataset.health()` reads, from the manifest, what maintenance has left
  (`DatasetHealth`: small and held fragments, rows outside the indexes, the most
  segments in an index); `problems()` names what is past normal.
  - **What it costs:** each fragment's id sequence lives in the manifest, which every
    commit rewrites.
  - **Index types:** use BTREE, BITMAP and NGRAM only; zone map, bloom filter and FM
    indexes don't survive compaction on such a table.
- A `DatasetSpec` can declare `ngram_indexes` (string columns) for substring filters;
  `Dataset.scan(where=...)` takes a Lance SQL string such as
  `"contains(markup, 'pricing')"` to use them, since Arrow expressions cannot express a
  substring match. Indexes are not part of `spec_hash`, so adding one keeps the dataset
  version. An NGRAM index is a section index (0.8.159): `build_index(column)` builds it
  in sections of at most `NGRAM_SECTION_MAX_BYTES` (32 MiB on disk, about 1.5 GB to
  build), never a commit or `maintain()`; rows outside its sections are still found by
  a scan. Such a table's fragments are written and compacted to that size (compaction
  re-encodes them, 0.8.165), and `maintain` rewrites an older fragment over 1.5 sections
  into section-sized ones (`MaintenanceResult.rows_rewritten`), which `build_index`
  leaves out until then.

### Landing search (`search.landing`)

Company websites, as the crawl stores them, in the row store and a Zilliz collection
behind the `landing_pages` alias: one document per site (`h:{host}`), its pages' text
chunked along each page's elements (1,200 to 1,800 characters: `CHUNK_SOFT_CHARS`,
`CHUNK_HARD_CHARS`), its template (menu, footer) once, copies of a line or a chunk left
out, every page with text kept however short. Its markup goes to its own dataset without
vectors (`landing_markup_spec`, `landing_indexer(markup=...)`), one element per line: a
start tag with every attribute where the text is kept (e.g. `<input type="email"
name="EMAIL">`), the whole source where it is not (scripts, CSS, SVG, hidden elements,
comments; only embedded binary file bytes are cut). Markup rows share the text rows' keys
(each chunk's and the template's markup), plus one per page, `h:{host}#p:{page id}`: the
page's `<html>`, `<head>`, `<body>` and trailing markup (a line on many of the site's pages
only on the first page that has it) and the markup of what its text rows leave out. A site
without text keeps its markup. Markup is neither embedded nor sent to Zilliz, and a change
to it alone rewrites markup rows only. Sites enter the index through scoped runs
(e.g. Italian companies, or `all`: every company); the general run keeps them in step
with the crawl.

```python
scanner = LandingScanner(db)

# a scoped run: exactly the scope's sites, a page of companies at a time
walk = scanner.walk_scope(CompanyScope(name="italy", countries=("ITA", "IT")))
while True:
    page = await walk.next_page(2000)        # rows at priority 1, changed sites marked
    for keys in batched(page.pending, 20):
        await indexer.run_batch(batch_size=len(keys), keys=keys)
    await walk.advance(page)
    if page.done:
        break

# the general run: the sites in the ledger whose pages the crawl changed
await scanner.follow_crawl()                 # adds no sites
await indexer.run_batch(batch_size=20)       # by priority

sources = LandingSourceRepository(db, bodies, bucket=bodies.config.bucket)  # S3ObjectStore
indexer = landing_indexer(db, sources=sources, dataset=landing_dataset,
                          embedder=NebiusEmbedder(api_key=..., dims=4096,
                                                  query_task=landing.QUERY_TASK),
                          detect_language=detect)

search = LandingSearch(milvus, dims=512, embed_query=embedder.embed_query)
hosts = await hosts_for_companies(db, company_ids)       # host -> company ids
hits = await search.search(text="impianti fotovoltaici",
                           filters=LandingSearchFilters(hosts=list(hosts)),
                           one_per_host=True, limit=50)
```

- **Which companies' sites match** (`best_per_company(db, company_ids=..., ...)`): a
  topic (vector + `min_score`), keywords that must be in the chunk text
  (`KeywordFilter`, as for posts), or both. It maps the companies to their hosts, searches
  the sites (`best_per_host`, complete for the listed hosts) and returns company id ->
  the site's best chunk (`url`, `title`, `section`, `content`; `page_id` is null for the
  site template). `company_ids=None` searches the best 1,024 sites and maps them back.
  Pages carry no date, so there is no window. `KeywordFilter.locate(text)` gives the
  span of the first keyword, for a snippet; `landing_evidence(hit, keywords)` is what a
  match shows (`url`, `title`, `section`, `page_kind`, `snippet` around the first keyword).

```python
found = await search.best_per_company(
    db, company_ids=ids,
    vector=topic_vector, min_score=0.5,                   # omit for keywords only
    keywords=KeywordFilter(["ISO 9001", "UNI EN ISO 9001"]),
)
```

- **Preview a website signal** (`open_landing_preview`): the same search, without
  storing anything, on the ICP's companies (`PreviewScope.ICP`, read from
  `opportunity.icp_company_matches` 1,024 at a time, 6 pages at once, no page started
  after 20 s: `cut_short` and `companies_searched` / `icp_companies` say how far it got)
  or the whole index (`PreviewScope.ALL`: the best 1,024 sites or chunks). Zilliz comes
  from the environment (`AsyncMilvusStore.from_env`), the collection's width from the
  alias (`dense_dims`).

```python
async with open_landing_preview(db, nebius_api_key=key) as previewer:
    preview = await previewer.preview(
        WebsiteSignalQuery(topic="ISO 9001 certified", min_score=0.5,
                           keywords=KeywordFilter(["ISO 9001"])),   # either or both
        scope=PreviewScope.ICP, icp_id=icp_id, limit=100,
    )
preview.companies_matched, preview.matches[0].company_name, preview.matches[0].hit.url
```

- `landing_indexer(..., html_bytes_per_batch=64 * 2**20)` sizes batches by the HTML
  their sites read (`LandingSourceRepository.html_bytes`); `run_batch`'s `batch_size`
  caps the sites. Claims past it are released (`released_keys`) and processed by a later
  batch; the first site is always kept. A site reads its pages in URL order up to
  `max_pages` and `max_site_bytes` (64 MiB of HTML, the first page always): pages past
  either are left out. (0.8.160; `pages_per_batch` and `page_counts` are gone.)
- A scope with no conditions must be named `all` (priority 0); other scopes need a
  condition and a priority of at least 1. Redefining a scope under the same name
  starts its walk over.
- Every visible text is kept; legal pages are excluded from search unless
  `page_kinds` names `legal`. Hits carry the chunk (`content`), its page `url`, `title`
  and `section`.
- The ledger and cursors are simpl_flow migration 075; bodies need an `S3ObjectStore`
  over the crawl's bucket (`simpl-web-pages`). Install `simpl-core[search]`: the row
  store, lxml and the Zilliz parts.

### Company search (`search.companies`)

Every company with a description, in the row store and a Zilliz
collection behind the `sales_companies` alias: one row per company, keyed by its id, its
text the description (as `sales_companies_hybrid` embedded it).

```python
scanner = CompanyScanner(db)
await scanner.discover(walk_pages=1)     # created/updated since last time, then the walk
await scanner.sweep()                    # nightly: merged-away companies, one key slice

indexer = company_indexer(db, dataset=companies_dataset,   # companies_dataset_spec(dims=4096)
                          embedder=NebiusEmbedder(api_key=..., dims=4096,
                                                  query_task=companies.QUERY_TASK),
                          detect_language=detect)
await indexer.run_batch(batch_size=1000)
```

- `DiscoverResult.found` is what a discovery added or marked; `walk_done` once every
  company has been walked. A flow passes `discover` as the `refill` of its batch loop.
- `COMPANY_COLLECTION` keeps the replaced collection's field names (`id`, `content`,
  `sparse`, `dense`, `name`, `description`) and adds typed `industry_id`,
  `industry_name`, `country`, `city`, `location`, sizes, `follower_count`, URLs,
  `created_at` (epoch seconds) and `language`.

### Post search (`search.posts`)

LinkedIn posts and plain reposts, one record per appearance on a page, stored in the
row store and projected into Zilliz behind the `sales_posts` alias. Nothing is added
to `sales.post` / `sales.post_repost` (no trigger, no index): `PostSearchScanner` reads
them and marks rows of `sales.post_search_index` (simpl_flow
`migrations/065_post_search_index.sql`) pending. `discover()` (every run) adds ids above
the cursor in `sales.post_search_scan`; `sweep()` (nightly) re-marks posts whose
`updated_at` moved, reposts whose tracked columns changed, rows whose source is gone,
and records built from a changed post (`depends_on`). `PostSearchIndexer.run_batch`
claims them, builds records (`build_record`), embeds each distinct text once
(`NebiusPostEmbedder`), commits, and settles the rows. The
Zilliz collection follows through `posts_projection_runner`.

```python
search = PostSearch(milvus, dims=512, embed_query=embedder.embed_query)
hits = await search.search(
    vector=company_embedding,                       # or text=..., keywords=...
    filters=PostSearchFilters(company_ids=ids, is_repost=False, languages=["en", "it"]),
    one_per_company=True,
    limit=len(ids),
    min_score={"en": 0.55, "*": 0.5},               # dense-only or keyword-only
)
```

- **Records:** `p:{sales.post.id}` (a quote carries its comment, a blank line and the
  quoted text) and `r:{sales.post_repost.id}` (exactly the reposted post's text, so the
  same vector). `company_id` is the page the row is on; `is_company_post` is about the
  original author; reposts are dated by their activity id.
- **The dataset's vector width is a parameter** (`posts_dataset_spec(dims=...)`); a new
  width is a new dataset version. A Zilliz collection of any narrower width is a
  projection of the stored vectors, no embedding again.
- **Search:** the keyword half is sent as given (the analyzer is language-neutral, no
  stemming); pass `keywords` to add word forms and translations without changing the
  dense query. `one_per_company` groups on the server; lists over 1,024 companies are
  searched in chunks. `min_score` is refused on hybrid (fused) scores.
- **Which companies have a matching post** (`best_per_company`): a topic (vector +
  `min_score`), keywords that must be in the text (`KeywordFilter`), or both. With
  `company_ids` the answer is complete (every listed company with such a post, and its
  best post); without, it comes from the best 1,024 of the collection, a person's own
  posts left out (`PostSearchFilters(has_company=True)`).

```python
hits = await search.best_per_company(
    vector=topic_vector, min_score=0.5,                     # semantic (omit for keywords only)
    keywords=KeywordFilter(["SDR", "SDRs", "account executive"], match_all=False),
    filters=PostSearchFilters(company_ids=ids, posted_after=since),
)
```

- **Keywords** are words or phrases matched on the post text the way the collection's
  analyzer reads it (`analyzer_words`: letter/digit runs, lowercased, accents folded):
  whole words, a phrase's words together and in order, no stemming (list "SDR" and
  "SDRs"). Hits from these searches carry `content`.

### Operator notifications

`simpl_core.observability.TrackerOperatorNotifier` delivers `OperatorEvent`s to
dedicated Discord webhook URLs through tracker (>= 0.5.0 reads URLs, not webhook
blocks) and returns whether delivery succeeded, which an outbox needs before marking
an incident delivered. Context passes `redact_context` first, and the event's
`dedup_key` is tracker's fingerprint. `register_config_fallback_notifier` routes
agent-framework config fallback to operators, and `unavailable_prefect_blocks` checks
tracker JSON config blocks at startup without sending anything. Importing the module loads neither tracker, Prefect nor the agent framework.

**The data lake's alerts go to #data-lake.** `data_lake_alert(level, message, *, event,
dedup_key=None, error=None, **context)` (and `data_lake_alert_async` for async code,
since delivery is a blocking HTTP call) is the one way the row store, the search
indexers, their maintenance, the knowledge graph extractor and the opportunity matchers
alert. Levels are `"error"` and `"warning"` only: success and progress never go there.
It delivers synchronously to `DISCORD_DATA_LAKE_WEBHOOK_URL` (read on every call) and,
when that is unset or Discord does not take the message, falls back to the process's
#error or #warning through tracker, so an alert is not lost. It logs each alert once
(`data_lake_event`, `data_lake_channel`, the traceback of an exception) and never
raises. A delivered exception is marked announced, so tracker's default policy does not
post it again to #warning. Pass a `dedup_key` per problem (a document, a job): repeats
edit one message.

## Who takes the meetings: team hand-off

`simpl_core.services.account_coordination.TeamHandoffService(session)` writes the team
table (`sales.responsibility_assignment`) from two kinds of intent, the same for every
customer (migrations/20261010b_team_handoff.sql):
- **A member's own hand-off**, `sales.user.handoff_to_user_id`: whatever is theirs to take
  goes to that colleague, who may hand it on. A sales identity (role `sales_identity`,
  `SALES_IDENTITY_ROLE`) always has one and never owns a meeting; anyone else may.
- **A team rule**, `sales.responsibility.owner_user_id` (`ResponsibilityDefinition.owner_user_id`):
  one member takes that responsibility for everyone. Rules come first.
- **The table is their projection** (`handoff.project`): for a ruled key everyone hands
  off to its taker; otherwise each member's own taker owns it. An identity nobody can take
  for gets no row, so it books nothing while colleagues own `calendar_booking`. Every rule
  carries `calendar_booking`.
- **Writes:** `set_member_handoff(customer_id=…, user_id=…, handoff_to_user_id=…,
  actor_user_id=…)`, `save_rule(customer_id=…, key=None|key, description=…, owner_user_id=…,
  actor_user_id=…)` (a new key is a slug of the description), `delete_rule(...)`, and
  `sync(customer_id, actor_user_id=…)` after any change of role, activity or customer.
  Each saves through `ResponsibilityPolicyRepository.save` (a narrowed cell bumps its
  revision) and then runs `reconcile_policy`. The caller commits.
- **Refusals** (`CoordinationError`): `identity_needs_handoff`; `invalid_handoff` (a
  colleague who is inactive, another customer's, an identity, or who hands back along the
  way); `invalid_policy`; `not_found`.
- **First table:** a customer gets one the first time someone hands off (or is an
  identity), or a rule is added: it starts with the catch-all `meetings`
  (`DEFAULT_RESPONSIBILITY`). Nobody handing off: no table, and walks stay on the
  ordinary path. A team with no active member (billing paused it) is left as it is.
- **Safety net:** the `trg_user_fill_responsibilities` trigger gives a member who joins or
  comes back to a customer with a table the rows an ordinary member has (owns, or hands
  off to the rule's taker). It only adds rows and skips identities and personal hand-offs.
- **Reads:** `snapshot(customer_id)` returns the members (own choice, resolved
  `taker_user_id`, `needs_colleague`), the rules and the revision;
  `colleagues_for(user_id)` lists who someone may hand off to; `colleague_by_email(...)`.

`simpl_core.services.onboarding_choices` is what an onboarding parks before the person's
`sales.user` row exists: `with_handoff(metadata, to_user_id=…|to_email=…)` (the colleague;
by address for an invitee of the same setup) and `with_connection(metadata, slug=…,
external_account_id=…)` (a mailbox or calendar connected while onboarding). The finalize
calls `apply_onboarding_choices(session, user_id=…, customer_id=…, role=…, metadata=…)`
once the row exists: it writes the hand-off, syncs the team table, attaches the
connections (`integration.user_connection`) and promotes a mailbox's owner to the email
stage (`simpl_core.services.email_stage_promotion`). Each part runs in a savepoint and
never fails the finalize; what could not be applied is in `AppliedChoices.problems`.

`simpl_core.services.onboarding_member` is how that person becomes a working member,
shared by simpl_flow's finalize (every onboarding) and simpl_api (a member joining a team
that already exists is activated when they press Finish, without the finalize container).
Both run, in one transaction: `mark_customer_finalized` (the customer's `onboarding_state`,
`onboarding_completed_at`, `metadata.finalized_*`), `upsert_member` (the `sales.user` row;
a new row keeps the database defaults, the login email is passed in), `assign_icp` per ICP
(`member_icp_picks(flow_type, metadata, team_icps(...))`: a salesperson or identity gets the
invite's `icp_assignments`, or every active ICP when it names none; an admin or target
manager only the ICPs its invite names), then
`apply_onboarding_choices`, then `start_autonomous` (autonomous outreach prefs; no mailbox
connected puts a person on the default stage onto `Only LinkedIn`). A step every
activation needs goes there, so both callers get it.

## SimpL identities lent to a customer: the work customer

A SimpL sales identity can be lent to a pay-per-call customer (`sales.identity_loan`,
model `IdentityLoan`; DDL in simpl_api `20261016100000_identity_loan`). Each connection it
opens for the loan's ICP is stamped by the database (`UserLeadConnection.identity_loan_id`,
`trg_ulc_identity_loan_stamp`, never written by callers except
`get_or_create_ulc_for_lead(identity_loan_id=…)` for a referral of a stamped thread) and works
for the loan's customer for the rest of its life, after the loan ends too.
- **One definition:** the *work customer* is `coalesce(loan.customer_id, user.customer_id)`:
  SQL `sales.connection_customer(ulc_id)` / `sales.work_connections(customer_ids)`, Python
  `UserLeadConnectionRepository.work_customer_id(ulc_id)`.
- **Read on the work customer:** account coordination (`_source` returns `customer_id` =
  work, `home_customer_id`, `identity_loan`; the identity may act on a customer's objective
  it was lent to; owners and targets are members), the colleague lookups
  (`find_colleague_ulc_by_tokens` / `_by_name`, `find_lead_ulc_by_email`,
  `find_existing_emails_in_customer`), `seller_contact_reach` (an identity's row on a lead it
  works for the seller's customer), `LeadHandoffRepository.company_handoff_target`
  (`account_handoff.customer_id`), `LeadTwinMerger`, and `evaluate_dispatch_authority`
  (`migrations/20261016_identity_loan_dispatch_authority.sql`). `context_for_ulc` returns no
  remembered answers when work ≠ home.
- **`ConversationReadService.fetch_for_ulc(…, colleague_scope="home"|"work")`:** a walk passes
  `work` (the customer's sellers are the thread's colleagues); the app keeps `home`.
- **Team table:** `TeamHandoffService.sync(C)` projects every identity ever lent to C as a
  `hands_off` row (C's rules win, else the latest loan's `handoff_to_user_id`);
  `HandoffSyncResult.unrouted_identity_ids` names those nobody takes calls for (a loan writer
  refuses `loan_without_route`). `validate_loan_handoff(C, identity, target)` (codes
  `handoff_required`, `invalid_handoff`, `not_an_identity`), `lent_identities(C)`,
  `customers_lent_to(identity)`, `sync_identity(identity, actor)` (home + every borrower).
  `snapshot`/`members` never list a lent identity.
- **Refusals:** `LeadHandoffService.hand_over` raises `ValueError` across work customers;
  `process_forward` answers `forward_lead_lent` for a lead the forwarder works for another
  customer; `LeadMergeService` raises `MergeConflictError` when one user's two connections
  carry different loans.
- **Moving an identity off an ICP:** `services.icp_pipeline.release_open_pipeline(conn, *,
  user_id, icp_id, reason, change_ref, dry_run=False) -> PipelineRelease` (asyncpg, the caller
  owns the transaction). Companies whose stage over all the user's connections there is open
  and that nothing binds: the person connections on the ICP are unclaimed and marked
  (`user_lead_connection.released_at`, which nothing else writes; no stage change, no history
  row; the placeholder stays claimed), their `PENDING`/`PENDING_APPROVAL` rows cancelled,
  `RUNNING` rows get `cancel_requested_at`, unclaimed wake-ups cancelled; the user's live
  autopilot work units on the ICP expire. `dry_run` counts without locking or writing;
  `PipelineRelease.as_dict()` is the admin move's `release` shape. A first contact planned
  afterwards on such a connection is cancelled by the dispatch authority
  (`identity_released`: an identity ever lent, a connection marked released, still
  unclaimed, never contacted and not on an ICP the identity is assigned to now). A
  connection made after the move (a referral on a thread that continues, an inbound
  person) carries no mark and is worked.
- **Borrower switched off:** the dispatch authority cancels anything a connection stamped
  with a loan (open or ended) still has queued once the loan's customer is switched off
  (`metadata.is_active = false`) or has no active pay-per-call subscription
  (`loan_customer_inactive`, at insert, approval and the pre-send recheck), the same test
  as simpl-outreach's `lent_customer_guard`.
- **LinkedIn only:** a connection stamped with a loan (open or ended) never writes email: the
  dispatch authority cancels any row on the `email` channel there, whatever its verb
  (`lent_identity_email`; a lent identity's mailbox is SimpL's). The Python reference reads
  it from `AuthorityFacts.email_on_lent_connection` (`is_email_channel(payload)` on a stamped
  connection).

## Meetings on the team's calendars, and bookings made by hand

`simpl_core.services.account_coordination.LeadMeetings(session).for_lead(customer_id=…, lead_id=…)`
lists the team's meetings with a lead, from Recall's copy of each connected calendar
(`integration.recall_capture_job`). It covers 30 days back and 60 ahead. It is read-only:
Recall and the calendar providers are never called.
- **Matching:** a lead matches through any email on file for it, whichever seller's
  `lead_contact` row holds the address.
- **Deduplication:** a meeting on several colleagues' calendars counts once, keyed on the
  invite's iCal id and start (`meeting_key`).
- **Each meeting carries:**
  - `status`: `upcoming` / `in_progress` / `past` / `cancelled`;
  - `recorded`;
  - `lead_spoke`: `true` when simpl_api's speaker links (`capture_metadata.call_lead_links`)
    hear this lead on the recording, so the call took place even if the lead wrote before
    it that nobody had joined; `false` when the recording was linked without them; `null`
    when nothing is recorded or linked yet;
  - `call_type`: the sales classifier's label of the recording (`discovery`, `demo`,
    `no_show`, ...), or `null`. Only these two paths of `capture_metadata` are read, never
    the transcript;
  - the `organizer` (resolved to a user of the customer);
  - `lead_attendee {email, response_status}`;
  - `capture_job_ids`, with the organizer's row first.

`AccountCoordinationService.request(...)` for a `calendar_booking` key needs the call to
book under `evidence["booking"]`; `booking_problems(booking, now=...)` is the check.
- **Shape:** `call_medium` (`invite` / `phone`), `lead_email`, `lead_phone`,
  `proposed_start_datetime`, `timezone`, `timezone_source` (`lead_stated` / `location` /
  `seller_default`), `slot_precision` (`exact` / `window`), `window_label`,
  `source_message_id`.
- **Rules:** an invite needs a valid bare `lead_email`, a phone call a `lead_phone` and an
  `exact` slot. The start is ISO 8601 with a UTC offset, strictly in the future, and its
  offset is the one the IANA `timezone` has at that instant.
- **Refusal:** `CoordinationError` with code `booking_not_ready`, naming every problem;
  nothing is written. A replay on the same idempotency key still returns its objective.
- **Corrections:** `supply_information(answers=..., booking={...})` lays the given keys
  over `objective.context.booking` in the same update, and checks the result the same
  way. The owner's invite still queued for the objective (`PENDING` / `PENDING_APPROVAL`
  `invite_call` on the owner's connection) moves with it: start, zone,
  `timezone_source`, `needs_user_to_pick_slot` (a `window` slot) and the lead's address,
  in `invite_call` and `call_data`, stamped `payload.rescheduled`. A `RUNNING` row is
  left alone.
- **Counter-proposal:** an owner who cannot make the lead's slot calls
  `need_information(questions=[...], proposed_times=[{start, timezone}, ...])`.
  The times are 1 to `MAX_PROPOSED_TIMES` (3), each held to the start rules above, with
  no two at the same instant (`proposed_times_problems(times, now=...)`). They are stored
  on the event payload under `PROPOSED_TIMES_KEY` (`{start, timezone}` only), for the
  source to offer the lead. A refusal is `invalid_event` and writes nothing. The
  objective's booking is unchanged until the source supplies the time the lead picks.
- Other capabilities, and `record_observed_booking`, need no booking.

Objective commands and who they wake:
- **`supply_information`** is the source's, from any open state. From
  `waiting_information` it resumes the work (`active`); from `requested` or `active` it
  hands the owner news and keeps the state. `next_state(command, state)` answers which
  state a command leaves.
- **Wake-ups:** a participant's `accept`, `need_information`, `supply_information`,
  `cancel` and `fulfil` wake the other participant (`coordination_updated`,
  `WAKING_COMMANDS`). `progress` and `schedule_check` wake nobody: they are the actor's
  own record and timer. Lifecycle commands wake both sides, and delivery receipts wake
  the other side through `wake_coordination_on_receipt` on `outreach_events`.

`AccountCoordinationService.redirect(customer_id=…, objective_id=…, actor_user_id=…,
to_user_id=…, reason=…, idempotency_key=…)` passes an open objective to another colleague.
- **Who may:** either participant: the owner instead of taking the work on, the source
  when it went to the wrong colleague. Anyone else gets `forbidden`.
- **Where to:** only a colleague in `redirect_targets(customer_id=…, objective_id=…)`,
  computed from the team table: the source hands them a responsibility with the same
  capability (a booking stays a booking), they own it and are active, and they are not
  the current owner. Each target carries `user_id`, `full_name`, `responsibility_key`,
  `description` and `mode`. Any other `to_user_id` is refused with `forbidden`, naming
  the allowed ones, so the dispatch authority rule and `reconcile_policy` accept the
  successor as they would a `request()`.
- **Result:** the objective closes `cancelled` with `cancel_reason` `REDIRECTED` and a
  `REDIRECT_EVENT` event whose payload names `successor_objective_id`. Its queued rows
  are cancelled and its pending wake-ups closed (`skipped_reason: objective_redirected`).
  The successor opens under the target's responsibility, from the same source connection,
  with the context carried over plus `redirected_from`. Only the new owner is woken; the
  source's check carries over, or moves a day ahead if it was already due.
- **Booking:** not checked again, since the hand-off itself is unchanged. An open
  objective already on the target's responsibility raises `already_active`; a replay on
  the same key returns the recorded redirect and its successor.

`AccountCoordinationService.record_observed_booking(...)` records a `calendar_booking`
hand-off the owner already carried out by hand.
- **Who:** the same source and owner that `request()` would pick.
- **Result:** the objective is `fulfilled` straight away, with one `booking_observed`
  event. Nobody is woken and no check is scheduled.
- **The owner's connection:** created, if missing, at the Meeting Booked status of the
  lead's workflow (the source's status only when no workflow can be read). The source's
  own connection keeps its stage. An existing owner connection keeps its status.
- **Verification:** core checks the evidence from the capture job itself: not cancelled,
  organized by the target, a lead address among the attendees who has not declined, and
  ended at most 2 days ago. Anything else raises `CoordinationError` with code
  `not_observed`.
- **An open objective** for the same key and owner is closed the same way: its queued
  actions are cancelled and the owner is woken. A second walk that sees the same meeting
  gets the recorded objective back.
- **Where the proof lives:** `objective.context.observed_booking`, including the
  `lead_email` the invite went to. A receiver may not have that address among its own
  contacts, because `lead_contact` holds each address once per lead.

Hand-off events: `request` writes `account.handoff.initiated`, `redirect`
`account.handoff.redirected` and an objective closing `fulfilled` (`fulfil`, or a booking
observed by hand) `account.handoff.completed` (`HANDOFF_INITIATED` / `HANDOFF_REDIRECTED` /
`HANDOFF_COMPLETED`). One `outreach_events` row per connection involved, at the
coordination event's `created_at`, with `objective_id`, `coordination_event_id`,
`responsibility_key`, `from_user_id`, `to_user_id`, `reason` and the connection's `role`
(`source`, `owner`, `previous_owner`); count one role to count hand-offs. A redirect's
successor writes no `initiated`. Replays write nothing.

`UserConnectionRepository.get_active_booking_calendar(user_id)` returns the calendar an
invite can be created in. It never returns Recall, which is category `calendar` too;
`get_active_by_user_and_category(user, "calendar")` can.

## LinkedIn browser operations

`simpl_core.services.linkedin_proxy.DatabaseLinkedInOperations` (port:
`LinkedInOperationPort`) runs LinkedIn requests through the seller's browser extension.
Each operation is a row in `extension_proxy.operation_config_revision`; the gateway
renders it and the extension fetches it with the seller's session.

- `search_people(context, company_linkedin_id, keyword)` reads the people search page
  filtered to one company (`people_search`).
- `list_company_people(context, company_linkedin_id, company_vanity_name)` lists a
  company's members. LinkedIn serves some accounts its old Ember app and others the new
  frontend, and two reads answer this:
  - `company_people_api`: the People tab's voyager search, by numeric company id.
    It answered on both apps, so it is the default.
  - `company_people`: the `/company/<vanity name>/people/` page, which lists members
    only on the new frontend.
  The read that last answered for the user is kept in
  `extension_proxy.user_operation_variant` and tried first. A misfit (the page served as
  the old app's shell, the API ignoring its filters or refusing the query) tries the
  other read in the same call and remembers it. A failure that says nothing about the
  account (throttling, a provider error) returns as it is, with no switch. When
  neither fits, none is remembered for 24 h and the call returns `None`. Each read
  reserves its own pacing slot, so callers do not. Pass the vanity name decoded from
  `sales.company.linkedin_url` (`linkedin_company_vanity_name`), or `None` to skip the
  page. The batch's `keyword` is `COMPANY_PEOPLE_LABEL`; neither read gives a location.

Both return a `LinkedInSearchResultBatch`. A page that is not the expected screen, or a
provider error, comes back as a batch with `error` set, and its raw body stays in the
ledger for debugging. Parsers read pages by structure only: headings, degree badges and
counts are in the viewer's language.

`fetch_profile_positions(context, public_identifier)` reads one profile's positions
(`profile_positions`) and returns `ProfilePositions`: one `ObservedPosition` per position,
its employer named by the numeric LinkedIn company id (`None` for a position with no
company page), and `public_identifier` / `profile_urn` / `full_name`, the profile the
response is about. Use the positions and the name only when that is the lead's own profile
(`LeadRepository.fill_full_name_if_null` gives a nameless lead the name). A provider error
or an unreadable page comes back with `error` set and the page kept; a channel failure
raises `LinkedInOperationError`. The caller reserves the pacing slot
(`reserve_operation_slot`). LinkedIn serves the dash profile decorated (`elements[0]`, the
positions nested in `profilePositionGroups`), as the first live fetch showed on 2026-10-16;
the normalized (`included`) and legacy (`positionView`) shapes are read too. The operation
is enabled by revision 2 (`migrations/20261016b_enable_profile_positions.sql`); revision 1
(`20261008b`) shipped it disabled.

`simpl_core.services.lead_positions.positions_to_experience(session, lead_id=…,
positions=…, source=…, today=None)` writes those positions; it never commits.
- **Companies:** found by numeric LinkedIn id: the row holding the id; else, for a
  position held on `today`, the lead's own company when it carries the position's name
  (case and spacing aside), holds no id and sits on no other page
  (`CompanyByIdService.attach_to`, which gives it the id and the page); else
  `CompanyByIdService.get_or_create`: the single id-less row on its LinkedIn company page
  (a real row first; a lone placeholder is promoted: it takes the id and `origin=source`,
  and its pending claims resolve to it), else a new row with `origin=source`. A position
  without an id is skipped, never matched by name.
- **Experience:** one `sales.lead_experience` row per position the lead does not have yet
  (`LeadRepository.add_experience_if_absent`).
- **Current employer:** when the positions held on `today` name exactly one company, it
  fills `sales.lead.company_id` if that is NULL, and then the company of each of the
  lead's connections that has none. A lead with another company keeps it.
- **Result:** `PositionsWritten` (`outcome`, `companies`, `skipped`, `experience_added`,
  `current_employer_id`, `lead_company_filled`, `connections_filled`).

## Autopilot yield (Sales Domain)

`simpl_core.sales_domain.autopilot_yield` measures how much of a person's daily company
supply autopilot claims, and returns facts only — it decides nothing. Rates count a
company once, by its latest `execution` row in `sales.autopilot_activity_log`, because
the flow runner reviews a monitored company again on later days.
`autopilot_yield_summary(conn, user_id=…)` rides on the operating snapshot as
`autopilot_yield_7d`; `db_read_autopilot_yield(ctx, …)` is the agent's drill-down, with
monitor / not-in-target reasons, the job headlines each search found, per-keyword empty
rates, companies the person claimed after autopilot monitored them, and ICP changes
pending or applied. The agent records its verdict per ICP in workspace item
`autopilot-yield-<icp_id>` (`props.verdict` is `at_ceiling`, `recoverable` or
`unclear`) and reads it back on later runs.

`icp_search_keywords_update` is a Sales Domain write and a HITL action type: it replaces
`sales.icp.search_keywords`, the titles autopilot searches inside each company, for every
user assigned to that ICP. `customer_brain.sales_domain_pending_action` only accepts it
once simpl_api migration `20260917_sales_domain_pending_icp_search_keywords.sql` has run.
`pending_icp_change(...)` refuses a second open proposal of the same kind on one ICP, so
the users who share it do not queue the same change.
## Sales Domain approval queue

`customer_brain.sales_domain_pending_action` holds what the Sales Domain agent proposes when HITL is on. A proposal is only good for `PENDING_ACTION_MAX_AGE_DAYS` (4) and only while it still applies to live data; `simpl_core.sales_domain.pending_action_freshness.check_pending_action_freshness` decides the second (prompt patches still land and are not already in the prompt, drafts still `PENDING_APPROVAL`, ICP filter/description not already changed or edited since, seller still active).

- `SalesDomainPendingActionService.refresh_pending()` expires old rows and withdraws the ones that no longer apply (`status = 'rejected'`, `rejection_reason` `expired: …` / `stale: …`, `decided_by` NULL). Hosts call it on their scheduled sweep; `has_open_pending` and the daily review snapshot call it themselves, so a stale row never holds a wake.
- `SalesDomainPendingActionExecutor.approve_and_execute` re-checks first. A row that no longer applies is withdrawn and `StalePendingActionError` (a `ValueError`) is raised with an operator-readable message; nothing executes. When only some drafts are still waiting, it executes on those and records the narrowed payload. `claim_for_approval` refuses rows past the age cap whichever path calls it.
- A deferred `icp_description_update` / `icp_filter_update` (`wish_list`) stores `previous_description` / `previous_wish_list`, the value it was written against, so approval never overwrites a newer edit.

## Regenerating a draft (asynchronous)

A regenerate is an ordinary `seller_regenerate` row in `sales_outreach.batch_trigger_queue`; the outreach worker claims it like any other trigger (ranked first, with inbound replies) and nothing runs a walk in the request. The contract is `simpl_core.models.outreach.regenerate` (trigger type, `RegenerateScope`, trigger-data keys, `REGENERATE_RESULT_KEY`, `SUPERSEDE_REASON`, `REGENERATE_LATE_AFTER` = 15 min); the commands are `simpl_core.services.outreach.regenerate`, the query `simpl_core.services.outreach.regenerate_status`.

- **Request.** `request_regenerate(db, journey_log_id=, owner_user_id=, requested_by="user:<uuid>", source=RegenerateSource.SELLER, hint=None, scope=None)` locks the draft and queues the trigger in one transaction and returns `RegenerateRequest(request_id, trigger_id, ...)` (answer 202 with it). `scope=None` lets the worker's triage pick the tier; `RegenerateScope.REWRITE` forces a rewrite. It raises `journey_log_not_found`, `invalid_transition` (not `PENDING_APPROVAL`) or `RegenerateInProgressError` (`regenerate_in_progress: ...`; this draft or another draft of the lead is regenerating).
- **The lock.** While `payload.regenerate_pending` (`RegeneratePending`) is in any state but `failed`, `set_pending_with_version`, `set_cancelled`, `update_payload_field(s)`, `set_active_version`, `update_schedule`, `admin_override_fields` and `append_regenerated_version` raise `RegenerateInProgressError`: map it to 409. A path that writes `journey_log` in raw SQL calls `assert_not_regenerating(payload, journey_log_id=...)` under its row lock.
- **Status.** `get_regenerate_job_status(session, trigger_id=, owner_user_id=, request_id=None)` returns `RegenerateJobStatus` or `None` (not this owner's): `queued`, `running` (both with `late`), `rewritten` (`version_index`), `replaced` (`new_journey_log_id`), `review_request`, `no_result` (`reason`, `draft_changed` when the draft changed meanwhile), `failed` (`reason`), `cancelled`.
- **Cancel.** `cancel_regenerate(db, journey_log_id=, owner_user_id=, cancelled_by=)` only once the regenerate failed, is late, or its job already ended; earlier it raises `RegenerateNotCancellableError` (409). It drops the marker and closes a trigger still queued.
- **Worker.** The worker ends each request with one settle call naming it: `settle_rewrite` (`RegeneratedMessage` -> new active version), `settle_review_request`, `settle_superseded` (long tier: withdraws the draft before the root walk; the job reports the row the walk marks `REGENERATE_RESULT_KEY`), `settle_no_result`, `settle_failed` (the draft unlocks, the marker stays `failed` for the card). A draft that changed meanwhile gets nothing (`draft_changed`), and an outcome already recorded on the trigger is never overwritten; `RegenerateTrigger.from_trigger_data(...).settled` tells a retried batch to skip it.
- **Sales Domain.** `writer_regenerate_journey_logs_for_user(...)` queues a forced rewrite per draft and returns `queued` / `skipped` / `failed` per row; it no longer needs an outreach processor (the parameter is ignored).

Review-card option ids are `simpl_core.models.review_option.ReviewOptionId`; core's `FunnelCategory` carries the same ids as simpl-outreach's `StatusMappingId`.

## Entity tags

An agent points at a record inside its prose with a markdown link on a private scheme: `[Mario Rossi](simpl:lead/<id>)`. Kinds are `lead`, `company`, `message` (a `sales_outreach.journey_log` id), `call`, `task` and `doc` (a `customer_brain.workspace_item` id), and `icp`. `simpl://kind/id` is accepted too; ids are uuids or bigints.

`simpl_core.services.entity_tags` is the Python half of that contract — the other half is `lib/entity-tags/tokens.ts` in simpl_sales, and the two are pinned to each other by `tests/services/test_entity_tags.py`.

```python
from simpl_core.services.entity_tags import format_entity_tag, parse_entity_tags, strip_entity_tags

format_entity_tag("lead", lead_id, "Mario Rossi")   # -> "[Mario Rossi](simpl:lead/…)"
parse_entity_tags(body)                             # -> [EntityTag(kind, id, label), …]
strip_entity_tags(body)                             # -> tags become their plain labels
```

The id in a tag is never trusted: the frontend resolves every tag against the caller's customer, so an invented or foreign id renders as plain text. Any surface that does not render markdown — an outbound email, an escaped-HTML notification, a plain-text export, anything a prospect reads — must call `strip_entity_tags` first, or the reader sees link syntax wrapped around an internal record id. A malformed tag is deliberately left exactly as written on both sides.

## Funnel categories, status writes and meetings

- **Categories.** `simpl_core.models.funnel_category.FunnelCategory` names the canonical categories of `mappings.lead_status` (`MEETING_BOOKED = 5`, `NEGOTIATION = 9`: the lead attended the call, `CLOSED = 6`, ...). The ids are foreign keys, not an order: Negotiation sits between Meeting Booked and Closed. Sort and pick with `PRECEDENCE` / `precedence()` / `best_category()` and `FUNNEL_RANK`, test membership with `MEETING_BOOKED_OR_LATER` / `CALL_HELD`; never `<`, `<=` or ranges on the id. `CUSTOMER = 10` (kind `customer`, off the funnel, precedence 110: one Customer connection makes the company a Customer) is a company already a client of the customer (imported client list, or a SimpL close that aged): watched for signals only, never proposed or contacted, and never a meeting, a call or a win; `compute_opportunities_for_user_ids` counts it as `customers`, `icp_pipeline` as `imported_client`, and autopilot's `execute_action` leaves it untouched. `CRM_STAGE_FALLBACK` maps Negotiation to Meeting Booked and Customer to Closed for a CRM pipeline without the stage.
- **Status writes say who and when.** `UserLeadConnectionRepository.update_status(ulc_id=..., status_id=..., changed_by=..., effective_at=..., reason=..., change_ref=None)` takes the actor, the date the move became true (`None` = now) and what it came from (`change_ref`: `journey_log:<uuid>`, `pipeline_run:<id>`, `review:<uuid>`, `crm_sync:<id>`, `import:<id>`, read by the trigger from `sales.status_change_ref`). A writer in raw SQL calls `simpl_core.services.status_history.set_status_change_context(conn, changed_by=..., effective_at=..., reason=..., change_ref=None)` in the same transaction before its `UPDATE`; a SQLAlchemy writer calls the repository's `set_status_change_context`. `get_or_create_company_dummy_ulc` and `get_or_create_ulc_for_lead` take optional `changed_by` / `reason` / `change_ref`; an author left out is `orchestrator` with `pipeline_run:<id>` inside an agent-framework run and nobody outside one. The CRM pull writes `crm:<provider>` / `crm_sync`, autopilot `autopilot`, the ICP cleanup `icp_pipeline:not_in_target`. `last_lead_message_at(ulc_id, before=...)` is the date a move reacting to the lead becomes true. Moving a lead into Negotiation is for the owner or call evidence only: pay per call charges it.
- **Meetings and calls in a period** come from `sales_view.company_funnel_facts` (simpl_api migration 20260925e, rules of 20261002_billable_call_rules) through `simpl_core.services.reports.funnel_facts`: `fetch_company_facts(conn, user_ids, since)` (`since=None`: all time) and `period_counts(facts, from_ts, to_ts, users=None, include_external=False)`. A meeting is a company's first booking, a call its first call that took place, a win its first close by a person from a working stage. `PeriodCounts` gives SimpL's as `CohortSplit` (`meetings`, `calls_held`, `won`: cohort = taken in the period, earlier = before), the others as `meetings_other` / `calls_held_other` (`meetings_all` / `calls_all` for every one), `won_all_time`, the cohort rate numerators and the same per user. `compute_opportunities_for_user_ids` returns `meetingBookedInPeriod` / `callsHeldInPeriod` (all), `meetingsAttributableInPeriod` / `callsBillableInPeriod` / `wonInPeriod` (SimpL's), `split` (cohort/earlier and `show_rate` / `win_rate`), `won` = won with SimpL all time and `proposals` = distinct companies, next to where companies stand today (`meetingBooked`, `negotiation`, `closed`, `customers`); Managed's `count_calls_booked_auto` counts first bookings in the engagement window. The admin overview and pay per call read the same function, so the numbers agree everywhere.

## Metrics contract (one definition per number, 2026-10-02)

- **Catalog.** `simpl_core.services.reports.definitions` holds every number of the metrics contract (`METRICS`: key, label, unit, hover `description`, `split`) and its rules: `is_simpl_connection(origin, born_category)` (SimpL scope; `NOT_SIMPL_ORIGINS`, Dummy Imported born in Monitoring, born in Closed / Customer / Not In Target / Opted out), `fact_in_scope` / `fact_is_win` (a funnel fact as a SimpL meeting / win, `include_external` lifts `SCOPE_REASONS`, a client the customer already had is never won), `CohortSplit`, `rate` (None without a denominator), `parse_view` (`all` / `cohort`), `is_internal_customer_name` (SimpL itself), `COMPARISONS` (Report Wrapped's Average / Top hover), `REPORT_TIMEZONE` (Europe/Rome). Every API payload serves its hover from `describe(keys)`, never text written in pages.
- **Per customer, per window.** `simpl_core.services.reports.period_metrics` reads `sales_view.customers_metrics_overview_v2` (simpl_api migration 20261002f): `fetch_period_metrics(conn, from_day=, to_day=, customer_id=None, user_ids=None, tz_name=None, include_external=False)` -> `PeriodMetrics` per customer (companies and people taken apart, distinct companies proposed, contacted / replied people, engaged companies, meetings, calls and wins as `CohortSplit`, the rates on the cohort with their numerators, active users, the stock, `previous`, `daily`); `fetch_customer_period_metrics` for one; `combine` / `totals(metrics, is_internal=)` to add customers up (rates from the sums) with and without SimpL; `metrics_payload(m, view)` and `definitions_payload()` for the API shape. The admin table, customer page, app strip, Report Wrapped and ICP cards all read it.
- **Outreach is people.** `compute_outreach_for_user_ids(..., include_external=False)` and `compute_outreach_sankey(..., include_external=False)` count people only (a company placeholder is never an outreach lead) and SimpL's unless asked (`funnel.fetch_connection_scope`); results carry `split` (contacted / messaged / emailed / replied as cohort + earlier) and `responseRate` is the cohort's. `sankey.compute_company_sankey(conn, user_ids, from_ts, to_ts, include_external=)` is the company Sankey (proposed -> taken -> contacted -> engaged -> meeting -> call -> won), companies only.
- **Report Wrapped** months are Europe/Rome calendar months; `won` / `closed` are the month's wins (facts), `companiesClaimed` / `leadsClaimed` apart (`claimed` = people), the payload carries `contract` + `definitions`, and the Average / Top compare only billed customers that are not SimpL (`fetch_benchmark_customer_ids`).

## Weekly sales review (WBR)

The admin WBR page (simpl_api `admin/wbr`, contract `audits/2026-10-13-sales-wbr/SPEC_B.md`) is built from pure pieces here; the numbers come from simpl_api's `sales_wbr.*` SQL functions.

- **Weeks** (`services.reports.wbr.weeks`): Monday to Sunday in Europe/Rome, named by their Monday. `week_start(aware_dt, tz="Europe/Rome") -> date` (a naive datetime raises), `weeks_between(from_day, to_day)` (every Monday, both ends included), `is_week_start(day)`. The admin Overview's weekly buckets use `week_start` too.
- **Series** (`services.reports.wbr.series`): `moving_average(cells, window, rate=)`, `cumulative_average(cells, rate=)`, `total(cells, rate=)`. A week without data (`value` None, or a rate without numerator/denominator) is skipped, a real zero counts; a rate is averaged as sum of numerators over sum of denominators. The first `window - 1` weeks have no moving average: pass the weeks before and keep the tail.
- **Grid** (`services.reports.wbr.grid`): Pydantic DTOs `WbrCell`, `WbrRow`, `WbrSection`, `WbrGrid` (`model_dump(mode="json")` is the page's JSON), `WbrDimension(user_id, channel, step)`. `build_row(key, cells, window=, dimension=)` takes label, unit and hover from `definitions.METRICS` and computes the series. `validate_row` / `validate_grid` run at construction and refuse: a rate without numerator and denominator, outside 0–1 or not equal to their ratio; a count that is not a whole number ≥ 0; a manual cell without `entry_id` and `entered_by` (or those on a non-manual cell); `restated` without `frozen_value` (or the reverse); `value != computed_value` on a cell that is neither; weeks that are not consecutive Mondays; a row whose cells are not the grid's weeks; a restated cell in a week that is not closed; a key that is not in `METRICS`. `model_copy(update=...)` skips the check: rebuild with the constructor.
- **Stored data** (`models.wbr`, `repositories.wbr`, one repository per table, caller commits):
  - `CustomerActivationRepository.upsert_activation(...) -> (row, created)` derives `activated_at` (later of subscription start and payment method) and never rewrites a stored subscription; `customer_id` may be None with `customer_setup_id` (an onboarding paid, not finalized). `unlinked_stripe_customers()`; `link_customer(stripe_customer_id=, customer_id=) -> int` fills only a missing `customer_id`; `first_activation_per_customer(customer_ids=None)` leaves out rows with no customer.
  - `UserTagRepository.upsert_user_tag(user_id=, key=, value=, set_by=)` (same value: nothing written), `list_user_tags(user_ids)`.
  - `WbrManualEntryRepository.insert_entry(..., idempotency_key=) -> (row, created)`: `replaces_id` must be the cell's current entry (`ManualEntryConflict`), a key reused for another command raises `IdempotencyKeyReused`; `list_entries(customer_id=, from_week=, to_week=, include_replaced=False)`. A cell's dimension is stored with only the keys that are set.
  - `WbrWeekCloseRepository.close_week(...) -> (row, created)`: a week closes once, a second close returns the first; `get_closed_weeks(customer_id=, from_week=, to_week=)`. `grid` is the week's rows dumped as one-cell `WbrRow`s.
  - `WbrCustomerOriginRepository.propose(...)` replaces a proposal, reopens a rejection only for another lead or company, never touches a confirmed origin; `decide(..., status=confirmed|rejected, decided_by=, company_id=None, lead_id=None)` (naming the origin stores it as `manual`; nothing to decide raises `NotFoundError`); `list_proposed(seller_customer_id)`.

## Inbound signals (ingestion)

`simpl_core.services.ingestion` turns what a customer's inbound sources report (SDK, signed
webhooks; transport lives in simpl_ingestion) into leads owned by the right seller, with an
`inbound_signal` trigger outreach walks. Tables: `integration.ingestion_inbox`,
`integration.ingestion_rule` (migrations/20260808_ingestion_inbox_and_rules.sql,
20261014c_ingestion_record_lead.sql, 20261016c_ingestion_retry_backoff.sql), `integration.ingestion_playbook`
(20261014d_ingestion_playbook.sql), one
`(Unknown company)` row (`INBOUND_UNKNOWN_COMPANY_ID`, migrations/20260820_inbound_unknown_company.sql).
- **Accept:** `IngestionService(session).accept(customer_id=…, connection_id=…, signal=IngestedSignal, sender_dates_signal=bool)`
  -> `IngestionAcceptResult(inbox_id, created, status)`; idempotent on `(connection_id, external_id)`;
  the caller commits. The row's `occurred_at` is the time everything the drain writes is
  dated by (the connection's status history, the trigger, the event): the signal's own,
  capped at now, when `sender_dates_signal` (a server key, SimpL's replay); the arrival
  when not (a web page could backdate it). `IngestedSignal` refuses an empty `external_id`, `source` or `name`,
  `properties` over 16 KB of JSON (`MAX_PROPERTIES_BYTES`) and unknown fields, at the top level
  and inside `person`, `company`, `context`, `consent` and `owner_hint` (a misspelled
  `person.linkedin` is refused, not dropped): a sender passes a stable `external_id` per event
  and `person.linkedin_url` when it knows it. `IngestedSignal.test: true` (on the envelope,
  never in `properties`) marks a test: it is accepted and shown like any other and the drain
  writes nothing (`test_signal`).
- **Drain:** `drain_ingestion_inbox(db, *, batch_size=10, max_batches=5, default_owner_by_customer=None, only=None, max_seconds=None, lock_timeout_ms=None) -> int`
  (rows processed), rows in `occurred_at` order. A request drains what it accepted with
  `only` (those rows, never another customer's), `max_seconds` (no batch claimed once spent)
  and `lock_timeout_ms` (a row waiting on another writer of the person fails that attempt and
  stays pending); the sweep drains the rest. One transaction per row, holding the row's lock while it is still this
  drain's claim: a claim reclaimed by another drain (stale after 300 s) is left to that drain,
  so a row's triggers are queued once. A failing row goes back to `pending` with
  `last_error` and `next_attempt_at` (1, 2, 4 ... 60 minutes after each attempt:
  `repositories.ingestion.retry_delay`), and ends `failed` after `max_attempts` (8). An
  `IngestionPermanentError` (a `fixed` rule's owner gone, no active seat, a seat with no Not
  Connected stage, a stored signal or rule stage that no longer validates;
  `IngestionRuleError` is one) fails the row on its first attempt. A row whose claim went stale
  on its last attempt is failed as `claim lost` (`IngestionInboxRepository.fail_lost_claims`).
  `requeue_signals(session, customer_id, *, inbox_ids=None, requested_by=) ->
  InboxRequeue(requeued, superseded)` puts failed rows back (`pending`, attempts 0), and,
  among the rows named in `inbox_ids` only, those `ignored` as `no_matching_rule` too (decided
  again by the rules as they are when drained), except a meeting signal a later one about the
  same `properties.event_id` supersedes; the caller commits. Rows end `completed` (outreach queued, `record_only` or `notify_only`) or `ignored`; `resolution` holds an
  `IngestionResolution` (`reason`: `ignored_by_rule`, `no_matching_rule`, `own_team`,
  `opted_out`, `test_signal`, `unresolved_identity`, `identity_escalated` (dedup could not tell
  the person apart: nothing placed, the claim kept in the ledger for the reconciler),
  `not_in_pipeline`, `not_from_an_inbound_source`, `notify_only`, `record_only`;
  `account_worked_outside_the_lane` only on rows before 2026-10-16; `contacts_blocked`:
  the contact types the owner could not get because another user holds them privately).
- **Rules:** the first enabled rule by priority decides. `create_lead` may add somebody new;
  `record_lead` places the person as `create_lead` does but wakes nobody: the signal is written
  as a processed `inbound_signal` (status `recorded`, read by outreach as handled; no
  `scheduled_at`, queued at `occurred_at`) the next walk reads as history, the `lead_claimed` of
  a connection it opened is settled with the same reason, a seat already holding the person
  keeps them whatever the strategy and no other seat hears of it;
  `attach_signal` reaches only a person an active seat of the customer is already connected
  to (anybody else, even a lead SimpL's shared base knows, is `not_in_pipeline`);
  `notify_only` records who the person is and who would own them, writing nothing; `ignore`.
  `match_conditions` take equality, `{"$exists": bool}` and `{"$any_word": [...]}` (the value
  holds one of the words as a whole word, any case: `{"person.job_title": {"$any_word":
  ["founder", "ceo"]}}`). `action_config.seller_approval_required: true` makes the walks the
  rule wakes write only drafts the seller approves; `action_config.playbook_section` names the
  playbook section its people follow; `action_config.wake_after_working_hours: n` makes the
  owner's trigger on a connection that already existed due `n` of the owner's working hours
  later (`BusinessHoursScheduler.add_working_hours` on their `active_hours`, default 09:00-18:00
  Europe/Rome Mon-Fri; a new connection still wakes at once with its `lead_claimed`).
  `action_config.move_to_stage: <mappings.lead_status id>` (`stage_rule.MOVE_TO_STAGE`) moves
  the connection the signal lands on to that stage, forward only by `PRECEDENCE`, never out of
  Opted out or Non sales, dated at `occurred_at` with `change_ref` `inbound_signal:<inbox id>`
  (after a booking's own move; not for a `properties.replayed` signal, nor a meeting fact
  `books_meetings` refuses). A rule may name only `MOVE_TO_STAGE_TARGETS` (Pending, Connected,
  Messaged, Meeting Booked, Negotiation, Closed, Customer): `validate_move_to_stage(value)`,
  which simpl_api's rule writer calls.
  `action_config.expects_reply: bool` (`reply_rule.EXPECTS_REPLY`) says whether somebody should
  answer the people the rule takes (the sales Home's "Inbound waiting for an answer"):
  `rule_expects_reply(action, action_config)` reads it, else the action's default (`create_lead`
  yes, the others no; an `ignore` rule never); `validate_expects_reply(action, value)` is the
  rule writer's check.
- **Plan and preview:** `planning.plan_signal(session, *, customer_id, signal,
  default_owner_user_id, hold, screen_tests=True, inbox_id=None) -> SignalPlan |
  IngestionResolution` is the drain's whole decision before it writes (rules, the test screen,
  own team and opt-outs, the person and their holders, a meeting fact's source check, the
  owner); the drain passes `hold=True` (the person's, the company keys' and the lead's locks).
  `preview_signal(session, *, customer_id, signal, default_owner_user_id=None) ->
  SignalPreview(action, rule_id, reason, owner_user_id, owner_chosen_by, takes_over_user_ids,
  lead_id, stage, wakes_agent, wake_after_working_hours, approval_required, expects_reply,
  playbook_section)` reads the same plan with no lock and no test screen (an example address
  reads as somebody new) and writes nothing: Settings > Inbound's "Try an event". `lead_id` is
  set only for a person the customer works; `stage` is `StagePreview(target, current, outcome)`
  with `outcome` `moves`, `kept`, `replayed`, `no_stage` or `another_lane`.
- **Playbook** (`services/ingestion/playbook.py`, store `playbook_store.py`): one per customer,
  `InboundPlaybook(free_text, sections=[PlaybookSection(key, label, applies_to{sources, names,
  channels in linkedin|email}, fit, steps=[{when, action, link}], links)])`, bounded (12 sections,
  20 steps, 10 http(s) links, 8,000 chars). `load_playbook(session, customer_id) -> StoredPlaybook`
  (revision 0 when none), `save_playbook(session, customer_id, playbook, replaces_revision=,
  updated_by=)` (a stale revision raises `repositories.ingestion.PlaybookRevisionConflict`; two
  first writes cannot both win). `playbook_section_for(playbook, rule_section=, source=, name=,
  channel=)` resolves the section: the rule's, else the first whose set lists all hold the
  value, else the one with an empty `applies_to`. The drain stamps its key on the trigger
  (`playbook_section`); outreach reads the playbook as the seller's own instructions.
  A signal no enabled rule matches is `no_matching_rule` and nothing is written, also for a
  customer with no rules at all (decision 7, 2026-10-16: no inbound process, no inbound; until
  then such a customer got every reachable person as a lead). The signal stays in the inbox,
  `ignored`; disabling every rule stops the lane.
- **Asking SimpL to answer** (the Home's "Ask SimpL to reply"):
  `triggers.request_inbound_answer(session, *, ulc_id, inbox_id, requested_by) ->
  InboundAnswerRequest(trigger_id, ulc_id, lead_id, inbox_id)` queues a copy of the signal's
  `inbound_signal` trigger on the connection, due now, with `seller_approval_required` forced
  (a signal a `record_lead` rule only recorded is answered too), and writes
  `inbound.answer.requested` (`INBOUND_ANSWER_REQUESTED_EVENT`; `event_data`: `inbox_id`,
  `trigger_id`, `requested_by_user_id`, `signal_name`, `origin`) in the same transaction, on the
  lead's lock (the drain's). Refused with `InboundAnswerRefused(reason)`: `pending` (an
  `inbound_signal` on the connection no walk took yet), `draft` (a lead-facing journey row
  waiting), `recent` (a request for the person at the same customer in the last 10 minutes,
  `ANSWER_REQUEST_COOLDOWN`), `no_signal`. The caller decides who may ask and commits.
- **Stops before any lookup:** a test is `test_signal`: `test` set, or the person's address
  or the company's domain on `example.com` / `.net` / `.org` or under `.test` / `.invalid`
  (the setup prompt's `ada@example.com` became a real lead in August). The customer's own
  people are `own_team`, by the rule email
  ingestion applies (`simpl_core.services.email.internal_identity`): a user's address or the
  customer's own mail domain (`+tag` ignored), an active seat's Supabase login, or a user's
  LinkedIn profile. An address in `gdpr.email_opt_out` is `opted_out`. Nothing else
  suppresses: a pending draft or a lost stage reaches the agent, which decides.
- **Identity (one person, one lead):** dedup's `LeadResolver` on a claim scoped to the
  receiving customer: by LinkedIn profile, then by email through
  `LeadContactRepository.leads_for_addresses(customer_id=…, addresses=…, preferred_user_id=None)`
  (global rows and rows private to the customer's users; never Dummy or nameless leads),
  then by exact full name at the company the signal names (exactly one lead with a public
  identity or known to the customer). A lead found by email or name whose stored profile
  contradicts the signal's is somebody else (`profiles_contradict`). When the profile names
  one lead and the address another the customer holds privately or works
  (`LeadContactRepository.leads_customer_knows_by_address(customer_id=…, address=…) ->
  list[KnownAddressHolder]`, worked longest first), the address's lead wins and the
  profile's is reported as `IngestionResolution.twin_lead_id` (no merge), unless the
  customer worked the profile's lead first
  (`UserLeadConnectionRepository.customer_first_connected_at(customer_id=…, lead_id=…)`):
  then the profile's lead keeps the signal and the address's is the twin. A meeting fact
  (`calendar_booking`, `call_recording`) about somebody no seat holds is first looked for
  among the leads the customer's active seats work at the company the signal places them
  at or on their work domain's site
  (`UserLeadConnectionRepository.customer_leads_at_company(customer_id=…, company_id=…,
  site_host=…, limit=…) -> list[PipelineLead]`), by first and last name, accents and case
  aside (`pipeline_match.find_in_pipeline`, `LeadMatch.PIPELINE_NAME`). Profile URLs go
  through the one parser, `simpl_core.utils.linkedin_identity.linkedin_profile_identifier`
  (any LinkedIn host, the segment after `/in/`; a company page or another host is no
  profile).
- **Owner** (`OwnerStrategy`; `ingestion_rule.owner_strategy` stores `fixed`, or `default` /
  `existing` / `hint` / `round_robin`, which all mean `existing_owner`; a rule writer stores
  `STORED_OWNER_STRATEGY[strategy]`, i.e. `existing` or `fixed`): `existing_owner`
  keeps a person with the holder already connected to them (the most advanced stage
  wins among several), else the seat a switched-off holder hands off to
  (`OwnerChoice.HANDOFF`), else the signal's owner hint, the rule's owner, the host's default
  owner, the oldest active seat. Holders are the connections that work for the customer
  (`UserLeadConnectionRepository.work_connections_to_lead(customer_id=…, lead_id=…)`, through
  `sales.connection_customer`: a SimpL identity lent to the customer holds the people it works
  for it); a switched-off user's connection holds nobody, and its hand-off (the loan's, else
  `sales.user.handoff_to_user_id`) inherits the person when it is an active seat
  (`owner_routing.split_holders`). `fixed` is the rule's owner always (an inactive one fails
  the row). Every other seat holding the person gets an `inbound_signal` carrying
  `took_over_by_user_id`, once per stand-down: a seat whose newest signal already says this
  owner took the person (read in the order its walk reads them, by `occurred_at`) hears
  nothing more from later signals of the person, while a seat the person came back to in
  between, or a takeover by another owner, is told again. The owner's trigger carries
  `took_over_from_user_id` on every signal. A meeting fact goes to the seat its owner hint
  names for somebody new (whatever the rule), stays with the seat holding a held person,
  and takes nobody over (`resolve_owner(..., meeting_fact=True)`).
- **Writes:** somebody new is placed by `LeadPlacementService` (a LinkedIn profile makes a
  real lead of origin `inbound`, an address alone a `placeholder` lead in the claim ledger)
  on the company owner rule 2 places them at (`services/ingestion/company_placement.py`:
  the company typed, by page or site, then by its exact name, then a placeholder for it;
  else the work address's domain, found or founded as `domain:<host>`; else their current
  LinkedIn role; else their own stand-in, never `(Unknown company)`), with a pending claim
  the reconciler keeps trying while on a stand-in. The customer's own connections to the
  person carry that company (`place_customer_connections`); a typed company the lead's does
  not match goes on its inbound connections, never on the shared lead, and only when no
  seat holds the person through another lane
  (`UserLeadConnectionRepository.move_customer_connections(customer_id=…, lead_id=…,
  to_company_id=…, replace_origin=…)` replaces a company only on connections of
  `replace_origin`). Outbound, a reply naming another company the person answers for moves
  that one connection there (`conversation_company.move_connection_to_named_company(session,
  ulc_id=…, company=CompanyIdentity(…))`: their current roles first, then rule 2, never
  their address). A meeting fact applies only to a person one of the customer's inbound
  sources brought (2026-10-16): an `inbound.lead.received` whose `origin` is not a meeting
  fact, on a connection a user of the customer holds to the lead
  (`meetings.came_through_an_inbound_source(session, customer_id=…, lead_id=…) -> bool`).
  Anybody else (an investor who booked on the seller's page, an outbound lead, a person a
  calendar placed before) writes nothing: no lead, contact, connection, booking, trigger or
  event, the row `ignored` with `not_from_an_inbound_source`. A meeting fact about a person
  a source brought but any seat also holds through another lane books nothing
  (`meetings.books_meetings(signal, holder_origins=…)`). simpl_api's recording linker
  sends nobody to the lane: it creates a call's attendee nobody knew itself. Acquisition sources (`request_access`, forms) still open inbound connections anywhere. A parked lead
  moves once a later signal or the reconciler finds its company, and its connections and
  their journey runs follow it
  (`UserLeadConnectionRepository.reassign_company_for_lead(lead_id=…, from_company_id=…,
  to_company_id=…) -> CompanyReassignment(connections, journey_runs)`: only rows still on
  the old company move, so the app's cards, which file drafts under the run's company, show
  them under the new one). A lead on any other company never moves. Drains writing one
  lead take turns (an advisory lock on the lead), whatever keys their signals name the
  person by, and drains that may found one company take turns
  (`CompanyPlacementService.lock_lookup_keys`), so colleagues naming their new company at
  once found it once; the owner's connection in their Not Connected stage (origin
  `inbound`); the email and phone as contacts private to the owner
  (`LeadContactRepository.record_user_contact`: never global, never someone else's row); the
  triggers. A lead found by name alone is never written to (no profile, title or name), and
  gets no address or phone of a type its owner can already reach
  (`LeadContactRepository.find_best_contact`). `ingestion_rule.delay_seconds` is ignored.
- **Trigger:** `inbound_signal` (`INGESTION_TRIGGER_TYPE`, defined in
  `simpl_core.models.ingestion`), due at the transaction's `now()` like the `lead_claimed` a
  new connection queues, so both are claimed in one batch. The queue ranks it first, with
  replies and seller regenerates; unlike replies it waits out the seller's vacation, together
  with its `lead_claimed`.
  `trigger_data` is `InboundSignalTriggerData`: `trigger_source`, `inbox_id`, `occurred_at`,
  `signal{source,name,kind}`, `properties`, `payload` (the facts under the channel catalog's
  names: its `property` fields, or `properties` when the channel has no catalog; a field of
  any other role fills the signal's own fields and never reaches `payload`), `channel_id`,
  `channel_name`, `agent_context` (a rule's `action_config.agent_context` wins over the
  channel's), `page_path`, `anonymous_id`, `browsing_summary` (the page views the visitor
  left up to `occurred_at` on the site the channel names in `ChannelConfig.analytics_site_id`,
  newest 8 paths and the full `page_view_count`; `null` when the channel names no site),
  `consent`, `owner_strategy`
  (`OwnerChoice`: `existing_owner`, `fixed`, `owner_hint`, `rule_owner`, `default_owner`,
  `oldest_active_seat`), `took_over_from_user_id`, `took_over_by_user_id`,
  `seller_approval_required` (the rule's, read by simpl-outreach's `prefs_for_walk`),
  `playbook_section`, and the legacy aliases `source`, `kind`, `name`. `occurred_at` is the
  inbox row's.
- **Event:** every placed signal writes `inbound.lead.received`
  (`INBOUND_LEAD_RECEIVED_EVENT`, in `services.ingestion.base`) on the owner's connection in `outreach_events`, dated at
  the inbox row's `occurred_at`, with `inbox_id`, `connection_id`, `external_id`, `rule_id`,
  `action`, `origin` (the signal's `source`), `signal_name`, `signal_kind`, `company_id`
  (the connection's), and `event_id` / `capture_job_id` when the signal's properties carry
  them. Holders told of a takeover and `notify_only` signals get none.

## Reply Confidence settings and return to review

The Reply Confidence gate decides, for every inbound lead reply, whether SimpL sends its draft or asks the seller. A reply that clears its threshold is written `PENDING` with `scheduled_at` ten minutes ahead, `journey_log.auto_send_at` = `scheduled_at` (the queued state, below) and `payload.reply_confidence` (block `schema_version` 3, written by simpl-outreach) carrying `auto_approve: true`, what the stage decided. SimpL staff control it; the seller's consent is their own `outreach_prefs.auto_approval` (and its ICP overrides). There is no Python wrapper: call the SQL directly (`text()` with bound parameters). The maintainer applies the one migration, agents never do: `migrations/20261012_reply_confidence.sql` (not applied anywhere yet); its header says what it creates and how to apply it. Apply it before any service runs a `simpl_core` whose `JourneyLog` model has `auto_send_at`: every `select(JourneyLog)` reads that column.

**The queued state** is the column `sales_outreach.journey_log.auto_send_at timestamptz NULL` (`JourneyLog.auto_send_at`): the time a reply the pipeline queued to send on its own may leave, set by its writer and NULL on every other row. The BEFORE trigger `trg_journey_log_reply_confidence_auto_send_at` (on insert and on any update of `status`, `payload` or `auto_send_at`) keeps it only on a `PENDING` or `RUNNING` row (a sender's claim keeps it, a release back to `PENDING` too) whose `payload.authority.approved_by` is unset, and clears it on every other row, whoever moved it: return to review, the recall, the send-time checks, the email claim's hold, the dispatch authority rule, a send's completion, a seller's approval. When a queued reply leaves the queue for anything but the outcome of its own send (`COMPLETED`, `FAILED`, `ERROR`, the statuses `sales_outreach.mark_journey_log_completed` writes) and the write did not record the return itself, the trigger records it ("The audit trail" below). The trigger sorts after the other BEFORE triggers on `journey_log`, so it judges the status and the payload they settled on. What the block says (`auto_approve`) never makes a row queued.

Beside it, `journey_log.auto_send_draft_hash text NULL` is the draft a reply was queued with: when `auto_send_at` is set (by the insert, or by an update from NULL) the same trigger stamps it with `_reply_confidence_draft_hash(payload)`, the SHA-256 in hex of the JSON array `[payload.subject, payload.message]` (each `""` when missing); it keeps that value while the row stays queued, whatever a write puts in the column, and clears it with `auto_send_at`. Nothing else writes it, and no reader outside the send-time checks needs it.

**The block is written only by its owners**: the stage that scored the reply (simpl-outreach) and the moves above, which the database makes. The same holds for `payload.authority`, the dispatch authority rule's stamp and the approval it records. `JourneyLogRepository.update_payload_field` and `update_payload_fields`, the field-level editors, refuse a field naming `reply_confidence` or `authority`, or a dotted path under either (`reply_confidence.withdrawn`), before reading the row, and a batch naming one writes none of its fields: `ValueError("payload_field_not_writable: payload.authority, payload.reply_confidence")`, naming the keys the edit named (`assert_payload_fields_writable` and `OWNED_PAYLOAD_KEYS`, exported from `simpl_core.repositories.outreach`). `admin_override_fields` takes named fields only (channel, message type, status, scheduled time, content, subject), none of them either key. `update_payload` merges what it is given; a sender that spreads the payload back leaves both keys out.

**The table** `sales_outreach.reply_confidence_settings`: one row per scope, written by simpl_dashboard as `service_role`; sellers cannot read or write it.

| Column | Type | Meaning |
|---|---|---|
| `id` | uuid pk | |
| `scope` | text, `global` \| `customer` \| `user` | CHECKs tie the id columns and the value columns to it |
| `customer_id` | uuid, fk `sales.customer` on delete cascade | set on `customer` rows only |
| `user_id` | uuid, fk `sales."user"` on delete cascade | set on `user` rows only |
| `paused` | boolean | `global` row: pause everything |
| `auto_reply_enabled` | boolean | `customer` row: the customer switch |
| `email_enabled`, `linkedin_enabled` | boolean | `customer` and `user` rows |
| `threshold` | numeric(5,2), 0..100 | `customer` and `user` rows |
| `follows_customer` | boolean | `user` row |
| `updated_by` | uuid | the staff member who wrote it: the audit row's `user_id`, and `admin:<uuid>` as the recall's actor |
| `updated_at` | timestamptz | set on every update |

A value column belongs to the scopes the table names for it; on any other scope it must be NULL (`reply_confidence_settings_global_columns`, `..._customer_columns`, `..._user_columns`), so a `customer` row refuses `paused` and `follows_customer`, a `user` row `paused` and `auto_reply_enabled`, and the `global` row everything but `paused`.

At most one `global` row, one per `customer_id`, one per `user_id` (partial unique indexes `reply_confidence_settings_one_global` on `(scope) WHERE scope = 'global'`, `..._one_per_customer` on `(customer_id) WHERE scope = 'customer'`, `..._one_per_user` on `(user_id) WHERE scope = 'user'`; upsert with `ON CONFLICT (customer_id) WHERE scope = 'customer'` and so on). Missing rows are defaults: not paused; customer off, email off, LinkedIn off, threshold 90; the user follows the customer. A user's own flags and threshold stay stored while the user follows.

**The staff lookup** `sales_outreach.reply_confidence_settings_for(p_user_id uuid) RETURNS jsonb` (STABLE), the staff layers only:

```json
{"all_paused": false, "customer_id": "uuid or null", "customer_enabled": false,
 "email_enabled": false, "linkedin_enabled": false, "threshold": 90,
 "threshold_source": "default", "follows_customer": true}
```

- `email_enabled` / `linkedin_enabled` are effective: the customer's flag AND (`follows_customer` OR the user's own flag); a null flag is off. They fold in neither `customer_enabled` nor `all_paused`.
- `threshold` is the customer's when the user follows, else the user's own, falling back to the customer's when the user has none. `threshold_source` is `user`, `customer`, or `default` (90) when the customer has no threshold (no row, or null). Numbers come back without trailing zeros (`87.5`, `90`).
- An unknown user gets every per-customer and per-user default and `customer_id: null`; `all_paused` is the global row's for everyone.

**The resolver** `sales_outreach.reply_confidence_authorization(p_user_id uuid, p_icp_id uuid DEFAULT NULL) RETURNS jsonb` (STABLE) is the one answer to "may a reply to a lead of this user (and ICP) go out on its own?". The pipeline, the send-time check, the recall, simpl_api and the dashboard all ask it; do not re-derive seller consent elsewhere (and not with `parse_auto_approval_rules`, which uses `bool(...)`). It returns everything the staff lookup returns, plus:

```json
{"seller": {"enabled": true, "pause_on": false, "channels": ["linkedin_message", "email"],
            "icp_id": "uuid or null", "icp_restricted": false},
 "channels": {"email": {"allowed": true, "block": null, "block_kind": null},
              "linkedin_message": {"allowed": false, "block": "channel_off", "block_kind": "seller"}}}
```

Every layer must allow; each can only restrict; the first that refuses names the block:

1. the global pause → `all_paused`;
2. the customer switch → `customer_off`;
3. the channel's effective staff flag (`email_enabled` for `email`, `linkedin_enabled` for `linkedin_message`) → `channel_off`, `block_kind` `staff`;
4. the seller's `outreach_prefs.auto_approval`: `enabled` is JSON `true` (else `seller_paused` / `master_off`), `stop_on_lead_response` is JSON `false` (else `seller_paused` / `pause_on`), `channels` is an array holding the key (else `channel_off` / `seller`);
5. the lead's ICP (`sales.user_lead_connection.icp_id`; null applies nothing): when `outreach_prefs.icp_overrides[<icp_id>]` has an `auto_approval` key, its value must be an object (anything else, JSON `null` included, refuses both channels: `seller_paused` / `icp_restriction`), and every key present in it must pass the same test (`enabled`, `stop_on_lead_response` → `seller_paused` / `icp_restriction`; `channels` → `channel_off` / `seller`); an absent key inherits the base. An override entry that is not an object, or without `auto_approval`, restricts nothing. An override never widens what the base refuses.

Only exact JSON booleans count: `"true"`, `1`, `null` or a missing key are no consent. The delivery channel keys are exactly `email` and `linkedin_message` (`journey_log.payload.channel` on reply rows); any other channel (`linkedin_connect`, `call`, `calendar`, a different spelling, null) is never allowed: `channel_off` / `staff`, after layers 1 and 2. `seller.channels` is the base list (`[]` when missing or not an array); `seller.pause_on` is true unless the base pause is stored `false`; `icp_restricted` says whether the ICP layer alone refuses at least one channel.

**The one-channel wrapper** `sales_outreach.reply_confidence_send_block(p_user_id uuid, p_icp_id uuid, p_channel text) RETURNS text` (STABLE): NULL when allowed, else the block code (`all_paused`, `customer_off`, `channel_off`, `seller_paused`), the same layers in the same order.

**Queued** has one definition, used by every reader here and the predicate of the partial index `ix_journey_log_reply_confidence_queued` on `journey_log (auto_send_at)`, so a reader that writes it so scans the index:

```sql
jl.status = 'PENDING' AND jl.auto_send_at IS NOT NULL
```

The send-time checks judge a row with `auto_send_at` set, `PENDING` or `RUNNING`.

**The decisions index** `ix_journey_log_reply_confidence_created`, a partial index on `journey_log (created_at, id)` for `payload ? 'reply_confidence'`, holds only the rows that carry a block. It serves the monitoring reads of the decisions in a time window: a page newest first, keyset-paged on `(created_at, id)`, or an aggregate over the window. A reader, a view included, writes the predicate exactly so beside its bounds on `created_at`, and the planner then reads those rows alone instead of scanning `journey_log`:

```sql
jl.payload ? 'reply_confidence' AND jl.created_at >= $1 AND jl.created_at < $2
```

The owner of a queued reply is the user of the `user_lead_connection` the row names itself, `journey_log.ulc_id`, the same rule as `JourneyLogRepository.is_owned_by` and the email claim. Return to review, the counts and the recall all use it, so a reply any of them lists or counts is one its seller can return; a row with no `ulc_id` of its own (one only its `journey_run` ties to a seller) is nobody's to them. The send-time checks judge the row as the dispatch authority rule's owner (`journey_log.ulc_id`, else `journey_run.ulc_id`), the user it would be sent as.

**Return to review** `sales_outreach.reply_confidence_return_to_review(p_user_id uuid, p_reason text, p_journey_log_id uuid DEFAULT NULL, p_channel text DEFAULT NULL, p_actor text DEFAULT NULL) RETURNS uuid[]`:

- Moves a row only when it is queued, belongs to `p_user_id`, and matches `p_journey_log_id` / `p_channel` when given. `p_channel` is `email` or `linkedin` (every `linkedin*` channel); `p_reason` is `seller_returned` or `settings_changed`; `p_actor` is who returns it, `user:<uuid>` (the seller), `admin:<uuid>` (SimpL staff) or `system:<name>`, required despite its default; anything else raises `invalid_parameter_value`.
- In one UPDATE: status `PENDING_APPROVAL`; `auto_send_at` NULL; `scheduled_at` = `least(scheduled_at, now())`, so an approval after the return goes out at once; in `payload.reply_confidence`: `withdrawn: {"reason", "at" (ISO), "by": p_actor}`, `{"code": p_reason, "class": "policy", "text_key": p_reason, "detail": ""}` appended to `reasons`, and `top_reason: {"code": p_reason, "text_key": p_reason, "params": {}}`; what the stage decided (`auto_approve`, `route_kind`, the score) stays as it was, and a payload without a block gets one holding the reason alone. Nothing else in the payload changes, except `payload.authority`, which the dispatch authority trigger refreshes on the way into `PENDING_APPROVAL`. The recall and the send-time check use the same rewrite (one helper, `_reply_confidence_withdraw`), with reason `settings_changed` and `detail` = the block code, or, for a block that does not hold, reason `auto_approval_invalid`, and for a draft that changed since it was queued, reason `draft_changed`, each with `detail` `""`; so does the clearing trigger for every other move ("The audit trail" below).
- Writes one `reply_confidence.returned_to_review` event per row moved (see "The audit trail" below).
- Returns the ids moved, `{}` when none: a row a sender already picked up is `RUNNING`, one the seller approved or one already returned does not match. The authority trigger may still settle a moved row on `CANCELLED` (objective closed, user gone). simpl_api turns an empty array into its 409 `not_returnable`; check the row is the caller's first (404), because the function trusts `p_user_id`.

**The recall** re-evaluates each queued reply of the users a change reaches with its own ICP and channel through `reply_confidence_send_block`, and returns to review (`settings_changed`, `detail` = the block) only the ones no longer allowed. It moves `PENDING` rows only, never a claimed (`RUNNING`) one, and never queues anything again when a restriction is lifted.

- A settings row insert, update or delete reaches every user with something queued (global row), the customer's users (customer row) or the user (user row). It reads the current values only, so it is idempotent and a threshold change alone recalls nothing. The actor (`withdrawn.by`) is `admin:<updated_by>`, or `system:reply_confidence_settings` on a delete or a row without `updated_by`.
- An update of `sales."user".outreach_prefs` that changes `auto_approval` or `icp_overrides` reaches that seller; the actor is `user:<seller id>`. A restriction on ICP A leaves ICP B's replies queued; a channel taken out of the list recalls only that channel.
- The recall never fails or stalls the write that fires it. Each trigger runs it inside `BEGIN ... EXCEPTION WHEN OTHERS`: an error rolls back the recall alone (every move of that recall) and raises a `WARNING` (`recall skipped (<SQLSTATE>: <message>)`), and the settings or prefs write commits. The recall runs with a short `lock_timeout`, so a queued row another transaction holds locked (a sender's claim) ends it with `55P03` instead of making the write wait. Replies a skipped recall left queued are judged against the new values by the send-time check before any send.
- Each move writes one `reply_confidence.recalled` event; a recall rolled back takes its events with it.

**The send-time checks.** `sales_outreach.recheck_journey_log_authority` (the executor's last call before the provider, wrapped by `JourneyLogRepository.recheck_send_authority`; simpl_flow's email sender and the LinkedIn guard call it) first judges a queued reply (`auto_send_at` set), after the cancel step. One whose block does not carry the stage's approval (an object with `auto_approve` JSON `true` and a numeric `schema_version` of 3 or more) can never go out on its own and goes, `PENDING` or `RUNNING`, back to `PENDING_APPROVAL` with the same rewrite (reason `auto_approval_invalid`, `detail` `""`): `{"outcome": "review", "reason": "reply_confidence_auto_approval_invalid", "status": "PENDING_APPROVAL"}`. So does one whose draft is not the one it was queued with (`_reply_confidence_draft_hash(payload)` differs from `auto_send_draft_hash`: the subject or the message was edited since, by the seller, staff or any writer), whatever its delay: reason `draft_changed` (also its `text_key`), `detail` `""`, `{"outcome": "review", "reason": "reply_confidence_draft_changed", "status": "PENDING_APPROVAL"}`; the edited draft stays for the seller to approve. While `auto_send_at` is ahead, a claimed row goes back to `PENDING` with `scheduled_at` no earlier than `auto_send_at`, so the claim takes it again once it may leave, `{"outcome": "release", "reason": "reply_confidence_undo_window_open", "status": "PENDING"}`, and a `PENDING` row is left as it is, `{"outcome": "skip", ...}`. The authority trigger judges either move on the way and may settle the row on `PENDING_APPROVAL` (`"review"`) or `CANCELLED` (`"cancel"`). It then judges a queued reply, `PENDING` or `RUNNING`, after the seat check: if `reply_confidence_send_block(owner, lead ICP, payload.channel)` refuses, the row goes back to `PENDING_APPROVAL` in the same statement with the same rewrite, and the call answers `{"outcome": "review", "reason": "reply_confidence_settings_changed", "detail": <block>, "status": "PENDING_APPROVAL"}` (`"cancel"` / `"CANCELLED"` when the authority trigger cancelled it on the way). Each of these moves to review carries the actor `system:send_time_check` and writes one `reply_confidence.withdrawn_at_send` event; the release and the skip write none. A cancel request and a switched-off seat still answer first. Every other row, a returned reply the seller approved again included, is judged as before; nothing reads `payload.response_automation` for it. The guarantee: a restrictive setting visible to the last recheck prevents the send; a provider call already allowed may finish. The LinkedIn pre-send guard calls the recheck after its own checks and reports these answers as `block_reason` `authority_reply_confidence_undo_window_open`, `authority_reply_confidence_auto_approval_invalid`, `authority_reply_confidence_draft_changed` and `authority_reply_confidence_settings_changed`.

**The audit trail.** Every move of a queued reply out of the queue for anything but its send is recorded as a return, in the same transaction: the rewrite above (`withdrawn`, `reasons`, `top_reason`) and one `sales_outreach.outreach_events` row, `event_type` `reply_confidence.returned_to_review`, `reply_confidence.recalled` or `reply_confidence.withdrawn_at_send` for the moves above, `reply_confidence.left_queue` for any other; `event_status` `success`; `action_id` the journey_log id; `ulc_id`, `user_id` and `lead_id` of the connection the row is sent for (`journey_log.ulc_id`, else its run's; null when the connection is gone); `agent_type` the row's `action_type`; and

```json
{"journey_log_id": "uuid",
 "reason": "seller_returned | settings_changed | auto_approval_invalid | draft_changed | send_hold | dispatch_authority | cancelled | completed_externally | approved | held_for_review",
 "detail": "<see the reason, or empty>", "actor": "user:<uuid> | admin:<uuid> | system:<name>",
 "previous_status": "PENDING | RUNNING", "new_status": "<the status the row settled on>"}
```

The same reason and actor are `payload.reply_confidence.withdrawn.reason` and `.by`, and the reason is the `code` and the `text_key` of the reason appended to `reasons` and of `top_reason`. Any move whose write left `withdrawn` unchanged is recorded by the clearing trigger (`reply_confidence.left_queue`), with the reason of the move:

- `send_hold`: the email claim's hold handed it back (`payload.send_hold`); `detail` its reason (`auto_approval_off`, `approval_lapsed`, `mailbox_reconnected`); actor `system:email_send_hold`.
- `dispatch_authority`: the dispatch authority rule held it for review or cancelled it (`payload.authority.outcome` `review` or `cancel`), at a sender's claim, at the send-time recheck or on a cancel request there; `detail` the rule's reason (`account_handed_off`, `cancel_requested`, ...); actor `system:dispatch_authority`.
- `cancelled`: any other writer cancelled it; `detail` `payload.cancellation.reason`, `""` when none; actor `system:other_writer`.
- `completed_externally`: it was marked `EXECUTED`, done outside the pipeline (`JourneyRepository.mark_action_completed_externally`, e.g. the seller sent it from their own inbox); `detail` `payload.external_completion.reason`; actor `system:other_writer`.
- `approved`: an approver was stamped on it while `PENDING` or `RUNNING`; `detail` `""`; actor `system:other_writer`.
- `held_for_review`: any other move; `detail` the new status; actor `system:other_writer`.

So a reader decides from the row alone: `withdrawn` set → returned (its reason says by what); `auto_send_at` set on a `PENDING` or `RUNNING` row → queued; `auto_approve` true on an ended row without `withdrawn` → sent on its own.

Every insert, update or delete of a `reply_confidence_settings` row writes one `sales.audit_log` row: `operation` `reply_confidence_settings_insert` / `_update` / `_delete`, `table_name` `sales_outreach.reply_confidence_settings`, `record_count` 1, `user_id` the row's `updated_by` (null on a delete), and `details` (text) `{"scope", "customer_id", "user_id", "changed": {<column>: {"from", "to"}}}` naming the value columns that changed (`paused`, `auto_reply_enabled`, `email_enabled`, `linkedin_enabled`, `threshold`, `follows_customer`); an update that changes none of them writes nothing.

**The counts** `sales_outreach.reply_confidence_queued_counts(p_customer_id uuid DEFAULT NULL) RETURNS TABLE (user_id uuid, channel text, queued bigint)` (STABLE): queued replies per seller and `payload.channel` as stored, aggregated in the database, for one customer or (NULL) all.

**What a change would do** `sales_outreach.reply_confidence_what_if(p_customer_id uuid, p_change jsonb DEFAULT '{}') RETURNS jsonb` (STABLE) answers, for one customer, what a settings change would do, without making it. The dashboard's switch-on and recall previews ask it instead of computing the layers themselves.

- `p_change` is `{"customer": {<column>: <value>}, "users": {"<user id>": {<column>: <value>}}}`, both parts optional: what the upsert of the customer's row and of each user's row would write, every other column kept. The customer's columns are `auto_reply_enabled`, `email_enabled`, `linkedin_enabled` and `threshold`, a user's `follows_customer`, `email_enabled`, `linkedin_enabled` and `threshold`; each value is a JSON boolean (a number for `threshold`) or `null`, read through the table's column types (a threshold keeps two decimals). The table's CHECKs, such as the threshold's 0 to 100, stay the write's to enforce. An unknown customer raises `no_data_found`; a malformed change, or a user of another customer, `invalid_parameter_value`.
- The users reached are the ones the recall would judge after those writes: every user of the customer when the change names the customer's row, else the users it names, ordered by id. Users with a banned login are listed like the others; leaving them out is the caller's choice.
- The answer:

```json
{"customer_id": "uuid",
 "customer": {"before": {"all_paused": false, "customer_enabled": false, "threshold": 90, "...": "..."},
              "after": {"...": "..."}},
 "users": [{"user_id": "uuid",
            "before": {"settings": {"...": "..."},
                       "channels": {"email": {"allowed": false, "block": "customer_off", "block_kind": null},
                                    "linkedin_message": {"...": "..."}}},
            "after": {"settings": {"...": "..."}, "channels": {"...": "..."}},
            "seller_allows": {"email": true, "linkedin_message": false},
            "returned": 1}],
 "returned": 1}
```

- `customer` is the staff lookup of a user who follows the customer: the customer's switch, flags and threshold, the default threshold when none is stored. Each user's `settings` and `channels`, `before` and `after`, are what `reply_confidence_settings_for` and `reply_confidence_authorization` (no ICP) answer before the change and once it is made. `seller_allows` is the seller's own consent alone (layer 4) per channel, what a staff switch-on can start. `returned` is how many of the user's queued replies the recall would then return to review, each judged with its own ICP and channel: every queued reply the settings refuse after the change, one refused already included, as the recall moves it; the top-level `returned` is their sum.

**The settings screen in one read** `sales_outreach.reply_confidence_settings_overview(p_customer_id uuid DEFAULT NULL) RETURNS jsonb` (STABLE) answers everything the dashboard's settings screen shows, so it makes one call instead of reading the rows, the logins and each user's answers one by one:

```json
{"default_threshold": 90,
 "global": {"scope": "global", "paused": false, "...": "..."},
 "customer": {"id": "uuid", "name": "text",
              "row": {"scope": "customer", "auto_reply_enabled": true, "threshold": 85.00, "...": "..."},
              "settings": {"all_paused": false, "customer_enabled": true, "threshold": 85,
                           "threshold_source": "customer", "...": "..."}},
 "users": [{"id": "uuid", "full_name": "text", "email": "text", "is_active": true, "disabled": false,
            "row": null,
            "settings": {"...": "the staff layers"},
            "channels": {"email": {"allowed": true, "block": null, "block_kind": null},
                         "linkedin_message": {"...": "..."}},
            "seller": {"enabled": true, "pause_on": false, "channels": ["email"],
                       "allows": {"email": true, "linkedin_message": false}},
            "icp_overrides": [{"icp_id": "uuid", "restricted": true,
                               "channels": {"email": {"...": "..."}, "linkedin_message": {"...": "..."}}}],
            "ignored_icp_consent": [{"icp_id": "uuid", "icp_title": "text", "channels": ["email"]}]}],
 "queued": [{"user_id": "uuid", "channel": "email", "queued": 2}]}
```

- `default_threshold` is the staff lookup's threshold for a user with no settings anywhere (the `default` source), so nobody asks `reply_confidence_settings_for` with an unknown user to learn it.
- `global`, `customer.row` and each user's `row` are the stored `reply_confidence_settings` rows (every column, `to_jsonb`), `null` when there is none. `customer.settings` is the staff lookup of a user who follows the customer: its switch, flags and threshold, the default when none is stored (`reply_confidence_what_if`'s `customer.before`).
- `users` are every user of the customer, ordered by `full_name` (nulls last), then `id`. `disabled` is true while their Supabase login is banned (`auth.users.banned_until` in the future); a user without a login is not disabled. Disabled users are listed like the others; leaving them out of lists and counts is the caller's choice.
- Each user's `settings`, `channels` and `seller` (`enabled`, `pause_on`, `channels`) are what `reply_confidence_authorization(user)` answers, with no ICP; `seller.allows` is, per channel, whether the seller's own consent alone (layer 4) lets a reply go, `reply_confidence_what_if`'s `seller_allows`. `icp_overrides` has one entry per key of `outreach_prefs.icp_overrides` that is a uuid, ordered by it: `restricted` and `channels` are `reply_confidence_authorization(user, icp)`'s `seller.icp_restricted` and `channels`. A key that is no uuid matches no lead's ICP and is left out.
- `ignored_icp_consent` lists, ordered by `icp_id`, each of those ICPs whose override's `auto_approval`, merged key by key over the base `outreach_prefs.auto_approval`, allows a channel that the base alone refuses, both judged by the seller-consent rule the resolver applies to the base (`enabled`, `stop_on_lead_response`, `channels`). `channels` are those channels, `email` before `linkedin_message`; `icp_title` is the ICP's `sales.icp.title`, `null` when there is none. The resolver judges the base first and an ICP override only restricts it, so no reply for such an ICP goes out on its own on those channels; the outreach routing and the email send hold (`JourneyLogRepository.hold_unconfirmed_email_sends_for_user`) read the merged preferences, so that ICP's auto-approved messages still go out without the seller. It does not depend on the staff layers: like `seller.allows`, it says what a staff switch-on would not start. A user without such an override has `[]`.
- `queued` is `reply_confidence_queued_counts(p_customer_id)` as rows.
- With `p_customer_id` NULL the answer is the global part alone: `customer` null, `users` `[]`, and `queued` over every customer. An unknown customer raises `no_data_found`.

**Grants.** The table (`SELECT, INSERT, UPDATE, DELETE`) and `reply_confidence_settings_for`, `reply_confidence_authorization`, `reply_confidence_send_block`, `reply_confidence_return_to_review`, `reply_confidence_queued_counts`, `reply_confidence_what_if`, `reply_confidence_settings_overview` (`EXECUTE`) are granted to `service_role` only; `PUBLIC`, `anon` and `authenticated` have nothing, and the internal helpers (leading underscore) and trigger functions are granted to nobody. simpl_api and simpl-outreach connect as the owner. The functions are `SECURITY DEFINER` with `search_path = pg_catalog` and run as the role that applied the migration (`postgres`), which `reply_confidence_settings_overview` needs to read `auth.users` past its row-level security.

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
coordinator) — there is no `background_write_spec_for` callback any more. A typed-policy
extractor with no host resolver runs on `default_llm_client_resolver()`; a bare-name one
with no `llm_client` gets a logged, isolated failure rather than a silent no-op.

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
- Does not score or orchestrate the Reply Confidence gate (the confidence, the threshold, the decision). That is simpl-outreach; `simpl_core` owns only its settings table, the SQL functions and triggers around it, and the send-time check.

## Where to go next

- Source: `https://github.com/simpl-techs/simpl_core`
- Internal conventions: `.agent/INTERNAL.md`

ROI categories live in `roi.categories` (`RoiCategory`, `roi.categories.CategoryRepository`).
The database owns labels, ordering, default lag/ranking and `allows_time`; the survey
catalog filters on that flag. New categories require data, not a Python enum.
