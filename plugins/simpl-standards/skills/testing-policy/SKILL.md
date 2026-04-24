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

- Python: `test_<unit_under_test>_<condition>_<expected_outcome>`
  - ✅ `test_batch_events_when_queue_full_flushes_immediately`
  - ❌ `test_1`, `test_batching`
- TypeScript: describe/it style: `describe("batchEvents", () => { it("flushes immediately when queue is full", ...) })`

## Structure: Arrange-Act-Assert

Every test has three visible sections. Blank lines between them.

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

## Fixtures

- Shared fixtures go in `conftest.py` (Python) or `__tests__/setup.ts` (TS).
- A fixture that's used in only one test file stays in that file.
- No global state between tests. Ever. Use fixtures with proper teardown.

## Coverage

- Target: 80% line coverage on new code (check via codecov bot on PR).
- 100% on security-sensitive modules (`auth/`, `crypto/`, `billing/`).
- Coverage is not a goal in itself — meaningful assertions matter more than line count.

## What to mock, what not to mock

- ✅ Mock: external HTTP APIs, time (`freezegun`), randomness, the filesystem.
- ❌ Don't mock: your own domain logic, Pydantic models, simple data classes.
- If you find yourself mocking 5+ things to test one function, the function is doing too much.

## For agents specifically

- When writing a new test, first look at 2-3 existing tests in the same repo. Match style.
- Never delete or `@pytest.mark.skip` a failing test without asking the human — it may be catching a real regression.
- If the human asks "write a test for X", write ONE focused test first, show it, then offer to add more.
