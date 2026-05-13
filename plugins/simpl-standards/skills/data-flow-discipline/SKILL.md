---
name: data-flow-discipline
description: simpl-wide rules for how data flows through the stack — thread typed data through the call graph instead of re-extracting it from rendered output, single-source state resolution, validation layering, DTO/output invariants, failure escalation vs silent no-op, fixture and PII data discipline. ALWAYS consult when designing a multi-layer pipeline, adding a derived field, deciding where validation lives, writing DTOs or response schemas, handling failure paths, or assembling test fixtures.
---

# Data-flow discipline

> **Auto-distributed via simpl_knowledge. Propose edits with a PR on `simpl-techs/simpl_knowledge`.**

This skill is **always-on**. It governs the *shape and direction* of data as it moves through the stack: how typed values flow, where decisions get made, how validation is layered, what invariants outputs must satisfy, how failures surface, and how fixtures should look.

For *where code lives*: `architecture-discipline`. For *transactions, async, observability*: `state-and-persistence`. For *tests*: `testing-policy`.

## Data flow through the stack

- **Thread typed data through the call graph; do not re-extract it from formatted output.** If a value exists as a structured field at one layer, carry it as a structured field to every layer that needs it. Parsing it back out of a rendered string downstream is fragile, lossy, and signals that a typed field was dropped one layer up.
- **Add the field rather than infer it.** When a downstream component needs a value, give it a kwarg or DTO attribute. Reconstructing data the upstream already had is a code smell that always grows worse over time.
- **Rendered output is terminal.** Once a value has been serialized for display, transport, or model consumption, it does not flow back into structured logic. The render step is one-way; everything structured must already exist before it.

## Single-source state resolution

- **Resolve a derived value exactly once, upstream; consume the result strictly downstream.** A field decided by a resolver function is not re-derived later. Downstream consumers obey the verdict and never sniff the underlying signals again. Re-derivation lets two layers drift silently, and the bug only shows up in a runtime trace.
- **Exactly one function owns the decision for one field.** Two functions that both compute the same derived value guarantee disagreement under some input. The resolver is the only place the decision lives; everything else takes it as input.
- **Resolution priority is explicit and ordered, written as one rule in one place.** When multiple signals compete (real-time input, stored state, hard constraints), the priority order is visible at the top of a single function — not scattered across `if/else` branches in different modules. The reader should be able to point at one location and read the rule end-to-end.
- **Hard constraints cap candidates; they do not replace them.** A constraint set narrows what a resolver may pick; it does not itself produce the verdict. The candidate signal and the constraint set are distinct inputs to the resolution function and stay distinct in code.

## Validation layering

- **Don't stack validation behind a final gate.** When a record reaches a stage where a human or an authoritative check approves it, redundant earlier-layer validation becomes friction that adds no signal. Stack validation only when each layer catches something the others provably cannot.
- **Validation is owned by the boundary that can enforce it deterministically.** If a structural rule (format, length, type) can be checked at a single seam, that seam owns the rule and downstream layers trust it. Concerns repeated across layers always drift over time — pick the one layer that gets it right and let the others depend on its guarantee.
- **Allow-lists are scoped to the freshest relevant input.** When checking whether output corresponds to something the system genuinely received, source the truth from the most recent inbound signal — not the cumulative history. Older context becomes noise and lets stale matches through.

## Output and DTO invariants

- **Fields of an emitted object are validated together, as a value.** Related fields constrain each other; the invariant lives on the object, not on the fields independently. Write the check as one function that takes the whole object and rejects incoherent combinations.
- **Sanitize forbidden output at the serialization seam, not via upstream instructions.** When a consumer renders a value verbatim and certain characters or shapes are forbidden, enforce that at the boundary that produces the wire format. Asking the producing layer (especially a non-deterministic one) to "just not emit them" is the wrong layer — the boundary is the only place enforcement is reliable.
- **Coherence of an emitted value is a code-level invariant.** Treat it with the same weight as a foreign-key constraint or an enum check: enforced before the value leaves the producing function, not delegated to "if the consumer cares."

## Failure surfacing

- **Internal failures escalate; they never produce a silent no-op.** A failure handled only by a log line plus a no-action return is silently discarded — the affected entity sits in production looking healthy, no retry path picks it up, no operator sees it. The two acceptable outcomes are **bounded retry** (with an explicit attempt cap and per-attempt error signal — see `state-and-persistence`) or a **structured handoff** to a reviewer queue.
- **Logging is not surfacing.** Log lines, chat-channel pings, and metrics are observability — none of them produce a follow-up action. Surfacing means the failure ends up in a persistent row, queue, or status that a retry path or a human will actually pick up.
- **Escalation outputs obey the same invariants as primary outputs.** A handoff payload (review request, retry record, error envelope) carries the same coherence guarantees as a normal DTO. "Something went wrong, decide for me" is offloading, not surfacing.

## Test and fixture data discipline

- **Real production data is confined to replay tests.** Real names, identifiers, contact details, and UUIDs do not appear in prompts, unit tests, or shared fixtures. The carve-out is replay tests whose explicit purpose is to reproduce a historical production trace — anonymizing them would erase their meaning.
- **Generic example data is obviously fake.** Use values that cannot be mistaken for real ones (`example.com` domains, zero-padded numbers, all-zero UUIDs). Anonymized-real values are worse than obviously-fake ones because they pass eyeballing and hide PII leaks.

## Does NOT do

- This skill does not cover where DTOs and resolvers live in the package layout — that's `architecture-discipline`.
- This skill does not cover transactions or retry budgets — that's `state-and-persistence`.
- This skill does not cover test structure, AAA, or mocking — that's `testing-policy` (which also incorporates fixture-data rules; the rule above is duplicated there as a fixture-design cue).

## Pointers

- `coding-standards` — the hub: universal principles + routing table.
- `architecture-discipline` — layered packaging, DTOs in the shared layer.
- `state-and-persistence` — bounded retries are the alternative to silent no-ops.
- `testing-policy` — assert on state, end-to-end shape, fixture discipline.
