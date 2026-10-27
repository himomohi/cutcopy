# CutCopy — Meta Global AI Developer Hackathon Write-up

**Track:** Indie Developer  
**Theme:** Build for Your World  
**Demo mode today:** public https://cutcopy.pages.dev is keyless mock; local live mode wired (SAM 3.1 + Muse Image + Muse Spark). Free credits on Billing (~$149.53). Payment method removed for credit-only spend.

## Problem

Independent sellers and small brands often have one good phone photo of a product and nothing else. Hiring a photographer, retoucher, and copywriter for every SKU is slow and expensive. The listing stalls, or goes live with a messy background and weak copy.

## Users

- Solo sellers on marketplaces who shoot products at home
- Small brand operators who need listing kits without a studio
- Anyone who wants a cutout, three scene variants, and SEO copy from one upload

## Solution

CutCopy turns one product photo into a listing kit:

1. **SAM 3.1** segments the product and yields a transparent cutout in the browser  
2. **Muse Image** restages that cutout into three listing scenes (studio, kitchen, outdoor)  
3. **Muse Spark** writes a short SEO title and description from the cutout and subject

The UI walks the same pipeline in mock mode (no API key) and in live mode (Meta Model API key present).

## How Meta models fit

| Step | Model | Role |
| --- | --- | --- |
| Cutout | `sam-3.1` | Product mask via Responses API; client decodes one-bit mask |
| Variants | `muse-image-1.0` | Product-preserving scene edits via OpenAI-compatible `images.edit` |
| Copy | `muse-spark-1.3` | Listing title + description via Responses API |

Base URL: `https://api.meta.ai/v1` (OpenAI SDK). Mock mode keeps the demo public without charging pay-as-you-go.

## Judging criteria mapping

| Criterion | Weight | How CutCopy addresses it |
| --- | --- | --- |
| Impact | 30% | Removes studio + copywriter bottleneck for indie sellers; one photo → shippable listing assets |
| Meta tooling | 25% | Live Meta Model API client for SAM 3.1, Muse Image, and Muse Spark; public demo stays keyless mock |
| Demo | 25% | Single-screen upload → cutout → three variants → copy; works offline in mock for judges |
| Tech | 20% | Client-side mask decode, parallel image variants, graceful partial failures, OpenAI-compatible client |

## Scope (demo-core)

**In:** upload, SAM cutout path, three Muse Image variants, Muse Spark copy, mock/live switch, English UI.  
**Out:** auth, payments, D1/R2, multi-SKU catalog, paid Cloudflare add-ons.

## Status gates (MetCaster)

Done: $150 credit claim · credits visible · MODEL_API_KEY installed locally · live client wired · models.list smoke · Payment method removed for credit-only spend.

Held until explicit yes: Official Rules accept, Discord, idea switch on portal from meeting-summary → CutCopy, live image/SAM spend for judge screenshots (may need temporary card), final submit, demo video packaging.
