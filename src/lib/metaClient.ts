import OpenAI from 'openai'
import { blobToDataUrl, renderMockVariants } from './image'
import { hashString, mockListingCopy, mockMask } from './mock'
import { parseSamOutput } from './samMask'
import type { ImageVariant, ListingCopy, Mode, SegmentationMask, Size } from './types'
import { ESTIMATE_USD, assertBudgetAllows, recordSpendUsd } from './budget'
import {
  clearSessionKey as clearStoredKey,
  getSessionKey,
  setSessionKey as storeSessionKey,
} from './sessionKey'

export const META_BASE_URL = 'https://api.meta.ai/v1'

export const MODELS = {
  segment: 'sam-3.1',
  image: 'muse-image-1.0',
  copy: 'muse-spark-1.3',
} as const

// Optional local-dev default baked at build time. The deployed pages.dev
// build ships without one; there the runtime session key is the live path.
const BUILD_MODEL_API_KEY = (import.meta.env.VITE_MODEL_API_KEY ?? '').trim()

let client: OpenAI | undefined
let clientKey = ''

/** Runtime session key first, build-time default second. */
export function getActiveKey(): string {
  return getSessionKey() || BUILD_MODEL_API_KEY
}

export function getMode(): Mode {
  return getActiveKey() ? 'live' : 'mock'
}

/** Save a runtime key to this browser session only and reset the client. */
export function setSessionKey(key: string): void {
  storeSessionKey(key)
  client = undefined
  clientKey = ''
}

/** Drop the runtime key, return to mock, and drop the client. */
export function clearSessionKey(): void {
  clearStoredKey()
  client = undefined
  clientKey = ''
}

function redactKey(message: string, key: string): string {
  return key ? message.split(key).join('[redacted]') : message
}

export function publicErrorMessage(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'The request failed. Please try again.'
  let message = raw.trim() || 'The request failed. Please try again.'
  message = redactKey(message, getSessionKey())
  message = redactKey(message, BUILD_MODEL_API_KEY)
  return message
}

function metaClient(): OpenAI {
  const key = getActiveKey()
  if (!key) {
    throw new Error('Paste a Model API key in the header to run live requests.')
  }
  if (!client || clientKey !== key) {
    client = new OpenAI({
      baseURL: META_BASE_URL,
      apiKey: key,
      dangerouslyAllowBrowser: true,
      maxRetries: 1,
      timeout: 180_000,
    })
    clientKey = key
  }
  return client
}

function extractOutputText(response: unknown): string {
  if (!response || typeof response !== 'object') return ''
  const record = response as { output_text?: unknown; output?: unknown }
  if (typeof record.output_text === 'string' && record.output_text.trim()) {
    return record.output_text
  }
  if (!Array.isArray(record.output)) return ''

  const parts: string[] = []
  for (const item of record.output) {
    if (!item || typeof item !== 'object') continue
    const content = (item as { content?: unknown }).content
    if (!Array.isArray(content)) continue
    for (const part of content) {
      if (!part || typeof part !== 'object') continue
      const value = part as { type?: unknown; text?: unknown }
      if (value.type === 'output_text' && typeof value.text === 'string') {
        parts.push(value.text)
      }
    }
  }
  return parts.join('\n')
}

function parseListingCopy(text: string): ListingCopy {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')

  if (start >= 0 && end > start) {
    try {
      const value: unknown = JSON.parse(cleaned.slice(start, end + 1))
      if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>
        const title = typeof record.title === 'string' ? record.title.trim() : ''
        const description =
          typeof record.description === 'string' ? record.description.trim() : ''
        if (title && description) return { title, description }
      }
    } catch {}
  }

  const titleMatch = cleaned.match(/(?:^|\n)\s*title\s*[:\-]\s*(.+)/i)
  const descriptionMatch = cleaned.match(/(?:^|\n)\s*description\s*[:\-]\s*([\s\S]+)/i)
  const matchedTitle = titleMatch?.[1]?.trim()
  const matchedDescription = descriptionMatch?.[1]?.trim()
  if (matchedTitle && matchedDescription) {
    return { title: matchedTitle, description: matchedDescription }
  }

  const lines = cleaned
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length >= 2) {
    const title = (lines[0] ?? '').replace(/^title\s*[:\-]\s*/i, '').trim()
    const description = lines
      .slice(1)
      .join(' ')
      .replace(/^description\s*[:\-]\s*/i, '')
      .trim()
    if (title && description) return { title, description }
  }

  throw new Error('Muse Spark returned copy in an unexpected format. Please try again.')
}


function requireBudget(estimatedUsd: number): void {
  const decision = assertBudgetAllows(estimatedUsd)
  if (!decision.ok) {
    throw new Error(decision.reason)
  }
}

export async function segmentProduct(
  file: File,
  subject: string,
  imageSize: Size,
): Promise<SegmentationMask> {
  if (!getActiveKey()) {
    return mockMask(imageSize, hashString(`${file.name}:${file.size}:${subject}`))
  }

  requireBudget(ESTIMATE_USD.segment)

  const imageUrl = await blobToDataUrl(file)
  const response = await metaClient().responses.create({
    model: MODELS.segment,
    instructions:
      'You localize products in photos. Return one <|box;x1=..;y1=..;x2=..;y2=..;w=..;h=..|> ' +
      'and one <|mask;data=H,W,<payload>|> pair per matching instance, using one_bit mask ' +
      'encoding. Coordinates are pixels in the input image. Return only those tokens, no prose. ' +
      'Write in English.',
    input: [
      {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: `Find every instance of this product: ${subject}. Return the box and mask tokens.`,
          },
          { type: 'input_image', image_url: imageUrl, detail: 'high' },
        ],
      },
    ],
    metadata: { mask_encoding: 'one_bit' },
  })

  const parsed = parseSamOutput(extractOutputText(response))
  if (!parsed) {
    throw new Error(
      `SAM 3.1 found no match for "${subject}". Try a shorter, concrete product noun.`,
    )
  }
  recordSpendUsd(ESTIMATE_USD.segment)
  return parsed
}

function mockGeneratedImage(prompt: string): string {
  const seed = hashString(prompt)
  const hue = seed % 360
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">',
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">',
    `<stop stop-color="hsl(${hue} 34% 20%)"/>`,
    `<stop offset="1" stop-color="hsl(${(hue + 74) % 360} 44% 56%)"/>`,
    '</linearGradient></defs>',
    '<rect width="1024" height="1024" fill="url(#g)"/>',
    '</svg>',
  ].join('')
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export async function generateImage(prompt: string): Promise<string> {
  if (!getActiveKey()) return mockGeneratedImage(prompt)

  const response = await metaClient().images.generate({
    model: MODELS.image,
    prompt,
    n: 1,
    size: '1024x1024',
    output_format: 'png',
  })

  const item = response.data?.[0]
  const dataUrl = item?.b64_json
    ? `data:image/png;base64,${item.b64_json}`
    : item?.url
  if (!dataUrl) throw new Error('Muse Image returned no image.')
  return dataUrl
}

interface VariantSpec {
  id: string
  label: string
  description: string
  prompt: (subject: string) => string
}

const VARIANT_SPECS: VariantSpec[] = [
  {
    id: 'studio',
    label: 'Studio',
    description: 'Seamless warm-white set',
    prompt: (subject) =>
      `Rephotograph the exact product from the reference image (a ${subject}) unchanged on a seamless warm-white studio sweep. ` +
      'Keep the product identical in shape, color, material, and proportions. Soft key light from the left, gentle contact shadow, ' +
      'premium e-commerce catalog photography, centered square composition. No text, no logos, no extra products, no props.',
  },
  {
    id: 'kitchen',
    label: 'Kitchen',
    description: 'Morning window light',
    prompt: (subject) =>
      `Place the exact product from the reference image (a ${subject}) unchanged on a light oak kitchen counter. ` +
      'A linen napkin and a ceramic cup sit softly out of focus in the background. Warm morning window light, shallow depth of field, ' +
      'editorial lifestyle product photography, product centered and fully visible. No text, no logos, no extra products.',
  },
  {
    id: 'garden',
    label: 'Garden',
    description: 'Sunlit stone ledge',
    prompt: (subject) =>
      `Place the exact product from the reference image (a ${subject}) unchanged on a sunlit stone ledge. ` +
      'Green foliage and soft shadows blur behind it. Natural daylight, premium outdoor lifestyle campaign photography, ' +
      'product centered and fully visible. No text, no logos, no extra products.',
  },
]

async function editVariant(
  image: File,
  subject: string,
  spec: VariantSpec,
): Promise<ImageVariant> {
  const response = await metaClient().images.edit({
    model: MODELS.image,
    image,
    prompt: spec.prompt(subject),
    n: 1,
    size: '1024x1024',
    output_format: 'png',
  })

  const item = response.data?.[0]
  const dataUrl = item?.b64_json
    ? `data:image/png;base64,${item.b64_json}`
    : item?.url

  if (!dataUrl) throw new Error('Muse Image returned no image.')
  return {
    id: spec.id,
    label: spec.label,
    description: spec.description,
    dataUrl,
  }
}

export async function createVariants(
  cutout: Blob,
  subject: string,
): Promise<ImageVariant[]> {
  if (!getActiveKey()) {
    return renderMockVariants(cutout)
  }

  requireBudget(ESTIMATE_USD.variant * VARIANT_SPECS.length)

  const image = new File([cutout], 'cutout.png', { type: 'image/png' })
  const settled = await Promise.allSettled(
    VARIANT_SPECS.map((spec) => editVariant(image, subject, spec)),
  )

  const variants: ImageVariant[] = []
  let firstError: unknown
  for (const result of settled) {
    if (result.status === 'fulfilled') variants.push(result.value)
    else if (firstError === undefined) firstError = result.reason
  }

  if (variants.length === 0) {
    throw new Error(
      `Muse Image could not render the variants. ${publicErrorMessage(firstError)}`,
    )
  }
  recordSpendUsd(ESTIMATE_USD.variant * variants.length)
  return variants
}

const COPY_INSTRUCTIONS = [
  'You write e-commerce listing copy for product photos.',
  'Return ONLY a JSON object with exactly two string keys: "title" and "description".',
  'No markdown, no code fences, no extra keys.',
  'Title: an SEO product title, 45-70 characters, title case, no brand names, no prices, no emojis.',
  'Description: 1-2 sentences, 140-170 characters, benefit-led and factual, no hashtags, no emojis.',
  'Use the reference image as the source of truth for color, material, and form.',
  'Do not invent certifications, materials, or sustainability claims.',
  'Write in English.',
].join(' ')

export async function writeListingCopy(
  subject: string,
  cutoutDataUrl: string,
): Promise<ListingCopy> {
  if (!getActiveKey()) {
    return mockListingCopy(subject, hashString(subject || 'product'))
  }

  requireBudget(ESTIMATE_USD.copy)

  const response = await metaClient().responses.create({
    model: MODELS.copy,
    instructions: COPY_INSTRUCTIONS,
    max_output_tokens: 400,
    input: [
      {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: `Product subject: ${subject}. Identify the product from the reference image and write the listing copy as JSON.`,
          },
          { type: 'input_image', image_url: cutoutDataUrl, detail: 'high' },
        ],
      },
    ],
  })

  const copy = parseListingCopy(extractOutputText(response))
  recordSpendUsd(ESTIMATE_USD.copy)
  return copy
}
