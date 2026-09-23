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

Providers: `openai`, `deepseek`, `openrouter`, `cheaper_inference` (OpenRouter
models are `vendor/model` slugs), `typesafe` (Jev via OpenRouter, below).
`client.selected_target_metadata(result)`
reports which chain member answered (`model`, `provider`, `reasoning`,
`fallback_index`) and the name it answered under (`served_model`). With an
`attempt_log` passed to `make_agent`, the member is credited by chain position,
so a provider renaming what it serves is logged instead of failing the call.

Structured output mode (native JSON schema, a forced output tool, or the
schema in the prompt) is resolved per chain member from the route's
capabilities, whether the agent passed `tools` to `make_agent`, and the
target's `output_mode` (`auto` by default; `native` / `tool` / `prompted` to
pin one, refused when the target cannot serve it). Under `auto`: OpenAI's own
endpoint is native either way; OpenRouter is native for a tool-less agent and
**tool** for an agent with tools (`require_parameters` stays a routing filter
and never puts `response_format: json_schema` next to `tools`, which the
upstreams behind that route answer without ever calling a tool); `deepseek` is
always prompted. The resolved mode is on every attempt-log entry and on
`selected_target_metadata(result).output_mode`;
`client.resolved_output_modes(tools_present=...)` reports it per target without a
request, for policy tests.

Build every agent that runs on a policy through `make_agent`, including a plain-text
one (`output_type=str`): constructing `Agent(...)` by hand reads the model some other
way than the policy does. A text-only agent's chain falls back on errors only; any
spec with a schema to fail (a model, `list[Model]`, a union, a `ToolOutput`, `[str,
Model]`) keeps the invalid-output guard, which validates answers exactly as pydantic-ai
does for that spec, with the agent's `validation_context`.

### Decisions on Jev (`provider="typesafe"`)

TypeSafe's Jev is a *decision* model, not a language model: it answers the
output type's fields as typed questions about the user prompt (a yes/no with
its probability, a pick from a `Literal`/`Enum`, a rubric level) in a few
hundred milliseconds, and generates no text. Use it for routing, triage,
classification, gating and moderation -- one-second human judgements -- with a
language model behind it for whatever it hands off. It is served **through
OpenRouter only**, on the OpenRouter key and bill; `typesafe` is a separate
provider name because the endpoint (`/v1/systemone`) and SDK are separate, not
because the account is. Full detail in `docs/provider_routing.md`,
"TypeSafe (Jev)".

```python
from simpl_ia.agents import DecisionThresholds, ModelPolicy, ModelTarget


class Triage(BaseModel):
    """Route a support message."""  # the docstring is the goal Jev weighs routes by

    urgent: bool = Field(description="Does this need a reply within the hour?")
    team: Literal["billing", "technical", "other"] = Field(
        description="Which team should handle this?"
    )


policy = ModelPolicy(
    name="typesafe/jev-1.13",  # or `jev-1.13`, `jev-latest`, `typesafe/jev-1.13-20260917`
    provider="typesafe",
    decision_thresholds=DecisionThresholds(boolean=0.7),  # what `True` has to mean
    fallbacks=[ModelTarget(name="gpt-5-mini", provider="openai")],
)
# No `typesafe` binding and no base_url: the target takes the OpenRouter key and the
# gateway root. Bind `typesafe` explicitly for a proxy in front of OpenRouter -- an
# `openrouter` binding that points at a proxy never lends its key to Jev.
bindings = [
    ProviderBinding(
        provider="openrouter",
        credentials=ProviderCredentials(api_key=os.environ["OPENROUTER_API_KEY"]),
    ),
    ProviderBinding(provider="openai", credentials=ProviderCredentials(api_key=...)),
]
client = StructuredLLMClient.from_policy(bind_policy_credentials(policy, bindings))
agent = client.make_agent(output_type=Triage, system_prompt="<context to judge>")
result = await client.run(agent=agent, user_prompt="I was charged twice.")
result.output                                        # Triage(urgent=True, team="billing")
result.response.provider_details["confidence"]       # {"urgent": 0.7, "team": 0.8}
```

Rules that follow from what Jev is:

- **The question lives on the output type**, in `Field(description=...)`, the
  model's docstring and `client.run(..., instructions=...)`. The **system prompt
  is material Jev judges** (sent as history beside the user prompt), so keep it
  to context and keep the state small: irrelevant detail is a distractor.
- **Every field must be a question Jev can answer**: `bool`, `Literal`/`Enum`
  of strings, `float` with `ge=0, le=1`, `list` of a `Literal`/`Enum`, an
  `IntEnum` rubric described per level, `Literal[...] | None`, or a nested model
  of these. A `str`, an unbounded number or a date is refused with `UserError`
  before any request -- no fallback runs, it is a wrong output type. Extract
  free text with a language model, and let Jev decide about it.
- **Do not ask Jev to compute**: it does not count, compare dates or do
  arithmetic reliably. Do that in code and ask about the result. Add an `other`
  / `None` option where a taxonomy may not cover every input, and test option
  orderings -- reordering `Literal` members can shift answers.
- **Thresholds are policy**: `decision_thresholds.boolean` (default 0.5) and
  `.tool_call` (default 0.6). Tune on labelled examples against a dated snapshot
  (`typesafe/jev-1.13-20260917`), the only name that cannot change model under you.
- **Names are OpenRouter's**: `typesafe/jev-1.13` (or `jev-1.13`), a dated snapshot,
  or `jev-latest`. TypeSafe's own `jev-1.13.0`, `jev-preview` and
  `typesafe/jev-latest` do not exist there and are refused at policy load.
- `reasoning`, `output_mode="native"` and `output_mode="prompted"` are refused on
  a `typesafe` target; `temperature` is ignored; `run_stream` yields the whole
  answer as one event.
- In a chain, a tool call Jev cannot fill (`ToolCallProposed`) and any API
  failure advance to the next member; a language-model primary failing hands
  the step to a Jev fallback. Only the hand-offs cost a language-model call.
  **Jev last or alone with tools** raises `ToolCallProposed` to the caller
  whenever it prefers a tool it cannot fill: put a language model behind it.
- A chain with **two Jev members** (`jev-latest` beside the release it resolves
  to) must pass `attempt_log` to `make_agent`: by name the two are indistinguishable.
- Cost is recorded under the **`openrouter`** provider at the `usage.cost`
  OpenRouter reports, with its generation id and `TypeSafe` as the upstream, so
  Jev calls reconcile against the OpenRouter export like any other. An answer
  that reports no cost falls back to `simpl_tracker`'s rate rows ($0.042/M input,
  output free).

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

## Rules and conventions

- Prefer `simpl_ia.core` for lightweight imports that must not pull `pymilvus` or torch. Use top-level `simpl_ia` only when Milvus or the full kitchen-sink surface is intentional.
- Declare the correct extra in the consumer's `pyproject.toml` before importing ML, vector-store, chunking, or agents submodules.
- Resolve embedding providers via `ProviderRegistry` entry points (`simpl_ia.providers` in `pyproject.toml`), not hard-coded client construction in app repos.
- Chunkers and refineries register under `simpl_ia.chunkers` / `simpl_ia.refineries` entry points — reuse those names instead of forking adapter code.

## Common pitfalls

- **Don't** `from simpl_ia import MilvusStore` in code paths that must stay pymilvus-free — first access loads pymilvus at import time.
- **Don't** import `simpl_ia.inference.embedders` without the `[ml]` extra — lazy loaders raise `ImportError` with the install hint.
- **Don't** import `simpl_ia.agents` without `[agents]` — it needs `pydantic-ai` (with its `typesafe` extra), Langfuse, and `simpl-tracker`.
- **Don't** point `provider="typesafe"` at `api.typesafe.ai` or at `https://openrouter.ai/api/v1` — the first is refused (Jev is served through OpenRouter here), the second is the chat root and the SDK appends `/v1/systemone` to whatever it is given. Leave `base_url` unset and the gateway root applies.
- **Don't** put the question for a Jev member in the system prompt — Jev judges it as material. Field descriptions, the output type's docstring and `instructions` are what it is asked.
- **Don't** assume `simpl_ia.core.vector_stores.EmbedderMetadata` and `simpl_ia.core.providers.metadata.EmbedderMetadata` are the same class — they are distinct types for different layers.
- **Don't** leave the HTTP timeout at its 60 s default for models that queue before answering — a call that stays silent that long is dropped and falls back. `AI_LLM_TIMEOUT_SECONDS`, `AI_SLOW_MODEL_TIMEOUT_SECONDS` and `AI_SLOW_MODEL_MARKERS` (see the README) raise it or move a model into the slow class without a release.

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
- Does not replace Prefect workflow orchestration — use `simpl_flow`.

## Where to go next

- Source: `https://github.com/simpl-techs/simpl_ia`
- Consumer example: `simpl_core` pins `simpl-ia` and `simpl-ia[agents]` for agent-framework
- Internal conventions: `.agent/INTERNAL.md`
