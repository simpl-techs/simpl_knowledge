#!/usr/bin/env bash
# Store a per-service Doppler token in GCP Secret Manager and grant the Cloud Run
# runtime SA accessor. Requires `gcloud auth login` first.
#
# SERVICE, SECRET_NAME, and TOKEN_FILE are required (no silent api defaults).
# Never reuse a generic GCP secret named DOPPLER_TOKEN.
#
# Usage:
#   SERVICE=simpl-ops SECRET_NAME=SIMPL_OPS_DOPPLER_TOKEN \
#     TOKEN_FILE=$HOME/.doppler/simpl-tokens/simpl_ops-prd \
#     scripts/doppler/gcp-secret.sh
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-able-yew-385106}"
REGION="${REGION:-europe-west4}"

if [[ -z "${SERVICE:-}" || -z "${SECRET_NAME:-}" || -z "${TOKEN_FILE:-}" ]]; then
  echo "SERVICE, SECRET_NAME, and TOKEN_FILE are required" >&2
  echo "example: SERVICE=simpl-api SECRET_NAME=SIMPL_API_DOPPLER_TOKEN TOKEN_FILE=\$HOME/.doppler/simpl-tokens/simpl_api-prd $0" >&2
  exit 2
fi

if [[ ! -f "$TOKEN_FILE" ]]; then
  echo "missing token file: $TOKEN_FILE" >&2
  exit 1
fi

if ! gcloud secrets describe "$SECRET_NAME" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud secrets create "$SECRET_NAME" \
    --project="$PROJECT_ID" \
    --replication-policy=automatic
fi

gcloud secrets versions add "$SECRET_NAME" \
  --project="$PROJECT_ID" \
  --data-file="$TOKEN_FILE"

RUNTIME_SA="$(gcloud run services describe "$SERVICE" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --format='value(spec.template.spec.serviceAccountName)')"
if [[ -z "$RUNTIME_SA" ]]; then
  PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
  RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
fi

gcloud secrets add-iam-policy-binding "$SECRET_NAME" \
  --project="$PROJECT_ID" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/secretmanager.secretAccessor" \
  --quiet >/dev/null

echo "Secret ${SECRET_NAME} updated for ${SERVICE}."
echo "Redeploy with a new revision that sets --clear-env-vars --set-secrets DOPPLER_TOKEN=${SECRET_NAME}:latest"
echo "Doppler value changes do not reach Cloud Run until that revision exists."
