# CutCopy Meta Model API pipeline evidence

Captured: 2026-10-27 ~10:15 KST (Asia/Seoul)
Base URL: `https://api.meta.ai/v1`
Team free credits (last Billing check): **$147.80** remaining · no payment methods

Public demo stays **keyless** on https://cutcopy.pages.dev. This log is from a local smoke using a local key (never committed).

## Models required

| Stage | Model | Result |
| --- | --- | --- |
| Segment | `sam-3.1` | OK — box+mask tokens on sample mug (follow-up call after prompt fix; first smoke hit 400 on token templates in instructions) |
| Variants | `muse-image-1.0` | OK — `images.edit` studio variant ~2.2MB PNG |
| Copy | `muse-spark-1.3` | OK — JSON title+description |

## models.list

- `sam-3.1`: present
- `muse-image-1.0`: present
- `muse-spark-1.3`: present

## Artifacts (local, not secrets)

- `pipeline-evidence/smoke-log.json` — redacted step log
- `pipeline-evidence/spark-copy.txt` — Muse Spark sample
- `pipeline-evidence/muse-studio.png` — Muse Image edit sample
- `pipeline-evidence/sam-raw-response.json` — SAM 3.1 completed response (mask payload, no API key)

## Note on SAM prompt

Live SAM calls must send a plain noun phrase (e.g. `mug`) plus `metadata.mask_encoding=one_bit`. Embedding `<|box;...|>` / `<|mask;...|>` templates in instructions returns HTTP 400. `src/lib/metaClient.ts` was updated accordingly on 2026-10-27.
