---
name: architecture-discipline
description: simpl-wide rules for organizing code across packages, layers, and modules. ALWAYS consult before introducing a new module, splitting a file, designing a service or a repository, choosing where code should live, defining the public surface of an endpoint, or pinning an internal dependency. Covers single source of truth, layered packaging, command/query separation, reusability, file/module size, imports hygiene, duplication avoidance, dependency direction, API surface, versioning and packaging.
---

# Architecture discipline

> **Auto-distributed via simpl_knowledge. Propose edits with a PR on `simpl-techs/simpl_knowledge`.**

This skill is **always-on**. It covers where code lives and how it composes. The universal principles (no defensive code, errors are loud, search before writing, simple linear atomic operations) and the routing table live in the `coding-standards` hub. Not covered here (open the named skill instead):
- State, transactions, locking, async/IO, bounded execution, observability: `state-and-persistence`.
- How data threads through layers and DTOs, DTO field invariants, validation layering, failure surfacing: `data-flow-discipline`.
- Test structure: `testing-policy`.

## Packages and layers

- **Single source of truth per concept.** Each model, repository or service has exactly one canonical home. No second copy in another package and no mirror of the same row shape; delete duplicate models.
- **Layered packaging by abstraction level.** Generic database/ORM primitives, shared domain logic and concrete consumer applications live in separate packages that never blur. Dependencies form a strict acyclic graph, primitives → shared domain → consumers, with no back-edges.
- **Repositories live at the layer that owns the table:** the shared domain package, not duplicated in each consumer. A repository binds to one table; a cross-table aggregator (anything that joins or composes more than one table) is a service, not a repository.
- **Services live where their consumer is, unless reusable.** Single-consumer services stay local; anything used by two or more consumers is promoted to the shared layer. Consumers never import each other as libraries: code two consumers need goes in the shared layer.
- **Ports (plugin pattern) for inverted dependencies.** When shared code needs infrastructure a consumer owns (LLMs, HTTP clients, schedulers), the shared layer exposes a `Protocol`/interface and the consumer injects the concrete implementation, so the shared layer never takes on the dependency.
- **Prefer "consumer" over "library" for application packages.** A package that is both deployed and imported by other packages tends to accumulate everything.

## Commands and queries

- **A method is a command or a query, never both.** A query returns data and has no side effects. A command changes state and may not return queryable data beyond an outcome.
- **Queries do not write.** No "fetch and update last_seen", no "read and mark read" in a query path: split it into two operations and let the consumer order them.
- **Queries are idempotent and cacheable; commands are not.** Treat them as categories with different concerns (auth, retries, logging, timeouts).
- **Commands carry an idempotency key,** explicit (caller-provided) or derived from stable state (entity id + transition). A retried command must produce the same outcome as a single execution. Persisting the key: `state-and-persistence`.
- **Expose primitives; consumers orchestrate.** A leaf service exposes narrow command and query operations. No mixed services and no "do everything for this entity" methods: a method body that reads, decides, mutates one or more tables and notifies or emits events can only be called from one place and is nearly impossible to test or reuse, so split it.

## Reusable services

- **Optimize for the second caller, not the first.** A service called from one place is not yet a service; design as if a second consumer is coming.
- **No hidden orchestration in the leaf.** A service that needs another service takes it as a constructor dependency, never as a lazy import called in the middle of a method.
- **Side effects are explicit return values when possible.** Return what was changed or written so the caller decides what comes next (notify, log, chain).
- **Stateless across requests.** Constructors take long-lived collaborators (session, clients); methods take per-call inputs. No mutable instance state outlives a single call.

## Files, imports and module hygiene

- **A file has one reason to change.** Split by axis of change: I/O from policy, schema from logic, transport from domain. Parts that change for unrelated reasons belong in different files. A file that imports across more than two domains is a smell.
- **Hard ceiling on file size:** warn at a few hundred lines, split at four-digit lines. Split files that house "everything for X" by responsibility. Resist context-window thinking: a file is not better because an LLM can load it whole, and large files concentrate change risk and mask coupling.
- **An entry point is a wiring file.** It composes dependencies and starts the process; it hosts no business logic.
- **No re-export shims.** When code moves, delete the old file instead of leaving a module that re-imports from the new location. `__init__.py` exports only the package's own code, never downstream modules to smooth over a move or rename.
- **Import from the canonical module** that defines the symbol, not via wrapper packages or star re-exports.
- **`TYPE_CHECKING` only for type-only imports that would otherwise cycle,** never to hide runtime imports. A lazy `from x import y` inside a property is acceptable to break a runtime cycle in factories/providers, but the path must be the canonical one.

## Duplication

- **Search before adding** a query, model, service or integration (`coding-standards`). Check whether the shared layer already exposes the same data or behavior; across the org, search the catalog with `internal-libraries-awareness`.
- **One mechanism per fact.** When the same data is queried via two or more mechanisms, consolidate on one: parallel paths to the same fact are a smell.
- **Do not reimplement what the database already exposes.** If a view, function or RPC returns the result, query it directly instead of replicating the joins in code.
- **No grab-bag utility modules.** Cross-cutting helpers (retry, sanitization, time, logging) live in named, single-purpose modules. Split a `utils.py` by domain once it grows beyond a handful of cohesive functions.

## API surface

- **HTTP/RPC handlers are thin:** authenticate, parse, delegate to a domain service, return. No business logic in handlers: one that calls more than one repository, runs an LLM or branches on domain rules holds logic that belongs in a service.
- **An endpoint exposes a command or a query, not both.** One that reads, then writes conditionally, is two endpoints in disguise.
- **Shared schemas/DTOs live in the shared layer;** endpoint-only request/response shapes can live with the endpoint. DTO coherence rules: `data-flow-discipline`.

## Versioning and packaging

- **Pin git/internal deps to explicit tags.** No floating refs (head, branch names), no missing pins.
- **Bump the version on every PR.** PATCH by default, new public surface included; MINOR only when the PR body justifies it; MAJOR only for breaking changes and only as a team decision. Full policy: `git-workflow` → *Version bumps*.
- **Update transitive pins in lock-step.** When a shared package bumps, every package pinning it bumps and updates the pin in the same change.
- **Commit lockfiles** for reproducible builds across environments.
- **One packaging metadata convention per package.** Mixing styles in the same manifest causes drift.
