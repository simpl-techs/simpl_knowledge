---
name: testing-policy
description: Our testing philosophy, coverage targets, and conventions for writing tests. Use whenever adding, modifying, or reviewing tests; when generating tests from a spec; or when the user asks "how do we test X here". ALWAYS consult before writing tests, even simple unit tests, so test names, structure, and assertions match our patterns.
---

# Testing Policy

## Pyramid

- **Unit** (60% of tests): pure logic, no I/O, fast (<50ms each). Prefer these.
- **Integration** (30%): exercises one subsystem (DB, HTTP, etc.) in isolation.
- **End-to-end** (10%): only for critical user flows (auth, payment). Expensive, run on CI only.

## Naming

- Python: `test_<unit_under_test>_<condition>_<expected_outcome>`, e.g. `test_batch_events_when_queue_full_flushes_immediately`. Never `test_1` or `test_batching`.
- TypeScript: describe/it, e.g. `describe("batchEvents", () => { it("flushes immediately when queue is full", ...) })`.

## Structure: Arrange-Act-Assert

Every test has three visible sections, separated by blank lines.

```python
def test_batch_events_flushes_at_limit():
    # Arrange
    tracker = Tracker(batch_size=3)

    # Act
    for i in range(3):
        tracker.track("click", {"i": i})

    # Assert
    assert tracker.flushed_count == 1
```

## Fixtures and coverage

- Shared fixtures go in `conftest.py` (Python) or `__tests__/setup.ts` (TS). A fixture used by only one test file stays in that file.
- No global state between tests, ever: use fixtures with proper teardown.
- Coverage target: 80% line coverage on new code (check the codecov bot on the PR), 100% on security-sensitive modules (`auth/`, `crypto/`, `billing/`). Coverage is not a goal in itself: meaningful assertions matter more than line count.

## Mocking (all levels)

- Mock the outside world, not the inside: external APIs (LLMs, third-party HTTP, payment providers), faked at their port, plus time (`freezegun`), randomness and the filesystem.
- Never mock your own domain logic or services, the database, the ORM, Pydantic models or simple data classes.
- Use a real database, not a mocked session: an ephemeral Postgres (test container or equivalent) with the real schema, real migrations and real RLS, triggers and views applied.
- When mocking is genuinely needed, patch the seam the consumer actually uses (a provider property, a port), not a deep private function.
- Needing 5+ mocks to test one function means the function is doing too much.
- A test that asserts the value it told a mock to return tests nothing: tautological assertions are pure cost.

## Test discipline (unit, integration and end-to-end)

- A test that does not turn red on a business-logic change defends nothing. If it only fails when its own scaffolding changes, delete it.
- End-to-end paths are the default integration shape: drive the system through its real seams (HTTP handler → service → repository → DB) and assert observable state.
- Assert on state, not on call counts: prefer "row X is now in state Y" over "method Z was called twice". Call-count assertions break under harmless refactors.
- Test commands and queries separately. Query tests assert returned shape and filtering; command tests assert state transitions, idempotency under retry and concurrent-claim safety. The command/query model is in `architecture-discipline`, the retry and claim semantics in `state-and-persistence`.
- Tests import from canonical paths. When code moves, update the tests' imports; never add a shim to keep them green.
- Delete tests pointing at removed modules: a failing import is signal, not noise.
- Integration tests live next to the canonical code: tests follow the code home.

## Fixture data

Also in `data-flow-discipline` → *Test and fixture data discipline*.

- Real production data is confined to replay tests whose explicit purpose is to reproduce a historical production trace. Real names, identifiers, contact details and UUIDs never appear in prompts, unit tests or shared fixtures.
- Generic example data is obviously fake: use values that cannot be mistaken for real ones (e.g. `example.com` domains, zero-padded numbers, all-zero UUIDs). Anonymized-real values are worse than obviously-fake ones because they pass eyeballing and hide PII leaks.

## For agents

- Before writing a new test, read 2-3 existing tests in the same repo and match their style.
- Never delete or `@pytest.mark.skip` a failing test without asking the human: it may be catching a real regression. Exception: tests of removed modules, which you delete (see above).
- When the human asks "write a test for X", write ONE focused test first, show it, then offer to add more.
