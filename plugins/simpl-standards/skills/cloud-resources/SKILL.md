---
name: cloud-resources
description: What compute and cloud credits simpl has right now (startup credit programs, HPC access windows) and what each one does NOT cover. ALWAYS consult before choosing where to deploy or run something (Cloud Run, jobs, GPUs, HPC, batch, training), before picking or adding an LLM/AI model or a Google Cloud product, and when anyone asks "is X free", "is it covered by credits", "where should I run this", "what will this cost us", "GCP credits", "startup credits", "Google for Startups", "Gemini", "Vertex AI", "Model Garden", "Marketplace", "HPC", "GPU".
---

# Cloud resources and credits

> **Auto-distributed via simpl_knowledge. Edit it in `simpl-techs/simpl_knowledge`, where changes go straight to `main`.**

The one place that says which compute we can use and who pays for it. Never call a service "free": say "covered by <program> until <date>" or "paid in cash", with the cost. A fact marked n.d. here is unknown: say so and ask Raff, do not guess.

## Status now

Update this table the day a program is approved, a credit expires or an HPC window opens or closes.

| Resource | Status (2026-10-26) | Covers | Expires |
|---|---|---|---|
| Google for Startups Cloud Program (GFSCP) | Applied, not active: the bill shows no startup credit (only ~€4.6/month of other credits, Aug–Oct 2026) | GCP first-party pay-as-you-go, see below | n.d. |
| HPC | Access for limited periods of months; provider, hardware and dates n.d. | n.d. | n.d. |
| Other credit programs | Applications in progress; which ones n.d. | n.d. | n.d. |

Scale of today's spend: GCP 1–25 Oct 2026 ≈ €1,700 ex VAT, ~85% Cloud Run, then Cloud Logging, Cloud Storage, Artifact Registry. No Vertex AI or Gemini on the GCP bill.

## GCP: NOT covered by GFSCP credits

Billed to the card even while credits are active:

- Google Workspace and Google Ads.
- Anything bought through Google Cloud Marketplace (third-party products), even when it shows on the GCP invoice.
- Third-party models in Vertex AI Model Garden (Anthropic Claude, Cohere, …): treat every non-Google model as not covered.
- Google Maps Platform: it needs its own Maps credit application.
- Any first-party product billed through a commitment (committed use discounts, spend commitments) or an annual subscription.
- Gemini Enterprise, and Antigravity (now part of Gemini Enterprise).
- Gemini Provisioned Throughput on annual terms, and any Provisioned Throughput for partner models.
- Security Command Center Premium annual and SCC Enterprise.
- Looker bought through a contract, whatever the SKU.
- Nothing after expiry: credits are never extended.

## GCP: covered

- First-party pay-as-you-go services: Cloud Run, Compute Engine (GPUs included), Cloud Storage, BigQuery, Logging, Artifact Registry, … Lists: https://cloud.google.com/terms/services and https://cloud.google.com/skus/sku-groups/select-google-cloud-offerings.
- Gemini API pay-as-you-go, on Vertex AI or through Google AI Studio API SKUs, only when billed to our credited GCP billing account.
- Veo 3.
- Gemini Provisioned Throughput for Google models on 1-week, 1-month or 3-month terms, inside the credit validity.
- SCC Premium pay-as-you-go.
- Looker Studio Pro monthly pay-as-you-go bought online (since 2025-07-01).

## Rules

- Gemini through Cheaper Inference, OpenRouter or any other gateway is billed by the gateway, never by Google credits (`simpl_ia` `cheaper_inference` calls `gemini-*` that way). Only calls billed to our GCP billing account count.
- Before proposing a Google Cloud product, check it is first-party pay-as-you-go. Marketplace, partner models, commitments and subscriptions are cash: say so and give the cost.
- Do not buy committed use discounts or annual plans while on credits: they are paid in cash on top of the credit.
- A plan that moves work onto credits or HPC states the cost after they end and the end date. Credits that expire mid-project do not make it cheap.
- Prefer covered resources for heavy one-off work (backfills, batch, embeddings, training) while a window is open; check the Expires column first.
- Every new resource keeps cost tracking and the `simpl_repo` label (`state-and-persistence`, Observability), credits or not.

## Where to check

- Bill: `cost_tracking.gcp_billing_cost` (`cost_eur` gross, `credits_eur`, `net_eur`, per day, service and resource), shown on `/dashboard/costs` Infra tab. Credits there are all credit types summed.
- Credit balance and expiry: Cloud Console → Billing → Credits (not in the billing export).
- Quota increases: https://docs.cloud.google.com/docs/quotas/view-manage. Gemini API rate limits: https://ai.google.dev/gemini-api/docs/rate-limits.
- Cost estimates: https://cloud.google.com/products/calculator.
