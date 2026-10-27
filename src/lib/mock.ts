import type { ListingCopy, SegmentationMask, Size } from './types'

const FALLBACK_PRODUCTS = [
  'ceramic mug',
  'linen tote',
  'pour-over set',
  'desk lamp',
  'travel tumbler',
  'stoneware bowl',
]

const ADJECTIVES = ['Everyday', 'Handcrafted', 'Studio', 'Quietly refined', 'Signature']
const MOMENTS = ['slow mornings', 'daily rituals', 'a calmer desk', 'weekend hosting', 'thoughtful gifting']
const DETAILS = [
  'Balanced proportions and a soft matte finish feel considered from every angle.',
  'Warm materials and clean lines suit modern and classic rooms alike.',
  'Subtle texture and a grounded shape give it a premium presence.',
  'Honest materials and a tactile finish make it an easy everyday pick.',
]
const CLOSERS = [
  'A quiet upgrade for the counter.',
  'Made to be used daily and photographed often.',
  'Ready to anchor a shelf, a table, or a campaign.',
  'The kind of piece that makes the everyday feel intentional.',
]

export function hashString(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function pick<T>(values: T[], seed: number, shift = 0): T {
  return values[(seed >>> shift) % values.length] ?? values[0]!
}

function titleCase(value: string): string {
  return value.replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
}

export function mockMask(size: Size, seed: number): SegmentationMask {
  const width = Math.max(1, Math.round(size.width))
  const height = Math.max(1, Math.round(size.height))
  const ratio = width / height
  const longSide = 128
  const maskWidth = ratio >= 1 ? longSide : Math.max(24, Math.round(longSide * ratio))
  const maskHeight = ratio >= 1 ? Math.max(24, Math.round(longSide / ratio)) : longSide

  const centerX = maskWidth * (0.5 + (((seed >>> 8) % 7) - 3) / 100)
  const centerY = maskHeight * (0.52 + (((seed >>> 16) % 5) - 2) / 100)
  const radiusX = maskWidth * 0.37
  const radiusY = maskHeight * 0.36
  const phase = (seed % 628) / 100
  const raster = new Uint8Array(maskWidth * maskHeight)

  let minX = maskWidth
  let minY = maskHeight
  let maxX = 0
  let maxY = 0

  for (let y = 0; y < maskHeight; y += 1) {
    for (let x = 0; x < maskWidth; x += 1) {
      const dx = (x - centerX) / radiusX
      const dy = (y - centerY) / radiusY
      const angle = Math.atan2(dy, dx)
      const wobble =
        1 + 0.05 * Math.sin(angle * 3 + phase) + 0.028 * Math.cos(angle * 5 - phase)
      if (dx * dx + dy * dy > wobble * wobble) continue
      raster[y * maskWidth + x] = 1
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }

  const scaleX = width / maskWidth
  const scaleY = height / maskHeight
  return {
    width: maskWidth,
    height: maskHeight,
    raster,
    bounds: {
      x1: Math.round(minX * scaleX),
      y1: Math.round(minY * scaleY),
      x2: Math.round((maxX + 1) * scaleX),
      y2: Math.round((maxY + 1) * scaleY),
    },
    sourceWidth: width,
    sourceHeight: height,
  }
}

export function mockListingCopy(subject: string, seed: number): ListingCopy {
  const normalized = subject.trim().toLowerCase()
  const product =
    !normalized || normalized === 'product' ? pick(FALLBACK_PRODUCTS, seed) : normalized
  const name = titleCase(product)
  const adjective = pick(ADJECTIVES, seed, 3)
  const moment = pick(MOMENTS, seed, 7)
  const detail = pick(DETAILS, seed, 11)
  const closer = pick(CLOSERS, seed, 15)

  const candidate = `${adjective} ${name} for ${moment}`
  const title = candidate.length <= 70 ? candidate : `${name} for ${moment}`

  const article = /^[aeiou]/.test(product) ? 'An' : 'A'
  const description = `${article} ${adjective.toLowerCase()} ${product} for ${moment}. ${detail} ${closer}`

  return { title, description }
}
