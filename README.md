# CutCopy

Product photo to listing assets with Meta models.

CutCopy turns one product phone photo into a marketplace listing kit: product cutout, staged scene variants, and SEO title plus description. Built for the Meta Global AI Developer Hackathon (Indie / Build for Your World).

## Live demo

**https://cutcopy.pages.dev** — keyless mock. No API key is embedded. Use **Use sample mug**, then Generate. Optional Live mode accepts a Meta Model API key in the browser session only; the key stays in that browser and is never uploaded to CutCopy.

## Meta models

| Model | Role |
| --- | --- |
| `sam-3.1` | Product segmentation / cutout |
| `muse-image-1.0` | Listing scene variants |
| `muse-spark-1.3` | Listing title and description |

Happy path uses all three in one Generate click when Live mode has a key.

## Stack

Vite, React, TypeScript, OpenAI-compatible client → Meta Model API (`api.meta.ai/v1`), Cloudflare Pages (free, keyless public build).

## Local development

```bash
npm install
cp .env.example .env.local
# optional: paste Meta Model API key into VITE_MODEL_API_KEY for Live
npm run dev
```

Leave `VITE_MODEL_API_KEY` empty to run the deterministic offline mock.

```bash
npm run build
npm run preview
```

## Security

- Do not commit `.env`, `.env.local`, or any API keys.
- Public deploy is keyless. Runtime Live key uses `sessionStorage` in the browser only.
- Error messages redact active keys before they reach the UI.

## License

MIT — see repository for details if present; otherwise hackathon demo source shared as-is for judging.

## Meta model integration evidence

Local smoke on 2026-10-27 (Asia/Seoul) against `https://api.meta.ai/v1` with a **local** API key (not in this repo or the pages.dev build):

| Stage | Model | Result |
| --- | --- | --- |
| Segment | `sam-3.1` | OK — box + one_bit mask on sample mug |
| Variants | `muse-image-1.0` | OK — `images.edit` studio PNG |
| Copy | `muse-spark-1.3` | OK — SEO title + description JSON |

`models.list` returned the three required model ids. Full redacted log: [`PIPELINE-EVIDENCE.md`](./PIPELINE-EVIDENCE.md) (also mirrored under the hackathon Drive folder when updated). Public demo remains keyless mock; paste a key in the header only in your own browser to run Live.
