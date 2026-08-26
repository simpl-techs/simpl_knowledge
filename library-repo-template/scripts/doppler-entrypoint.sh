#!/bin/sh
# Inject Doppler secrets when DOPPLER_TOKEN is present; otherwise run as-is.
# Always pass project/config explicitly so a checked-in doppler.yaml cannot
# leave the CLI with an empty config (Cloud Run then exits before binding PORT).
set -eu
if [ -n "${DOPPLER_TOKEN:-}" ]; then
  export DOPPLER_TOKEN="$(printf '%s' "$DOPPLER_TOKEN" | tr -d '\r\n')"
  if [ -n "${DOPPLER_PROJECT:-}" ] && [ -n "${DOPPLER_CONFIG:-}" ]; then
    exec doppler run --project "$DOPPLER_PROJECT" --config "$DOPPLER_CONFIG" -- "$@"
  fi
  exec doppler run -- "$@"
fi
exec "$@"
