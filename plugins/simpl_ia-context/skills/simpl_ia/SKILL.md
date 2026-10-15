---
name: simpl_ia
description: |
  Use this skill whenever the user asks about vector search, embeddings, reranking, chunking, Milvus/Qdrant stores, structured LLM clients, Langfuse prompts, or code that imports `simpl_ia`. ALWAYS consult this skill before adding ad hoc embedding/search/LLM wrappers in simpl repos. Triggers on phrases like "vector search", "embed text", "Milvus", "chunk documents", "structured LLM output", "pydantic-ai agent".
---

# simpl_ia integration guide

> **Maintained by**: the `simpl_ia` repo, auto-synced to simpl_knowledge.
> **Source of truth**: `simpl-techs/simpl_ia/.agent/SKILL.md`

## What this library is

`simpl_ia` is the shared Python library for vector search, embedding providers, document chunking, vector-store adapters (Milvus, Qdrant), and optional structured LLM clients used across the simpl platform.

Request accounting uses the coordinated tracker migration and library release.
`simpl_ia` captures each model response; `simpl_core` binds agent/node/pipeline
and business attribution. `track_cost` suppresses duplicate run aggregates when
request evidence exists. Unknown prices remain visible; never synthesize costs
from an unmatched provider-export difference.

## Installation

```bash
poetry add "simpl-ia @ git+https://github.com/simpl-techs/simpl_ia.git@main"
```

Install extras only when needed:

```bash
poetry add "simpl-ia[embedding-vector] @ git+https://github.com/simpl-techs/simpl_ia.git@main"
poetry add "simpl-ia[ml] @ git+https://github.com/simpl-techs/simpl_ia.git@main"
poetry add "simpl-ia[agents] @ git+https://github.com/simpl-techs/simpl_ia.git@main"
poetry add "simpl-ia[chunking-chonkie] @ git+https://github.com/simpl-techs/simpl_ia.git@main"
```

Pin to a tagged release when coordinating cross-repo bumps — platform repos typically track `@main`.

## Basic usage

Remote embedding + vector search (no local torch):

```python
from simpl_ia import EmbeddingService, SearchConfig, VectorSearch
from simpl_ia.core.providers.registry import ProviderRegistry

registry = ProviderRegistry.from_entry_points()
provider = registry.get("openai-embeddings")
embedder = EmbeddingService(provider=provider)

search = VectorSearch(
    embedder=embedder,
    config=SearchConfig(collection_name="documents", top_k=10),
)
results = search.query("quarterly revenue trends")
```

Structured LLM calls (requires `[agents]` extra):

```python
import os

from simpl_ia.agents import (
    ModelPolicy,
    ModelTarget,
    ProviderBinding,
    ProviderCredentials,
    StructuredLLMClient,
    bind_policy_credentials,
)

policy = ModelPolicy(
    name="gpt-5.1",
    provider="openai",
    reasoning="high",
    fallbacks=[ModelTarget(name="gpt-5-mini", provider="openai")],
)
bindings = [
    ProviderBinding(
        provider="openai",
        credentials=ProviderCredentials(api_key=os.environ["OPENAI_API_KEY"]),
    )
]
client = StructuredLLMClient.from_policy(bind_policy_credentials(policy, bindings))
agent = client.make_agent(output_type=MySchema, system_prompt="...")
result = await client.run(agent=agent, user_prompt="...")
```

Providers: `openai`, `deepseek`, `openrouter` (models are `vendor/model` slugs),
`cheaper_inference` (Cheaper Inference's gateway; bare model ids such as
`glm-5.3-flash`, a slug is refused; the endpoint defaults to
`https://api.cheaperinference.com/v1`, so a binding needs only the key),
`self_hosted` (an OpenAI-compatible server you run, such as llama.cpp or vLLM:
the target must name its `base_url`, needs no key, structured output is native,
and no cost receipt is written, since no provider bills it),
and `typesafe` (an alias of `openrouter` with `api="decisions"`, below). A
target's `api` is the API its model speaks there: `chat` (the default) or
`decisions` for a decision model on `openrouter` (below).
`client.selected_target_metadata(result)`
reports which chain member answered (`model`, `provider`, `api`, `reasoning`,
`fallback_index`) and the name it answered under (`served_model`); `api` tells a
decision model's answer from a language model's. With an
`attempt_log` passed to `make_agent`, the member is credited by chain position,
so a provider renaming what it serves is logged instead of failing the call.

A target's `extra_body` is merged into every request body it sends, for fields the
typed settings lack (`chat_template_kwargs`). A call adds its own with
`make_agent(..., extra_body=...)`: nested objects merge and the call wins. A decision
model takes none. Every model in the chain sends the call's `extra_body`, so every one
must be `self_hosted`: `make_agent` raises `ValueError` naming each one that is not.
`make_agent(system_prompt=None)` sends no system message, for a
model whose prompt format has no place for one; `run(..., max_tokens=...)` caps the
answer of every model in the chain.

```python
policy = ModelPolicy(
    name="nuextract3",
    provider="self_hosted",
    base_url="http://127.0.0.1:8092/v1",
    extra_body={"chat_template_kwargs": {"enable_thinking": False}},
)
client = StructuredLLMClient.from_policy(policy)  # no binding needed
agent = client.make_agent(
    output_type=StructuredDict(answer_schema),
    system_prompt=None,
    extra_body={"chat_template_kwargs": {"template": template, "instructions": text}},
)
result = await client.run(agent=agent, user_prompt=document, temperature=0.0, max_tokens=1024)
```

Structured output mode (native JSON schema, a forced output tool, or the
schema in the prompt) is resolved per chain member from the route's
capabilities, whether the agent passed `tools` to `make_agent`, and the
target's `output_mode` (`auto` by default; `native` / `tool` / `prompted` to
pin one, refused when the target cannot serve it). Under `auto`: OpenAI's own
endpoint is native either way (a request with function tools -- the agent's,
or an output tool such as a `ToolOutput` or `[str, Model]` spec brings -- reaches
it through the Responses API with `store` off, since Chat Completions refuses
tools while a GPT-6 model reasons); OpenRouter is native for a tool-less agent and
**tool** for an agent with tools (`require_parameters` stays a routing filter
and never puts `response_format: json_schema` next to `tools`, which the
upstreams behind that route answer without ever calling a tool); `deepseek` is
always prompted; `cheaper_inference` is always **tool** (the gateway answers a
`response_format` with a 503 on some upstreams, so `native` is refused there and
its prompted mode sends the schema in the prompt only). The resolved mode is on every attempt-log entry and on
`selected_target_metadata(result).output_mode`;
`client.resolved_output_modes(tools_present=..., output_type=...)` reports it per
target without a request, for policy tests. An output type answered through an output
tool on every model (a `ToolOutput`, or `[str, Model]`) makes every member `tool`,
whatever its route would pick.

Build every agent that runs on a policy through `make_agent`, including a plain-text
one (`output_type=str`): constructing `Agent(...)` by hand reads the model some other
way than the policy does. Every chain falls back on errors and on a response cut off
at its output limit before it answered (a thinking model that spent its whole budget
reasoning); a cut-off on the last member raises `FallbackExceptionGroup`. A text-only
agent's chain falls back on nothing else; any spec with a schema to fail (a model,
`list[Model]`, a union, a `ToolOutput`, `[str, Model]`) keeps the invalid-output guard,
which validates answers exactly as pydantic-ai does for that spec, with the agent's
`validation_context`.

### Plain completions on a self-hosted model

`CompletionClient` makes one OpenAI-compatible `/chat/completions` call to a
self-hosted server and returns the answer as the server sent it: no agent, no output
tool, no `response_format`. It is for a model whose task travels as request fields
(NuExtract reads its template from `chat_template_kwargs`); `simpl_core`'s `lm_model`
agent kind calls it. It is a separate client, not a mode of `StructuredLLMClient`.

```python
from simpl_ia.agents import (
    FAILURE_UNREACHABLE,
    CompletionClient,
    CompletionFailed,
    ModelPolicy,
)

policy = ModelPolicy(
    name="nuextract3",
    provider="self_hosted",
    base_url="http://127.0.0.1:8092/v1",
    http_timeout_seconds=300,
    extra_body={"chat_template_kwargs": {"enable_thinking": False}},
)
client = CompletionClient(policy)  # ValueError unless every target is self_hosted
attempts: list[dict] = []  # optional: filled as requests go, kept if the call is cancelled
try:
    completion = await client.complete(
        document,
        max_tokens=1024,  # temperature defaults to 0
        extra_body={"chat_template_kwargs": {"template": template, "instructions": text}},
        attempts=attempts,
    )
except CompletionFailed as failed:
    failed.attempts  # every request of the call, each with outcome "raised" and a failure
    server_down = all(a["failure"] == FAILURE_UNREACHABLE for a in failed.attempts)
else:
    completion.text, completion.finish_reason  # "" / None when the server sent none
    completion.target  # SelectedTargetMetadata of the member that answered
    completion.attempts  # every request, the failed ones before the answer included
```

- **The request**: the prompt is the only message, a user message; `max_tokens`,
  `temperature` and the call's `extra_body` merged over the target's (nested objects
  merge, the call wins). The key is the target's bound key, else `EMPTY`. An
  `extra_body` setting `model`, `messages`, `max_tokens`, `temperature` or `stream` is
  refused with `ValueError`. A target with `reasoning` or a non-`auto` `output_mode` is
  refused when the client is built.
- **Fallback and retries**: targets are asked in policy order. A connection that fails
  or a busy status (408, 409, 429, 502, 503, 504; `RETRY_STATUSES`) is asked again on the
  same target, up to `max_attempts_per_target` (3) requests, pausing
  `retry_pause_seconds` (2 s) then twice that. Any other error status (500 included), a
  dropped connection, an attempt timeout, or a body with no choice moves to the next
  target at once. At most `len(policy.targets()) * max_attempts_per_target` requests per
  call.
- **Attempt timeout**: wall clock per request, the target's `http_timeout_seconds`, else
  the environment's default (60 s, `AI_LLM_TIMEOUT_SECONDS`). Set it on a slow model.
  Connecting gets at most 10 s (`CONNECT_TIMEOUT_SECONDS`), half the attempt timeout
  when that is shorter, so a server that never accepts fails as `unreachable`.
- **No checks on the answer**: a cut answer (`finish_reason="length"`) or an empty one is
  returned; the caller decides.
- **Attempt entries** carry the keys of `agents/attempts.py` (`outcome`, `model`,
  `provider`, `fallback_index`, `latency_ms`, `finish_reason`, `error_class`,
  `error_message`, ...) plus `failure` on a raised one, exported as `FAILURE_*`:
  `unreachable` (no connection), `dropped` (the server took the request and closed the
  connection without an answer), `http_status` (with `http_status`), `timeout` or
  `malformed`. Pass `attempts=` to receive them as they are sent: a call cancelled by
  the caller's deadline leaves its request in flight there with outcome `cancelled`.
- **HTTP client**: requests go through the event loop's cached client, the one
  `StructuredLLMClient` uses. A `transport=` is wrapped in a client of its own and never
  closed: the caller owns it.
- **No cost receipt**: no provider bills a self-hosted call.

### Decision models (`api="decisions"`)

A decision model is not a language model: it answers the output type's fields
as typed questions about the user prompt (a yes/no with its probability, a pick
from a `Literal`/`Enum`, a rubric level) in a few hundred milliseconds, and
generates no text. Use one for routing, triage, classification, gating and
moderation -- one-second human judgements -- with a language model behind it
for whatever it hands off. Every decision model on OpenRouter (TypeSafe's Jev,
Perplexity's Decider, any other) is reached the same way: name it like a chat
model on OpenRouter and add `api="decisions"`. There is no list of decision
models; any id works, and one OpenRouter does not serve is its 400, as for a
chat model. Full detail in `docs/provider_routing.md`, "Decision models".

```python
from simpl_ia.agents import DecisionThresholds, ModelPolicy, ModelTarget, OpenRouterRouting


class Triage(BaseModel):
    """Route a support message."""  # the docstring is the goal routes are weighed by

    urgent: bool = Field(description="Does this need a reply within the hour?")
    team: Literal["billing", "technical", "other"] = Field(
        description="Which team should handle this?"
    )


policy = ModelPolicy(
    name="perplexity/pplx-decider-v1.1-27b-20261006",  # or "typesafe/jev-1.13-20260917", ...
    provider="openrouter",
    api="decisions",
    provider_routing=OpenRouterRouting(zdr=True),  # sent as the request's `provider`
    decision_thresholds=DecisionThresholds(boolean=0.7),  # what `True` has to mean
    fallbacks=[ModelTarget(name="z-ai/glm-5.3-flash", provider="openrouter")],
)
# The same `openrouter` binding keys both members.
bindings = [
    ProviderBinding(
        provider="openrouter",
        credentials=ProviderCredentials(api_key=os.environ["OPENROUTER_API_KEY"]),
    ),
]
client = StructuredLLMClient.from_policy(bind_policy_credentials(policy, bindings))
agent = client.make_agent(output_type=Triage, system_prompt="<context to judge>")
result = await client.run(agent=agent, user_prompt="I was charged twice.")
result.output                                        # Triage(urgent=True, team="billing")
result.response.provider_details["confidence"]       # {"urgent": 0.7, "team": 0.8}
client.selected_target_metadata(result).api          # "decisions"
```

`provider="typesafe"` is an alias: a target naming it is
`provider="openrouter", api="decisions"` from the moment it is validated, so
deployed policies (`typesafe/jev-1.13-20260917`, `jev-1.13`, `jev-latest`) keep
loading and answering on this route, keyed by the `openrouter` binding. A host
that still binds `typesafe` explicitly has that binding honoured for decision
targets.

Rules that follow from what a decision model is:

- **The question lives on the output type**, in `Field(description=...)`, the
  model's docstring and `client.run(..., instructions=...)`. The **system prompt
  is material the model judges** (sent as history beside the user prompt), so
  keep it to context and keep the state small: irrelevant detail is a distractor.
- **Every field must be a question the model can answer**: `bool`,
  `Literal`/`Enum` of strings, `float` with `ge=0, le=1`, `list` of a
  `Literal`/`Enum`, an `IntEnum` rubric described per level,
  `Literal[...] | None`, or a nested model of these. A `str`, an unbounded number
  or a date is refused with `UserError` before any request -- no fallback runs,
  it is a wrong output type. Extract free text with a language model, and let the
  decision model decide about it. Each model's API enforces its own limits on
  options and levels.
- **Do not ask it to compute**: decision models do not count, compare dates or do
  arithmetic reliably. Do that in code and ask about the result. Add an `other` /
  `None` option where a taxonomy may not cover every input, and test option
  orderings -- reordering `Literal` members can shift answers.
- **Thresholds are policy**: `decision_thresholds.boolean` (default 0.5) and
  `.route` (unset: the likeliest pick of a tool or output is taken; set, a pick
  less likely than it is handed to the next member). Tune them on labelled
  examples against a dated snapshot, the only name that cannot change model
  under you.
- `reasoning`, `output_mode="native"` and `output_mode="prompted"` are refused on
  a decision target; `temperature` is not sent; `run_stream` yields the whole
  answer as one event.
- In a chain, a step the model hands off (`UnfillableRoute`: a tool or output it
  cannot fill; `UnsureRoute`: a pick below `route`) and any API failure advance
  to the next member; a language-model primary failing hands the step to a
  decision-model fallback. Only the hand-offs cost a language-model call. **A
  decision model last or alone with tools** raises `UnfillableRoute` to the
  caller whenever it prefers a tool it cannot fill: put a language model behind
  it. Decision and chat members mix freely; one name may appear once per API.
- Transient failures (408, 429, 5xx, a dropped connection) are retried twice,
  within 2 s when a member follows and within 30 s when none does: a turn can be
  two requests, and a failure on the second is terminal, where no member could
  take it.
- Answers report a dated snapshot of the model asked for, or of what a `-latest`
  alias resolved to. A chain with **a `-latest` alias beside the release it
  resolves to** must pass `attempt_log` to `make_agent`: by name the two are
  indistinguishable.
- Cost is recorded under the **`openrouter`** provider at the `usage.cost`
  OpenRouter reports, with its generation id and the upstream, so decision calls
  reconcile against the OpenRouter export like any other. An answer that reports
  no cost falls back to `simpl_tracker`'s rate rows.

### Streaming a turn

`client.run_stream(agent=..., user_prompt=...)` returns pydantic-ai's own
streaming handle — an async context manager whose iterator yields the run's
events and ends with the result event:

```python
async with client.run_stream(agent=agent, user_prompt="...") as events:
    async for event in events:
        ...
```

It differs from `run` in what it refuses to do, not in what it resolves:

- **Output retries are pinned to zero** (`retries={"output": 0}`): the text has
  already been shown, so a schema-invalid payload fails the turn instead of
  re-asking the model. Tool retries are untouched. An agent whose `ToolOutput`
  carries its own `max_retries` is refused with `ValueError` — build agents with
  `make_agent`.
- **None of `run`'s post-hoc resilience applies**: no truncate-on-context-window
  retry, no temperature retry. Pass `model_settings` only for a setting every
  chain member accepts, or leave it unset.
- **Per-segment enforcement**: `reject_unfinished_segments=True` wraps the agent's
  model in `SegmentCompletionGuard`, which ends the run the moment a response
  segment closes without finishing (error, filtered, incomplete) — *before* the
  SDK runs the tools that segment asked for. Pass the same `attempt_log` you gave
  `make_agent` so the refused segment's trail entry is corrected.
- **The per-attempt bound covers the open only.** `make_agent(...,
  attempt_timeout_seconds=)` wraps each chain member in `AttemptDeadline`; on a
  stream it bounds opening the stream, so a target that never starts raises and
  the chain advances. Once chunks flow, that clock is off. A target that goes
  quiet mid-stream is ended by the HTTP per-read timeout or by *your* ceiling over
  the whole turn — nothing infers a stall from silence.

## Milvus: one hit per group, aliases and raw rows

Both `MilvusStore` and `AsyncMilvusStore` (from `simpl_ia.core.vector_stores.milvus`):

- **One best hit per value of a field**: pass `group_by=GroupBy("company_id")` to
  `search` and `text_search`, or set `group_by` on `HybridSearchConfig` /
  `MilvusMultiBM25HybridSearchConfig`. `limit` / `top_k` then counts groups. Grouping
  runs on the server after the filter, so a filtered search over many companies returns
  one hit for every company that has a match. The iterators refuse it.
- **Long value lists in hybrid filters**: `MilvusMultiBM25HybridSearchConfig(...,
  use_filter_templates=True)` sends the filter as a template with its values as
  parameters; `HybridSearchRequest(filter_expr=..., filter_params=...)` does the same per
  request. A `HybridSearchRequest` with `metric_type="BM25"` takes the query text as its
  `vector`.
- **Aliases**: `create_alias`, `alter_alias` (atomic for readers), `drop_alias`,
  `describe_alias` (target name, or `None`), `list_aliases`. Search, query and count
  accept an alias wherever they take a collection name. A collection with aliases
  cannot be dropped until they are removed.
- **Your own schema**: `create_collection_from_schema(name, schema, index_params,
  num_partitions=, consistency_level=)` for partition keys, nullable fields, scalar
  indexes or a BM25 function with a custom analyzer (build them with
  `MilvusClient.create_schema()` / `prepare_index_params()`).
- **Rows as the schema has them**: `upsert_rows(name, rows, partial_update=False,
  batch_size=500)`. With `partial_update=True` each row carries its key and the fields
  to change; Milvus keeps the rest, vectors and text included. (`upsert` instead adds
  `id` / `vector` itself and its `partial_update` only switches insert to upsert.)
- **Analyzer check**: `run_analyzer(texts, collection_name=, field_name=)` returns the
  tokens BM25 indexes for that field; `run_analyzer(texts, analyzer_params=)` tries an
  analyzer before a collection uses it.

Nebius embeddings: `encoding_format="base64"` sends float32 bytes (half the size of JSON
floats) and callers still get floats. Nebius honours `dimensions` for Qwen3-Embedding.

Nebius rate limits are handled for you. Every Nebius provider in a process shares one
pacer per key and model. It runs at 95% of the account's per-minute limits (read from
each answer's `x-ratelimit-*` headers), makes up pauses within the minute, and steers by
Nebius's own measure of the 15-minute window toward 90%, so Token Factory keeps raising
them. `nebius_pace` lines (every 5 minutes) show where it stands. It waits out a 429 and sends the request again. A 429 raises `ProviderRateLimitError` only if you pass
`max_rate_limit_wait=<seconds>`, e.g. for an interactive search that must answer in
time. `max_retries` covers connection errors, timeouts and 5xx. `provider.pacer.snapshot()`
shows the limits and the pace.

## Chunking along a page's elements

`simpl_ia.core.chunking.blocks` cuts a page given as lines, each with the ids of the
block elements it sits in (outermost first), into chunks that follow the page's
structure. It is plain Python: no chunking extra is needed.

```python
from simpl_ia.core.chunking.blocks import BlockLine, chunk_blocks

lines = [
    BlockLine("# Services", (0, 1)),
    BlockLine("## CNC turning", (0, 2, 3)),
    BlockLine("Parts to drawing, from prototype to series.", (0, 2, 3)),
]
for chunk in chunk_blocks(lines, soft=1200, hard=1800):
    print(chunk.section, chunk.text)   # "Services", the three lines joined by \n
```

- The largest element whose text fits `hard` characters stays in one chunk; an element
  over `hard` is split into its children. A chunk closes at an element boundary once it
  holds `soft` characters and never goes past `hard`.
- Headings are lines starting with `#` marks; `section` is the heading path at the
  chunk's first line, outermost first (`Services > CNC turning`). A heading a chunk
  would end on moves to the next chunk.
- Only a line over `hard` is split, at sentences, then words.
- `chunk.lines` holds the indices of the input lines in the chunk, in order (a split line is
  in each of its chunks), so data kept per line can follow its chunk.

## Rules and conventions

- Prefer `simpl_ia.core` for lightweight imports that must not pull `pymilvus` or torch. Use top-level `simpl_ia` only when Milvus or the full kitchen-sink surface is intentional.
- Declare the correct extra in the consumer's `pyproject.toml` before importing ML, vector-store, chunking, or agents submodules.
- Resolve embedding providers via `ProviderRegistry` entry points (`simpl_ia.providers` in `pyproject.toml`), not hard-coded client construction in app repos.
- Chunkers and refineries register under `simpl_ia.chunkers` / `simpl_ia.refineries` entry points — reuse those names instead of forking adapter code.

## Common pitfalls

- **Don't** `from simpl_ia import MilvusStore` in code paths that must stay pymilvus-free — first access loads pymilvus at import time.
- **Don't** import `simpl_ia.inference.embedders` without the `[ml]` extra — lazy loaders raise `ImportError` with the install hint.
- **Don't** import `simpl_ia.agents` without `[agents]` — it needs `pydantic-ai`, Langfuse, and `simpl-tracker`.
- **Don't** add a decision model by name to a list, regex or provider of its own — any model on OpenRouter's decisions API is `provider="openrouter", api="decisions"`.
- **Don't** put the question for a decision-model member in the system prompt — the model judges it as material. Field descriptions, the output type's docstring and `instructions` are what it is asked.
- **Don't** assume `simpl_ia.core.vector_stores.EmbedderMetadata` and `simpl_ia.core.providers.metadata.EmbedderMetadata` are the same class — they are distinct types for different layers.
- **Don't** leave the HTTP timeout at its 60 s default for a call that can stay silent longer — it is dropped and falls back. OpenRouter sends nothing on an unstreamed call until the answer is complete, so a reasoning model there is silent for its whole generation: on 2026-10-03 every 2.5-5 minute call on `deepseek/deepseek-v4.1-flash` died at 60 s while the upstream finished and billed it. Set `http_timeout_seconds` on the policy target that needs it; `AI_LLM_TIMEOUT_SECONDS`, `AI_SLOW_MODEL_TIMEOUT_SECONDS` and `AI_SLOW_MODEL_MARKERS` (see the README) set the default for targets that say nothing.

## Testing

```bash
conda activate simpl_ia
poetry install
poetry run pytest
poetry run ruff check .
```

Mock external embedding/vector APIs at the provider boundary; do not require live Milvus or remote keys in unit tests.

## What this library does NOT do

- Does not own platform business logic or HTTP routes — use `simpl_core` / `simpl_api`.
- Does not own shared ORM models — use `simpl_orm`.
- Does not own cost tracking or Discord notifications — use `simpl_tracker` (though `[agents]` depends on it for tracing).
- Does not price a `cheaper_inference` call at the call: the gateway sends no amount, so the answer carries the gateway's request id (`provider_response_id`) and the amount is matched from its usage export by that id.
- Does not replace Prefect workflow orchestration — use `simpl_flow`.

## Where to go next

- Source: `https://github.com/simpl-techs/simpl_ia`
- Consumer example: `simpl_core` pins `simpl-ia` and `simpl-ia[agents]` for agent-framework
- Internal conventions: `.agent/INTERNAL.md`
