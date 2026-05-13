---
name: architecture-discipline
description: simpl-wide rules for organizing code across packages, layers, and modules. ALWAYS consult before introducing a new module, splitting a file, designing a service or a repository, choosing where code should live, defining the public surface of an endpoint, or pinning an internal dependency. Covers single source of truth, layered packaging, command/query separation, reusability, file/module size, imports hygiene, duplication avoidance, dependency direction, API surface, versioning and packaging.
---

# Architecture discipline

> **Auto-distributed via simpl_knowledge. Propose edits with a PR on `simpl-techs/simpl_knowledge`.**

This skill is **always-on**. It governs how code is organized at simpl. The universal principles (no defensive code, errors are loud, search before writing, simple linear atomic operations) live in `coding-standards`; this skill goes deeper on the structural decisions: where things live and how they compose.

If the decision is about state/transactions/async, open `state-and-persistence` instead. If it is about how data threads through layers and DTOs, open `data-flow-discipline`.

## Code organization

- **Single source of truth per concept.** Each model, repository, or service has exactly one canonical home. No second copy in another package.
- **Layered packaging by abstraction level.** Generic database/ORM primitives, shared domain logic, and concrete consumer applications live in separate packages and never blur.
- **Repositories live at the layer that owns the table.** A repository for a given table ships in the shared domain package, not duplicated in each consumer.
- **Cross-table aggregators are services, not repositories.** A repository binds to one table; anything that joins or composes multiple is a service.
- **Services live where their consumer is, unless reusable.** Single-consumer services stay local; anything used by two or more consumers is promoted to the shared layer.
- **Plugin / port pattern for inversions.** When a shared service needs infrastructure owned by a consumer, expose a `Protocol`/interface in the shared layer and inject the concrete implementation from the consumer.

## Command/query separation

- **A method is either a command or a query — never both.** Reads return data and have no side effects; commands change state and may not return queryable data beyond an outcome.
- **Queries are idempotent and cacheable; commands are not.** Treat them as different categories with different concerns (auth, retries, logging, timeouts).
- **Commands carry an idempotency key.** Either explicit (caller-provided) or derived from stable state (entity id + transition). A retried command must produce the same outcome as a single execution. See `state-and-persistence` for persistence.
- **Queries do not write.** No "fetch and update last_seen", no "read and mark read" inside a query path. Split into two operations and let the consumer order them.
- **Avoid mixed services.** A service that reads, decides, mutates, and notifies in one method body is hard to reuse anywhere else — split it.
- **Expose primitives, let consumers orchestrate.** The leaf service exposes narrow command and query operations; orchestration is the consumer's job.
- **No "do everything for this entity" methods.** Methods that fetch, branch on rules, mutate multiple tables, and emit events can only ever be called from one place — and they are nearly impossible to test or reuse.

## Reusability discipline

- **Optimize for the second caller, not the first.** A service called from one place is not yet a service; design as if a second consumer is coming.
- **No hidden orchestration in the leaf.** If a service needs another service to do its job, take it as a constructor dependency — do not import it lazily and call it in the middle of a method.
- **Side effects are explicit return values when possible.** Return what was changed/written so the caller can decide what to do next (notify, log, chain).
- **Stateless across requests.** Constructors take long-lived collaborators (session, clients); methods take per-call inputs. No mutable state on the service instance that outlives a single call.

## File and module size

- **Files have one reason to change.** A file that imports across more than two domains is a smell.
- **Hard ceiling on file size.** Warn at a few hundred lines, split at four-digit lines. Files that house "everything for X" must be split by responsibility.
- **An entry point is a wiring file, not an implementation file.** The application's entry module composes dependencies and starts the process; it does not host business logic.
- **Resist "context-window" thinking.** A file is not better because an LLM can load it whole. Large files concentrate change risk and mask coupling.
- **Split by axis of change.** Separate I/O from policy, schema from logic, transport from domain. If two parts of a file change for unrelated reasons, they belong in different files.

## Imports and module hygiene

- **No re-export shims.** When code moves, delete the old file; do not leave a module that re-imports from the new location.
- **Direct imports from the canonical module.** Import from the file that defines the symbol, not via wrapper packages or star re-exports.
- **`__init__.py` exports only the package's own code.** Do not re-export downstream modules to "smooth over" a move or rename.
- **`TYPE_CHECKING` only for type-only imports that would otherwise cycle.** Not a place to hide runtime imports.
- **Lazy `from x import y` inside a property** is acceptable to break runtime cycles in factories/providers, but the path must be the canonical one.

## Avoiding duplication

- **Search before adding.** Before writing a new query, model, or service, check whether the shared layer already exposes the same data or behavior. Across the org: see `internal-libraries-awareness`.
- **Consolidate when the same data is queried via two or more mechanisms.** Parallel paths to the same fact are a smell — pick one.
- **Don't reimplement what the database already exposes.** If a view, function, or RPC returns the result, query it directly instead of replicating the joins in code.
- **Delete duplicate models.** No mirror copies of the same row shape across packages.
- **No grab-bag utility modules.** Cross-cutting helpers (retry, sanitization, time, logging) live in named, single-purpose modules. If `utils.py` grows beyond a handful of cohesive functions, split it by domain.

## Dependency direction

- **Strict acyclic graph.** Generic primitives → shared domain → consumer applications. No back-edges.
- **Consumers do not import each other as libraries.** If two consumers need the same code, it belongs in the shared layer.
- **Use ports / `Protocol`s for inverted dependencies.** Lets a consumer inject infrastructure (LLMs, HTTP clients, schedulers) without the shared layer taking on the dep.
- **Prefer "consumer" over "library" for application packages.** A package that is both deployed and imported by other packages tends to accumulate everything.

## API surface

- **HTTP/RPC handlers are thin.** Authenticate, parse, delegate to a domain service, return.
- **No business logic in route handlers.** If a handler calls multiple repositories, runs an LLM, or branches on domain rules, that work belongs in a service.
- **Endpoints expose commands or queries, not both.** A single endpoint that reads-then-writes-conditionally is two endpoints in disguise.
- **Shared schemas / DTOs live in the shared layer.** Endpoint-only request/response shapes can live with the endpoint. Coherence rules for DTOs: see `data-flow-discipline`.

## Versioning and packaging

- **Pin git/internal deps to explicit tags.** No floating refs (head, branch names) and no missing pins.
- **Bump versions on every release.** Patch for additive/internal, minor for new public surface, major for breaking.
- **Update transitive pins in lock-step.** When a shared package bumps, every package pinning it bumps and updates the pin in the same change.
- **Commit lockfiles.** Reproducible builds across environments.
- **One packaging metadata convention per package.** Mixing styles in the same manifest is a source of drift.

## Does NOT do

- This skill does not cover transactions, locking, async/IO, or bounded execution — those are in `state-and-persistence`.
- This skill does not cover DTO field invariants, validation layering, or how data threads through layers — those are in `data-flow-discipline`.
- This skill does not cover test structure — that's `testing-policy`.

## Pointers

- `coding-standards` — the hub: universal principles + routing table.
- `state-and-persistence` — transactions, async, bounded execution, observability.
- `data-flow-discipline` — typed data through layers, DTO invariants, failure surfacing.
- `internal-libraries-awareness` — search the org catalog before adding new integration code.
