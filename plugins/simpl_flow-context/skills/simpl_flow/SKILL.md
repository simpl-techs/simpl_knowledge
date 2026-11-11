---
name: simpl_flow
description: |
  Use this skill whenever the user asks about simpl Prefect flows, lead generation pipelines, job offer/company enrichment, ICP workflows, onboarding/customer-success pipelines, opportunity scoring/matching, or code that imports `simpl_flow`. This is primarily a workflow service repo.
---

# simpl_flow integration guide

> **Maintained by**: the `simpl_flow` repo, auto-synced to simpl_knowledge.
> **Source of truth**: `simpl-techs/simpl_flow/.agent/SKILL.md`

## What this service is

`simpl_flow` contains Prefect flows, pipelines, bots, and AI services for sales intelligence: job-offer analysis, company enrichment, ICP workflows, opportunity matching/scoring, onboarding, customer success, embeddings, and scheduled workflow execution.

## Installation

```bash
conda env create -f environment.yml
conda activate simpl_flow
poetry install
cp .env.example .env
```

This repo is normally run as workflows/deployments, not imported as a generic library.

## Basic usage

```bash
conda activate simpl_flow
prefect cloud login
poetry run prefect deploy --all
```

Only deploy when the user explicitly asks. For code changes, work under `src/simpl_flow/flows`, `pipelines`, `services`, or `bot`.

## Rules and conventions

- Keep reusable business/domain logic in `simpl_core` when it is needed outside workflow execution.
- Keep workflow orchestration in flows/pipelines; keep provider/database details behind services/repositories.
- Use `simpl_tracker` for tracking/logging and `simpl_orm` for shared database patterns.
- `gcp_post_search_index_flow` (every five minutes) adds new posts to `sales.post_search_index` (migration 065) by reading
  `sales.post` / `sales.post_repost` (no trigger or index on them), claims pending rows,
  builds and embeds post records (Nebius, Qwen3-Embedding-8B), commits them to the row
  store on GCS, and with a collection keeps that Zilliz collection in step. A backlog
  (a backfill marks every post) drains through the schedule; by hand with
  `promote_alias` it moves that alias to the collection once caught up. The logic lives in simpl_core (`row_store`, `search.posts`);
  needs the Doppler `ROW_STORE_URI`, `NEBIUS_API_KEY` and `MILVUS_*` keys; the job's
  service account reaches the bucket (no Google key in the environment). Alerts are
  the shared search index ones (below).
- `gcp_landing_search_index_flow` indexes company websites as the crawl stores them, one
  document per site, into `landing_pages:1:4096` and the Zilliz collection
  `landing_pages_v1` (alias `landing_pages`; ledger `sales.landing_search_index`,
  migration 075). Two modes sharing the ledger, so neither redoes the other's work:
  a **scoped run** (manual: `{"scope_name": "italy", "scope_countries": ["ITA", "IT"]}`,
  or `{"scope_name": "all"}` for every company) indexes exactly that scope, on its own
  cursor; the **general run** (the defaults, and the 5-minute schedule, off until a
  scope is indexed) follows the crawl for the sites already in the ledger and indexes
  what changed, adding none. Each site's markup (its elements with the text left out,
  for substring searches) goes to `landing_markup:1` (no vectors, an NGRAM index on
  `markup`, migration 107) when that dataset is configured; a markup change alone
  rewrites only markup rows. Reads only the crawl's tables; bodies come from the
  crawl's bucket (`simpl-web-pages`) through the Doppler `WASABI_ACCESS_KEY` and
  `WASABI_SECRET_KEY` keys. The logic lives in simpl_core (`search.landing` on
  `search.index`, installed through `simpl-core[search]`). Alerts are the shared
  search index ones (below): a scoped run is started by hand, so its failure posts at
  once. A batch that fails to load is retried after 15 s, 1 min and 4 min first.
- `gcp_company_search_index_flow` indexes every company with a description into
  `sales_companies:1:4096` and the Zilliz collection
  `sales_companies_v1` at 1024 dims (ledger `sales.company_search_index`, migration
  083), replacing the never-refreshed `sales_companies_hybrid`: once validated, that
  collection is renamed away and `sales_companies_hybrid` and `sales_companies` become
  aliases of `sales_companies_v1`, so readers keep their collection name. The
  collection is a strict projection of the row store: nothing else writes to it (the
  article bot stopped uploading the companies it creates in 2.5.82; the index finds
  them by created_at). Each run discovers new and changed companies
  (`CompanyScanner`: a one-off walk of every company, then the created_at/updated_at
  cursors with fingerprints) and indexes until the queue is empty; the nightly
  maintenance sweep removes companies merged away. Reads `sales.company` only, with no
  trigger or index added. The logic lives in simpl_core (`search.companies`). The
  schedule runs every 5 minutes (on since 2.5.67); nothing reads `sales_companies_v1`
  until the alias is promoted by hand once the backfill is validated.
- `gcp_website_facts_search_index_flow` (every 5 minutes once live; 2.5.248) indexes what
  each company website runs and shows (`sales.website`, `sales.website_technology`,
  written by simpl_scraping's website signals extractor and crawl) into
  `website_facts:1` (no vectors: a keyword-only kind) and the Zilliz collection
  `website_facts_v1` (typed filter fields and BM25, no embeddings; ledger
  `sales.website_facts_search_index`, migration 170, which also adds its
  `row_store.dataset_configs` row). Each run follows finished `website_signals` jobs
  (`scraping.extraction_jobs`) from where the last one stopped, and indexes until the
  queue is empty (at most 10 follow rounds a run). The follow pass starts at "now", so
  the website facts sweep (every site by host, fingerprinted again) is what fills it the
  first time; it is also what sees every other change, a day late at most: the crawl
  writer's site row, `website-risk apply`, sites gone (simpl_core 0.8.304 dropped the
  pass on `sales.website.updated_at`, which read the whole table: no index covers it).
  It creates the collection, never moves the
  `website_facts` alias: that is promoted by hand once the index check is clean. Reads
  only; no trigger or index on the website tables. Needs the Doppler `ROW_STORE_URI`
  and `MILVUS_*` keys (no Nebius key: nothing is embedded). The logic lives in
  simpl_core (`search.website_facts`). A host the ledger refuses as a key (a
  `#`, upper case, a `/`) is skipped and logged (`website_facts.scan_host_skipped`) and
  counted (`skipped`) in the run's and the sweep's summaries; the index check leaves such
  hosts out. **It shipped off**: its schedule
  was inactive and 170 seeds `"sweep": false`, until the go-live steps in the README
  ("Website facts search"). Its schedule was switched on by a PR that sets
  `active: true` (2.5.249, go-live step 3), never resumed by hand:
  every deploy recreates schedules from `prefect.yaml`. Size (production 2026-11-06,
  `pg_class.reltuples`): about 220,000 sites and 1,885,000 technology rows, so about
  2.1M index rows, 9.6 a site. Its rows are narrow, so it commits groups of 16 MiB
  (`params.index.commit_bytes`, migration 177; every other kind keeps simpl_core's
  64 MiB) and runs in 2 GiB (2.5.261): at 1 GiB with 64 MiB groups, the first fill was
  killed before its first commit (2026-11-06).
- **The website facts index check** is a step of `search_index_maintenance_flow`
  that a run names (`checks: ["website_facts"]`), run after everything else, in the
  `gcp_search_index_sweeps` deployment. It calls
  simpl_core's `run_website_facts_index_check` (`search.website_facts`; the check's
  parts and rules are documented there) on the collection the active `website_facts`
  row names (`configured_collection`). Its report is the run's result
  (`checks.website_facts`) and a warning log when it has differences
  (`website_facts_search.index_check`); it posts to #data-lake only with
  `announce_checks: true` (default false). No schedule runs it: by hand until go-live
  (`prefect deployment run search_index_maintenance_flow/gcp_search_index_sweeps
  -p 'checks=["website_facts"]'`), then weekly in Monday's nightly sweep run, by a PR
  (README, "Website facts search", go-live step 8). Differences do not fail the run; a
  check that cannot look does.
- **Which dataset each search index flow writes, and how, is `row_store.dataset_configs`**
  (simpl_core migration `20261009_row_store_dataset_configs.sql`, seeded by migration
  084; website facts by 170), not deployment parameters. Each kind (`posts`, `landing`,
  `companies`, `website_facts`) writes
  its `active` row's dataset (`name:version:dims`) with the settings under
  `params.index` (the flow's `SETTINGS`: collection, collection_dims, batch sizes,
  concurrency, and for website facts `commit_bytes`, the commit group size
  `index_batches` passes to simpl_core's `BatchPipeline`); a value a run passes still
  wins, so a version built by hand is
  `-p dataset=<name:version:dims>`. A key no flow reads fails the run. Moving a kind to
  a new version, adding a dataset or changing a setting is an `UPDATE`/`INSERT` on that
  table, picked up by the next run, with no deployment.
- `gcp_search_index_maintenance_flow` maintains every `active` and `maintained` row of
  `row_store.dataset_configs` (posts, landing pages, companies, website facts): compaction, index
  segment merges and a week of versions, every 15 minutes, with each row's
  `params.maintenance` (`MAINTENANCE_SETTINGS`: `sweep`, `target_rows_per_fragment`,
  `max_rows`, `cleanup_older_than_days`, `stalled_after_minutes`, and `deferred_indexes`:
  declared indexes left unbuilt on purpose, which health does not report, e.g. landing's
  `text_idx` until a backfill ends, migration 117). It sweeps nothing. The same flow's
  second deployment, `gcp_search_index_sweeps` (`datasets: []`, so no dataset and no
  writer lease; 1 vCPU, 2 GiB, a 4-hour job guard), runs at 02:30 UTC (`sweep: true`)
  the sweep of every active kind that has one (posts: the posts that changed or went
  away; companies: those merged away, a slice fingerprinted again; website facts: every
  site fingerprinted again), unless the row sets `sweep: false` (website facts until
  go-live). The sweeps wait on Postgres; until 2.5.251 they ran in the maintenance
  deployment's nightly run, and a loaded database made that run outlast its one-hour
  job (2026-11-06). Each sweep logs `search_index_maintenance.sweep_started` as it
  starts, and its summary when it ends. A run can still name `datasets` and `sweeps` itself (`sweeps` runs a sweep
  its row turns off), and index `checks` (`CHECKS`: `website_facts`), which only a run
  that names them runs, last, posting with `announce_checks` only. A new kind adds a
  spec to `KINDS` (`search_index_runtime`; a kind with no vector is named there like
  `website_facts`), a sweep to `SWEEPS` and a check to `CHECKS` if it needs them.
  A sweep, dataset or check that fails does not stop the others; the run then fails
  naming each one (`MaintenanceFailed`). A row the code cannot read (a kind it does not know,
  dims that do not fit its kind, an unknown setting) is left out and the rest are
  maintained; the first run of each hour posts the rows left out to #data-lake
  (`announce_skipped_configs`, gated by `health_alert_due`), and every run returns them
  under `skipped`.
- **Data lake alerts go to #data-lake** (posts, landing, companies and website facts index flows,
  maintenance and its website facts index check when it announces, graphia v2 and the opportunity matcher; `services/run_health.py`,
  `services/search_index_health.py`), through simpl_core's `data_lake_alert`: errors and
  warnings only, never success. Without `DISCORD_DATA_LAKE_WEBHOOK_URL`, or when Discord
  does not take a message, they go to #error or #warning instead.
  - **A run that failed (error):** a run started by hand posts its own failure at once;
    a run its schedule started leaves it to the next run, which posts when the
    deployment's runs keep failing (second failure in a row, then every fourth). A run
    killed for memory is caught the same way.
  - **Documents that failed for good (warning)** (their fifth failure, or a text too
    long to embed; they stay `failed` until they change again): once per index run,
    with the ledger to read.
  - **Hourly, from maintenance (warning):** a row store table maintenance does not keep
    up with (`Dataset.health`, a segment heal that failed), and for each `active`
    dataset an index that does not keep up (`read_index_progress`): documents due and
    no commit for `params.maintenance.stalled_after_minutes` (60 by default; 0 turns it
    off, as migration 085 does for landing while its runs are held), or a Zilliz
    projection that far behind the store. The frozen `graphia_extractions` (kind
    `extractions`) has no progress check: its old ledger,
    `knowledge_graph.extraction_index`, is Graphia v2's queue, and a stopped v2 run
    read as this dataset's stalled index. `search_index_maintenance.health` and
    `.progress` log them every run.
- `gcp_memory_projection_flow` runs every five minutes and incrementally applies
  pending `agent_memory` revisions to Zilliz. It requires `NEBIUS_API_KEY`,
  `MILVUS_URI`, and `MILVUS_TOKEN`; do not replace it with routine collection
  rebuilds.
- `gcp_search_index_maintenance_flow` keeps the vector, full-text and substring (NGRAM)
  indexes a simpl_core dataset spec declares as sections (simpl_core 0.8.155; NGRAM,
  sized by bytes, from 0.8.159): every run, after every dataset's routine maintenance
  (2.5.117: a build killed for memory no longer leaves the datasets after it
  unmaintained), and after
  compaction, calls `Dataset.build_index(column, create=False)` on each index the table
  has, which builds its next sections from at most 4M rows (a backlog takes a run per
  4M; the writer lease is held meanwhile, so an indexer commit waiting past its
  `lease_wait` defers its batch). An index a table does not have yet is created by a
  manual run, `build_indexes` (with `datasets`), with memory for a first vector build's
  training (`--job-variable memory=8Gi`); the health check reports it as unbuilt until
  then. The deployment runs at 2 vCPUs and 4 GiB for the section builds.
- `gcp_verify_shortlist_candidates_flow` (no schedule, started by simpl_api) verifies a
  page of an ICP's shortlist candidates: parameters `icp_id`, `company_ids` (the ones
  simpl_api marked `checking` in `opportunity.icp_company_verdict`, migration 119) and
  `customer_id` (cost attribution). It runs the nightly verification on them, assigns
  nothing, and writes each verdict (`pass`, `reject`, `skipped`) with its reason.
- `gcp_opportunity_matcher_flow` (no schedule, started by hand) is the new ICP, signal
  and opportunity matcher, in shadow: Postgres and today's opportunity pipeline are
  untouched. It matches `icp_ids` (every ICP with an active definition when none) under
  `variant`: the agent framework walks policy `opportunity_matcher_root` (seed migration
  098) once per ICP, on the row store's datasets (`pipelines/intelligence`: every active
  dataset as a DuckDB view), and writes the row store datasets `icp_fit:1`,
  `signal_hits:1` and `opportunities:1` (migration 096). Definitions are written in the
  matchers' DSL (simpl_core `opportunity_matcher.dsl`) and stored as versions in
  `opportunity.icp_spec` / `opportunity.signal_spec` (migration 095), added with
  `python -m simpl_flow.pipelines.opportunities_v2 spec-add`. Query texts are embedded
  with `NEBIUS_API_KEY`; nothing goes to Zilliz. The lake reads through DuckDB's `lance`
  extension, which the image installs (`DUCKDB_EXTENSION_DIRECTORY`). Plan and status:
  `docs/knowledge-graph-matchers-plan.md`.
- The lake also has four Postgres tables copied as they are (`table_copy_flow`,
  migration 186; deployments `gcp_locations_copy`, `gcp_company_headcount_copy`,
  `gcp_company_funding_copy`, `gcp_company_crustdata_copy`, nightly at 01:10-01:25 UTC):
  views `locations` (`geolocation.locations`: `city`, `region`, `province`, `country`,
  `cap`, `is_failed`, keyed by the location's id), `company_headcount`
  (`linkedin_headcount`, `yoy_growth_percent`, `by_role_percent` and
  `total_growth_percent` as JSON text, `updated_at`), `company_funding`
  (`days_since_last_fundraise`, `last_funding_round_investment_usd`,
  `last_funding_round_type`, `acquired_by` and `acquisitions` as JSON text,
  `updated_at`) and `company_crustdata` (`year_founded` as text, `hq_country`,
  `company_type`), each keyed by the company's id. A copy's settings are its row's
  `params.copy` (simpl_core `COPY_SETTINGS`); a run takes `settings` to override them.
- `gcp_sales_articles_fill` (hourly) fills every company's articles, any age, into
  `sales_articles` version 2 (migration 186; maintained, not active, not projected), as
  `gcp_sales_job_offers_fill` does the job offers.
- `gcp_workpool_autoscaler_flow` (every five minutes; the schedule ships on, so it is deployed
  once the pool exists)
  is one tick (simpl_core's `workpool.autoscaler.tick_fleet`, one at a time under a lease)
  over every queue and pool of the fleet's topology (`workpool/worker_pools.yaml`; it lists
  only provisioned pools, today `generative` alone, on the `model_requests` queue): it
  recovers each queue's expired leases, sweeps its rows past their deadline, and sets each
  pool's instance count from its model's rows, asleep at zero while the model has none.
  Each tick then posts the due incidents (`workpool.incidents`) on the topology's alert
  route, `data_lake` (simpl_core's `DataLakeNotifier`): errors and warnings on #data-lake,
  info ones only logged; a failure streak of the autoscaler's own runs is announced there
  too. A v2 run that stops because a backend gave no answer (a pool that never answers
  records no incident) posts one warning there (`announce_no_answer`). A new queue is an
  entry under `queues:`, its table and a pool claiming from it, plus the runner its
  instances run; the autoscaler needs no change. Every pool runs one runtime: llama.cpp's
  CUDA server, started by the instance on its GPU for the variant its release names
  (`consume --pool <pool> --release <variant>`, a variant of the extraction
  `variants.yaml`, which names the model's weights as a Cloud Storage object and its
  sha256). No image holds a model: the generic pool image (`simpl-flow-generative-pool`,
  the Dockerfile's `generative-pool` target on `pool-runtime`: code and llama.cpp) is the
  base each variant's image (`simpl-flow-pool-<variant>`) adds its weights to as one layer
  (`Dockerfile.pool-variant`, at `/opt/models/<sha256>/<file>`, where the weights loader
  reads first); `python -m simpl_flow.pipelines.knowledge_graph.serving image --pool <pool>
  --release <variant> --tag <tag>` builds and pushes both, the weights taken
  from Cloud Storage. Another model is another variant, its image and a pool deployed with
  it. `serving load` drives a pool's table. `python -m simpl_flow.workpool` (simpl_core's
  `workpool.cli` over the topology) has `status`, `scale`, `check`, `redeploy`, `provision`
  and `autoscale`, each deploy naming every pool's release (`--release
  generative=nuextract3-gpu`) and the tag its image was built with. It needs simpl_core's
  workpool migrations and migration 155 applied. The `generative` pool (one L4, image
  `simpl-flow-pool-nuextract3-gpu`) runs NuExtract3 for the `joint` rows of variant
  `graphia-v2-nuextract-joint` and the check tier's `verify` rows; an instance whose server
  lists no GPU stops before it is ready. Its deployment, step by step:
  `docs/knowledge-graph-nuextract-gpu.md`.
- `gcp_graphia_v2_flow` (no schedule, started by hand on keys marked by hand) runs the
  scaled knowledge graph pipeline (`pipelines/knowledge_graph/v2`). It marks `source_keys`
  (`p:<post id>`, `h:<host>`) with `priority` for the v2 variant (`v2/variants.yaml`:
  `graphia-v2-nuextract-joint`, the only one, on ontology `o3` (the pool reads
  whichever ontology a request names, so changing it needs no pool redeploy): NuExtract3's `joint` step (ner, pick and fill as one call) served
  by the `generative` pool's L4s, one call per document, the job writing its documents
  into `knowledge_graph.model_requests` and reading the mentions and facts back, three batches in
  extraction at once; a variant runs the joint step only, so every run writes entities
  and the forms they fill (the entities-only variant was removed 2026-11-06); no model
  runs in the job,
  and there is no deployment per variant or pool; the GLiNER2 and in-job NuExtract
  variants were removed 2026-11-04, their runs stay in the log), works its due rows of `knowledge_graph.extraction_index` into the append-only
  extraction log (`kg_*` datasets under `ROW_STORE_URI`, run rows last as the commit
  marker; the queue keeps pending rows only, a settled source's state goes to
  `ops_source_states` and model answers to `ops_model_calls`), then, with `slice_rate`
  (2% by the deployment's default), starts `gcp_graphia_teacher_flow` and returns without
  waiting for it; the teacher's deployment also runs every 30 minutes, each run asking
  nothing after `work_for_minutes` (25), so the slice's pending documents drain whether
  or not an extraction ran. That flow (`flows/graphia_teacher_flow.py`) labels blind the entities, forms and
  facts (the teacher's joint step, on every source) of a random slice of documents, each drawn alone at
  `slice_rate` (a site's document is one landing chunk for both variants, whose `site_documents` is
  `chunk`), parks each document the teacher fails on
  (`kg_label_failures`, asked again only by a run with `retry_failed`, optionally on
  `teacher_version`; policy `graphia_teacher_root`: its active version's
  model: DeepSeek V4.1 Flash, on OpenRouter with zero retention up to version 7, on DeepSeek's own API (`deepseek-flash`) from version 8), and the acceptance comparison with a current
  extractor variant (`baseline_variant`, e.g. `nuextract3-cpu`) on the slice's posts: both scored on the
  teacher's labels with paired differences (on the span types both ontologies share when
  the variant's ontology is not the baseline's), stored as the markdown artifact
  `graphia-v2-acceptance` and returned. With `gate` (a `knowledge_graph.gate_config` id
  fitted for the variant; migration 138's `gliner-o2-trial-1` was the removed GLiNER2
  variant's) each batch is gated: the teacher answers
  the documents whose units the gate does not accept enough of, at most `gate_budget` a
  run, and every other document is served its accepted units; whenever the gate drops a
  unit, the model's whole answer is kept beside it as the `shadow` run. With `check_pool`
  (`generative`) the units the gate would not accept are first checked by that pool's
  `verify` step, and only what stays unsettled goes to the teacher. A backfill is a
  low-priority mark (`queue-mark --priority -1`): the ledger claims higher priorities
  first, so the normal runs work it after the new sources. Readers of a
  document's answer (the export, the slice, identity, the generation) read `served` runs. It is the extraction only: identity and the graph generation are `gcp_graphia_identity_flow`'s. It needs migrations 126 to 135 and 147 to 149, and its variant's
  ontology registered (`python -m simpl_flow.pipelines.knowledge_graph.ontology register`:
  `o1`; `o2` with `--previous o1 --key-map .../ontology/v2.keymap.yaml`). It
  replaced the graphia extractor (`gcp_graphia_extractor_flow`, removed): that extractor's
  `graphia_extractions:2` and facts tables stay as its last run left them, nothing writes
  them, and the opportunity matcher keeps reading them. The job runs the plain image
  (2 vCPU, 4 GiB): no model, no server, no model key. One run at a time. Where each
  dataset lives and which flow writes it:
  `docs/knowledge-graph-storage.md`.
- `gcp_graphia_identity_flow` (every hour at :15 UTC, plain image) runs the identity
  service's micro-batches over the runs the extraction log gained, every variant's (the
  registry read through a read-only connection, nothing writes `sales.*`; the uncertain
  band to the pending link requests), then those requests settled by models
  (`resolve_links`, `er.resolution`: applied only at `nuextract_min_confidence` and
  `teacher_min_confidence`, NuExtract's only on a proposal tied to the documents beyond
  the name; `links_dry_run` with `links_limit` asks both models and applies
  nothing, its decisions kept as `dry-run:`; `recheck_links` decides the links the
  models applied before again, kept, moved or undone, `recheck_dry_run` deciding only; `identity_batches` caps the run's micro-batches, the next run goes on from the watermark), then as asked the next graph generation of a variant's runs
  (`generation`, `variant`, `publish`), then the published generation's entity promotion
  into the golden zone the matcher's `entity` predicate reads (`promote`,
  `promotion_config`; migrations 153 and 154), then, with `measure` or once
  `measure_every_hours` have passed since a run last measured, a measurement of the run's
  generation (built for it, unpublished unless `publish`): each entity type's verdict on
  the teacher's span labels and each relation type's on its fact labels, recorded as a
  `measured` promotion run that writes no golden row (migration 187). The schedule runs
  with `links_limit` 800, `measure_every_hours` 24 and `merge_every_hours` 24: once a day,
  before the generation, same-meaning names of the mergeable types are merged under the
  newest `knowledge_graph.er_merge_config` (every type off in `v1`; migration 188), and
  the micro-batches place a later spelling of a merged name by its loose form with no
  call. Identity's state is still in Postgres (`er_*`) until this pipeline is reworked. One run
  at a time (`CANCEL_NEW`).
- `gcp_graphia_merge_flow` (daily at 02:30 UTC, plain image, 4 vCPU / 16 GiB) finds and
  judges merge candidates for the types the merge config does not switch off: names and
  their Nebius embeddings (row-store datasets `er_names`, `er_name_vectors`), nearest
  names, the teacher's merge row (ledger `graphia_teacher_root` version 9, migration 189)
  and an audit per type kept across runs (`er_audit`: precision, recall and the
  auditor's agreement with itself, read on 95% lower bounds). It writes edges, questions
  and audits only; identity applies them. One run at a time (`CANCEL_NEW`).
- `gcp_open_graph_flow` (no schedule, started by hand) labels LinkedIn posts with
  llmgraph (LangChain's `LLMGraphTransformer`) once per teacher, as training data. A
  teacher is a model in one llmgraph mode, listed in
  `pipelines/open_graph/teachers.yaml`, asked through OpenRouter (every request on
  zero-retention routes that do not train on the posts), through Anthropic's own API
  (`backend: anthropic`, under the account's own data terms), or, locally only, through
  the `claude` CLI on the Claude plan of the person running it (`backend: claude_cli`,
  `claude_plan_opus_5_5`: no API key, the plan's own quota; `plan_usage.decision` caps
  its share of the plan's 5-hour and 7-day windows). Parameters:
  `source_keys` (required, post keys `p:<post id>`: v1 reads posts only, and a key of a
  kind with no pipeline stops the run before it marks anything), `teachers` (default:
  every teacher of the file with `in_default_run` true; `anthropic_api_claude_opus_5_5`
  runs only when named),
  `relabel` (default `false`), `batch_size`, `max_batches`. The ledger
  `open_graph.label_index` (migration 115) has one row per teacher and source: a pair
  already `stored` is skipped unless `relabel=true`. The agent framework walks policy
  `open_graph_root` (seed migration 116) and writes one Parquet row per post and
  teacher under `<ROW_STORE_URI>/training/open_graph/v1`, outside the row store's
  catalog; readers drop repeated `label_id` values and the rows with `parse_failed`
  (llmgraph could not read the teacher's answer; kept, not asked again). It needs
  `ROW_STORE_URI`, `OPENROUTER_API_KEY` when an OpenRouter teacher runs and
  `ANTHROPIC_API_KEY` when an Anthropic teacher runs; a missing key stops the run before
  it marks anything, and a key out of credit (OpenRouter's 402, Anthropic's "credit
  balance is too low") stops it with the claimed keys released. OpenRouter's costs are recorded by simpl_tracker's transport; an
  Anthropic request's cost is not recorded (a one-off run on a key SimpL does not pay).
  Its LangChain packages are in the optional Poetry group `open-graph`, so the
  deployment has its own image, `simpl-flow-open-graph`
  (`Dockerfile` build arg `EXTRA_GROUPS`); no other image carries them. The run turns
  LangSmith tracing off for its process before its first request, locally too, so no
  environment value can turn it on; its job command also turns it off with `env`,
  after Doppler's values. Locally: `poetry install --with open-graph`.
- The open graph Opus dataset is built from people's machines, not by the deployed flow:
  `python -m simpl_flow.pipelines.open_graph og-mark` adds random keys (posts `p:` and landing chunks `c:<host>#<part>`, mixed by `--mix`, the
  ICP's first with `--icp-first`) to the ledger, and `og-work` is one worker of one
  teacher: it claims due keys (250 a batch), labels them, writes one Parquet part per
  batch, posts and chunks together, to the dataset group's Parquet dataset (simpl_core's
  `parquet_dataset`, through the policy's Parquet sink, a `data_consumer`):
  `gs://simpl-processed-rows/distillation/<dataset group>/parts/`
  (`<UTC time>_<machine>_<8 random hex>.parquet`), settles, and with `--refill N` marks
  more when none is due. `og-work` merges the parts into the dataset while it waits out a
  plan pause and when it ends, with simpl_core's merge; `og-merge --group <group>` runs
  the same merge by hand, as a fallback. The dataset: `distillation/<group>/shards/*.parquet`,
  one row per `label_id`, shards of about 256 MB (closed shards never rewritten), listed
  in `distillation/<group>/manifest.json`: the manifest's shard list is the dataset;
  read those shards as one table (a merge writes its files under
  `distillation/<group>/tmp/` first and puts each in place whole). A part that does not
  read is skipped and left out of the manifest (`MergeResult.skipped`, `parts_skipped`
  in `og-work`'s summary). Parts are kept; the folders og-merge wrote before simpl_core
  took over are read and extended as they are. The two commands write to
  production only in `open_graph.label_index`; `og-work` reads the policy from
  production on a read-only connection: `open_graph_root` version 3
  (`WORKER_POLICY_VERSION`), whose seed (122) inserts it inactive, so the deployed flow
  keeps version 1; its `store` writes `label`'s rows to the Parquet dataset named as the
  group (`opus_llmgraph_v1`), and a worker of another group stops before it claims. Its
  publisher projects it once by hand
  (`scripts/project_open_graph_policy.py`); a worker never writes the policy.
  Teachers of one `dataset_group`
  (`opus_llmgraph_v1`: the API, OpenRouter and Claude plan Opus 5.5 teachers) share
  their keys: a key one of them labelled is not marked or labelled by another. On the
  Claude plan teacher, `--max-plan-usage[-5h|-7d]` caps the plan's windows and
  `--on-limit wait` waits out a refused call instead of stopping. Ctrl-C once stops a
  worker after its batch (part written, keys settled, dataset merged); twice stops it at
  once with its unsettled keys given back. Any number of workers may run at once; the
  README's *Open graph dataset from your machine* has the setup.
- Flow-runner autopilot sessions end `completed` when at least one company succeeded,
  `error` when the run raised or companies failed and none succeeded, and `stopped` when
  the run was interrupted: lease lost, run cancelled, or every company re-queued because
  the extension channel dropped. A dropped channel never makes an `error` session; the
  flow's result reports those companies as `requeued`. Read `error` sessions as real
  failures.
- `generate_opportunities_flow` works only ICPs someone receives, as defined by
  `sales_view.opportunity_recipient`: an active assignee, not on vacation and not an
  observer (`sales.user_observer`, set by SimpL staff), of a customer
  whose `metadata.is_active` is not `false`, of the ICP owner's customer (also active)
  or a SimpL identity with an open `sales.identity_loan` on that ICP for a customer on
  active pay per call. Each run deletes the non-manual
  opportunities nobody receives, and autopilot's candidate view applies the same rule, so
  deactivating a user, an ICP or a customer stops both without any other change.
- A **SQL signal** (`{"conditions": [{"table": "<schema.table>", "filters": ["<SQL>",
  …]}]}`) ANDs its raw filters, each in parentheses, with the ICP's companies
  (`restrict_to_icp`, default true): a filter's own `OR` stays inside it. After a
  signal's first full run, runs read only the rows changed since the last one
  (`updated_at`). On `sales_view.job_offer_with_location`, where `updated_at` is
  `COALESCE(job_offer.updated_at, created_at)`, that test runs on the base columns
  (`job_offer_updated_at`, `created_at`) so the `job_offer` indexes serve it.
- A **post signal** (`sales.icp_signal.filter_json`) searches the LinkedIn posts in Zilliz
  (alias `sales_posts`) by topic, by keywords, or both: `{"mode": "all_match",
  "conditions": [{"collection": "sales_posts", "search_mode": "semantic" | "keyword" |
  "hybrid", "embedded_text": "<topic>", "similarity_threshold": 0.5, "keywords":
  ["series A", "seed round"], "keyword_match": "any" | "all", "date_range_days": 30}]}`.
  A company matches when one of its posts from the window:
  - `semantic` (the default when `search_mode` is missing): scores at least the
    threshold (cosine) against the topic;
  - `keyword`: contains any of the keywords (all with `keyword_match: "all"`): whole
    words, a phrase's words together and in order, case and accents ignored, no
    stemming;
  - `hybrid`: does both.
  The 0.5 / 30 / `any` defaults apply when a value is missing; there is no `min_matches`
  and any other key is ignored. The match's evidence is that post: `matching_objects =
  {"sales.post": {"count": 1, "ids": ["<sales.post.id>"]}}` (for a repost, the original
  post). The matcher embeds the topic itself, so a post signal stores no
  `embedding_vector`. Post signals are never SQL on `sales.post`.
- A **website signal** searches the companies' sites, as the landing search index holds
  them in Zilliz (alias `landing_pages`), the same three ways: `{"mode": "all_match",
  "conditions": [{"collection": "landing_pages", "search_mode": "semantic" | "keyword" |
  "hybrid", "embedded_text": "<topic>", "similarity_threshold": 0.5, "keywords":
  ["ISO 9001"], "keyword_match": "any" | "all"}]}`. A company matches when a chunk of its
  site's pages (legal pages left out) passes the mode's tests. Pages carry no date, so
  there is no window, and only sites the index holds can match (companies sharing a site
  share its match). The evidence is that chunk: `matching_objects = {"landing_pages":
  {"count": 1, "ids": ["<page url>"], "evidence": [{"url", "title", "section",
  "page_kind", "snippet"}]}}`, the snippet cut around the first keyword (the text lives
  only in the index, so it travels with the match). `page_kind` `site` is the site's
  template (menu, footer), shown at the home URL.
- A **website facts signal** tests what each company's site runs and shows
  (simpl_scraping's `sales.website` and `sales.website_technology`), as the website
  facts index holds it in Zilliz (alias `website_facts`, keyword-only, no embedding):
  `{"mode": "all_match", "conditions": [{"collection": "website_facts", "technologies":
  {"names": ["PHP"], "risk": "past_eol"}, "site": [{"field": "uses_https", "op": "is",
  "value": false}], "keywords": ["ecommerce"], "keyword_match": "any"}]}`. The condition
  is simpl_core's (`search.website_facts`; every part, field and operator in its
  SKILL.md), and simpl_core's `check_condition` checks it before any save. A company
  matches when its site passes every part given: a site matches or not, with no score.
  It searches the signal's ICP companies only, never every site, and companies sharing a
  site share its match. On an ICP without filters (no company list) the signal fails:
  the run reports it and keeps its matches. The evidence is the site:
  `matching_objects = {"website_facts": {"count": 1, "ids": ["<host>"], "evidence":
  [{"host", "url", "technologies", "technologies_matched", "site", "keywords",
  "snippet"}]}}`: simpl_core's `website_facts_evidence` read from Postgres at match time
  (at most 10 matched technologies, worst first, without what moves on every sighting:
  `last_seen_at`, `seen_on_url`, the raw `evidence` text; `site` the tested facts; each
  part only when the condition has it), plus `snippet`, one line on what matched (e.g.
  `PHP 7.2.34, end of life 2020-11-30; security headers: no strict-transport-security`),
  which shortlists show as for a website signal. No score (`total_score` null). A
  condition simpl_core can no longer read fails that signal the same way.
- An **include filter** (`sales.icp_filters.filter_type = 'include'`, wish_list
  `company.id IN ('…', …)`) names companies an ICP holds on top of its rules. The
  matcher upserts them in a separate pass with none of the ICP's clauses (a union, never
  ANDed), `match_source = 'included'`, under the same refresh timestamp. The
  `icp_match_fallback` supply takes included companies first and does not hold them to
  `min_company_score`; claimed connections, a missing LinkedIn id and exclusive-mode
  assignment still exclude them. Only the uuids are read out of the clause. simpl_api's
  company import writes it when a user adds a list to an existing target.
- In `exclusive` mode, `icp_match_fallback` companies are dealt like signals: one read
  for every seller's open slots, then one company per seller per round, in rank order
  (since 2.5.289). Before, the first seller in `opportunity_recipient` order was filled
  to their limit first, so a short verified supply left the others with nothing.
  `shared` mode still fills each seller on their own.
- A Customer company (lead status 10) is parked like Monitoring (Raff, 2026-10-28): its
  signals are monitoring signals and can bring it back as a fallback opportunity, never
  recycled. Next to a connection that vetoes the company (Non sales, Meeting Booked or
  beyond, lost) it is only watched. A company imported with a `Dummy Imported`
  connection (an imported client list too) is watched, never proposed: its signals land
  in `opportunity.icp_signal_monitor` (the watchlist), but it is never a new or
  `recycled_fallback` opportunity, so autopilot never gets it either.
- A company where the team holds a Non sales connection (lead status 11: a person met
  for another reason) is a company already known: it is neither proposed nor watched.
  The flow autopilot never claims a person its user holds in Non sales, found at another
  company: their connection keeps its stage and gets no journey (`autopilot_root` 10).
- The flow autopilot searches each company's People tab with an ICP's short role words,
  `sales_outreach.autopilot_icp_search_words.primary_words` (at most 5; `reserve_words`
  at most 10, kept for rechecks), which it writes itself from the ICP's text under
  `autopilot_root` 17 and rewrites when that text changes. To correct them, write the
  words and set `edited_at` (and `edited_by`): autopilot never rewrites such a row.
  Empty `primary_words` means the ICP's first five `search_keywords` are searched. A
  monitored company's decision carries `metadata.reason_code` `no_role_match` (no role
  search found anyone) or `role_found_not_chosen` (the model chose nobody found).
- A company the flow autopilot monitored comes back for a recheck after 20 days, at most twice
  (`sales_outreach.autopilot_monitor_recheck`, `autopilot_root` 18): up to 10 open per seller,
  oldest first, searched with reserve words not tried there yet, never when someone of the
  team worked on the company since (a person, Customer, Non sales, an import, the placeholder
  moved). Its decision rows carry `metadata.recheck_attempt`; a claim moves the Monitoring
  placeholder to the claim's stage, so the company leaves Monitoring.
- A company where the team holds a Disqualified connection (lead status 12: met on a call,
  then ruled out by the seller) is never proposed again, neither new nor recycled; next to
  a client it is only watched.
- An ICP's **required company questions** (simpl_api, `sales_view.icp_required_question`) gate every
  source: a company is proposed only if its current answer (`sales.company_feature`) to each
  required question is the required yes or no; no answer is not a pass. Signals, monitoring
  signals, recycled companies and ICP match fallbacks (included ones too) are all filtered
  (`pipelines/opportunities/question_scope.py`); signals are still scored, saved and watched.
  simpl_api answers the questions at 22:00 UTC; the flow only reads them. ICPs without one
  are untouched.
- A company someone came to the customer's team **inbound** from (a connection with
  `origin = 'inbound'`, claimed or not, not released, read on its own `company_id`) is
  never proposed to an ICP list, neither new, recycled nor as a match fallback, named
  companies included (Raff, 2026-11-11): that person is already interested, so nobody
  pitches their colleagues (`connection_scope.came_in_inbound_sql`,
  `CameInInboundRepository` for signals; the run summary logs `came_in_inbound_count`).
  Signals are still scored, saved and watched.
- Opportunity sources (`opportunity.icp_signal_opportunities.source_type`): `new_signal`,
  `recycled_fallback` (a company the customer already worked, proposed again; called
  `fallback_monitoring` before 2.5.69), `icp_match_fallback`, `manual`. With the
  fallback strategy `reassign_stale`, a recycled company goes only to a seller who never
  had a connection there, once its connections are quiet for `min_age_days` and nobody
  replied; offering it cancels the planned follow-ups (`planner-follow-up-check`)
  still pending on its connections.
- Discord alerts: agent framework failures, autopilot per-user failures and
  opportunities per-ICP failures post to #warning once per failure, and a failure that
  keeps recurring edits one message and escalates to #error after an hour. Dropped
  extension channels never alert. A run cancelled from outside posts
  `agent_framework.run.cancelled`; a lost autopilot lease posts
  `autopilot_flow.lease_lost` instead, with when the lease expired and when it was
  found gone, and the walk it stops stays silent.
- Document required environment variables when adding a new provider, deployment, or integration.
- Configuration and secrets are supplied by Doppler (project `simpl_flow`) as plain environment variables; the service reads them through `simpl_flow.config.Config` / `SecretManager`. Prefect blocks are not part of the configuration contract.
- Treat `prefect.yaml` as production deployment configuration: image tags, schedules, resource limits, and concurrency limits affect live workflows.
- Prefer calling stable services or flows rather than importing flow-local models/contracts into another repo. Promote shared contracts to `simpl_core` first.
- Treat existing flow-local models and services as legacy unless they are clearly deployment-specific. If a change makes them more generally useful, move or recreate the shared contract in `simpl_core`.
- New reusable models, DTOs, repositories, and services should normally start in `simpl_core`, not `simpl_flow`.

## Common pitfalls

- Do not run deployment commands unless the user explicitly wants deployment.
- Do not add one-off database access patterns when a repository/service boundary exists.
- Do not bypass Prefect conventions for retryable/scheduled workflow behavior.
- Do not commit provider credentials or local `.env` values.
- Do not add unbounded scraping, LLM, database, or provider fan-out. Every batch/worker loop needs an explicit cap.
- Do not add raw SQL in flow entry points or bot orchestration; isolate database-specific logic in repositories/importers.
- Do not import flow-local legacy models/services from other repos as a shortcut; promote the shared piece to `simpl_core`.

## Testing

```bash
conda activate simpl_flow
poetry install
poetry run pytest
poetry run ruff check .
```

## What this service does NOT do

- Does not expose the platform HTTP API. That is `simpl_api`.
- Does not own reusable business primitives. Put those in `simpl_core`.
- Does not own frontend user experience. Use the frontend repos.
- Does not train on the open graph corpus. `open_graph_flow` writes the Parquet labels; the loader and the training belong to the training side.

## Where to go next

- Source: `https://github.com/simpl-techs/simpl_flow`
- Flow code: `src/simpl_flow/flows`
- Pipeline code: `src/simpl_flow/pipelines`
- ROI ingest: `src/simpl_flow/pipelines/roi` (Revolut → `roi.transactions` daily at 03:15 UTC with payer, MCC, type and FX fee like the CSV statement, EUR legs only; the sync rewrites every line of its window, so a backfill of older months passes `window_to` (ISO) and writes only the lines booked before that day, leaving later lines with the statement names their ROI vendors are keyed on; A-Cube → `roi.issued_invoices`, every invoice SimpL transmitted (`type` 0) with its SDI status (`waiting`, `sent`, `delivered`, `not-delivered`, `rejected` with SDI's reasons from the rejection notice, asked once per document even when it lists none, best effort: one A-Cube cannot answer for is asked again next run) and the stored rows' status moved forward; → `roi.revenues`, only the sales SDI accepted by simpl_core's D11 rules (`counts_as_revenue`: SimpL the seller, not a TD16-TD29 self-invoice, delivered or not delivered, never while waiting for SDI), with a taxable amount, an invoice sent twice counted once by fiscal key: a supplier invoice or a self-invoice is never revenue, and an existing revenue row is never rewritten; the same nightly run stores the supplier invoices A-Cube received for SimpL in `roi.supplier_invoices`, and, each step running whatever the others did, fails at the end naming every problem: a document it cannot read, a failed step, an accepted invoice read as rejected). Classification runs in simpl_api's nightly `roi_vendor_rules` job, not in `apply_rules_flow` (old text rules, never deployed)

- ROI ingest: `src/simpl_flow/pipelines/roi` (Revolut → `roi.transactions` daily at 03:15 UTC with payer, MCC, type and FX fee like the CSV statement, EUR legs only; the sync rewrites every line of its window, so a backfill of older months passes `window_to` (ISO) and writes only the lines booked before that day, leaving later lines with the statement names their ROI vendors are keyed on; A-Cube → `roi.issued_invoices`, every invoice SimpL transmitted (`type` 0) with its SDI status (`delivered`, `not-delivered`, `rejected` with SDI's reasons from the rejection notice, asked once per document) and the stored rows' status moved forward; → `roi.revenues`, only the sales that count by simpl_core's D11 rules (`counts_as_sale`: SimpL the seller, not a TD16-TD28 self-invoice, not rejected), with a taxable amount, an invoice sent twice counted once by fiscal key: a supplier invoice or a self-invoice is never revenue, and an existing revenue row is never rewritten; the same nightly run stores the supplier invoices A-Cube received for SimpL in `roi.supplier_invoices`, and fails, after importing the rest, naming any document it cannot read or any status that would move backwards; it is the one importer of received invoices, also those A-Cube downloads from the Cassetto fiscale, and dates them by A-Cube's `created_at` only when stored before A-Cube's first Cassetto download job, since /invoices does not tell an SDI delivery from a download, so later ones keep `received_at` empty; a buyer named only by SimpL's codice fiscale is SimpL; the self-invoices (TD16-TD29) among them go to `roi.issued_invoices` instead (simpl_core `cassetto.destination`), in a transaction of their own so a failure there keeps the supplier invoices, `consegnata` when SDI delivered them to A-Cube, `nel_cassetto` when downloaded; the run then stores where A-Cube's Cassetto download stands in `roi.cassetto_status` (`non_attivo` on 403, `non_pianificato`, `attivo` with the last completed job, `errore` with A-Cube's reason, also on a malformed answer, keeping the subscription end and last download read before; never fails the run on its own) for the Invoices page; `roi-acube-cassetto-flow`, schedule off until A-Cube enables the paid download, only reads A-Cube and fails naming the cause when the download is off (403), expired, its last job failed or none finished in 2 days, or no received invoice came in 35 days; `python -m simpl_flow.pipelines.roi.acube_cassetto status|assign|schedule [--archive] [--apply] [--force]` reads or, only with `--apply`, writes, printing its preconditions on the dry run). Classification runs in simpl_api's nightly `roi_vendor_rules` job, not in `apply_rules_flow` (old text rules, never deployed)
- Financials: `src/simpl_flow/pipelines/financials` (Revolut → `financials.ledger` daily at 03:00 UTC, then the balance Revolut reports → `financials.account_balance`, source `revolut_api`, one row a day, plus the ledger sum of each account `GET /accounts` does not list as active, such as a savings vault; simpl_api's ROI Summary reads it as cash, the ledger's drift beside it)
- Internal conventions: `.agent/INTERNAL.md`
