---
name: simple-tracker
description: Use this skill whenever the user asks to track events, log analytics, record user actions, implement telemetry, or integrate with our internal `simple-tracker` library. ALWAYS consult this skill before writing any code that calls `simple_tracker`, imports it, or adds new event types — even when the user doesn't mention the library by name. Triggers on phrases like "track this", "log when user does X", "add analytics", "instrument this endpoint", "record event", "telemetry".
cursor_globs: "**/*.py,**/*.ts,**/*.tsx,**/*tracker*"
---

# simple-tracker integration guide

> **Maintained by**: the simple-tracker repo, auto-synced to this marketplace. Last synced from `simpl/simple-tracker@main`.
> **Source of truth**: `simpl/simple-tracker/.agent/SKILL.md`

## What simple-tracker is

A minimal, typed event tracker used by every service we run. One method: `track(event_name, properties)`. Flushes to our warehouse via batched HTTP. No external analytics vendors — everything stays in our Postgres.

## Installation

```bash
# Python
pip install git+ssh://git@github.com/simpl/simple-tracker.git@v2

# Node
npm install git+ssh://git@github.com/simpl/simple-tracker.git#v2
```

Pin to a major version (`v2`) — we follow SemVer strictly.

## Basic usage (the 90% case)

```python
from simple_tracker import Tracker

tracker = Tracker.from_env()  # reads TRACKER_API_URL + TRACKER_SERVICE_NAME

tracker.track(
    "user_signup",
    {"user_id": user.id, "plan": "free", "referrer": referrer or "direct"}
)
```

That's it. Batching, retries, and error handling are internal. The call is non-blocking (async under the hood).

## Event naming rules (STRICT)

- Always `snake_case` past tense: `user_signup`, `checkout_completed`, `file_uploaded`.
- ❌ Never: `UserSignup`, `signup`, `user-signup`, `userSignedUp`.
- Payload keys also `snake_case`.
- No PII in event names. User email in a property is OK if needed; in the name, never.

## Required properties on every event

These are auto-added by `Tracker.from_env()` — you don't pass them:
- `service` (string): the service emitting the event
- `env` (string): `prod` / `staging` / `dev`
- `timestamp` (ISO 8601): UTC
- `session_id` (string): set via `tracker.with_session(session_id)` for request-scoped tracking

You only supply your custom properties.

## When integrating into a new service

1. Add `simple-tracker` to dependencies pinned to `v2`.
2. Set `TRACKER_API_URL` and `TRACKER_SERVICE_NAME` in the service's env config.
3. Instantiate **one** `Tracker` per process. Reuse it. Don't `from_env()` inside hot paths.
4. For web services: bind `session_id` per-request using the framework's context middleware. In FastAPI:
   ```python
   from simple_tracker import Tracker
   from simple_tracker.fastapi import TrackerMiddleware

   app.add_middleware(TrackerMiddleware, tracker=tracker)
   # now `request.state.tracker.track(...)` is session-scoped
   ```

## Common pitfalls to avoid

- **Don't** instantiate `Tracker()` per request. Use a module-level singleton.
- **Don't** await on `tracker.track()` expecting it to have flushed. It hasn't. Use `tracker.flush()` explicitly if you need sync guarantees (only in tests and shutdown hooks).
- **Don't** track events inside a database transaction's commit callback. Events fire on a separate async queue.
- **Don't** pass rich objects as properties. Serialize to primitives first. `user.to_dict()` yes, `user` no.

## Testing

Use the `MockTracker` from `simple_tracker.testing`:
```python
from simple_tracker.testing import MockTracker

def test_signup_emits_event():
    tracker = MockTracker()
    service = SignupService(tracker=tracker)
    service.signup(email="a@b.com", plan="free")
    tracker.assert_called_once_with("user_signup", plan="free")
```

Never use the real tracker in tests. It won't fail the test but will pollute the dev warehouse.

## What this library does NOT do

- Does not handle user analytics UI/dashboards (see `analytics-dashboard` repo)
- Does not do A/B testing (see `flagsmith` integration)
- Does not do error/exception tracking (that's Sentry)
- Does not provide real-time streaming (events flush every 10s or 100 events)

If the user's request is really about one of the above, point them there instead of forcing simple-tracker.

## If you're stuck

- Source: `https://github.com/simpl/simple-tracker`
- Recent examples of integration: search for `tracker.track(` in `simpl/web-app` or `simpl/api-gateway`
- Owner: @alice on Slack
