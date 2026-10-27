import type { SegmentationMask } from './types'

const ALPHABET =
  "!#$%&'()*+-./0123456789:=?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]^_`abcdefghijklmnopqrstuvwxyz{"
const RADIX = 85
const PREFIX_LENGTH = 5
const TOP = 1 << 24
const BOTTOM = 1 << 16
const UINT32_MAX = 0xffffffff
const COUNT_INCREMENT = 14
const COUNT_LIMIT = 4096
const CONTEXT_COUNT = 1 << 12
const PADDING = 2

const CHARACTER_VALUES = new Int16Array(128).fill(-1)
for (let index = 0; index < ALPHABET.length; index += 1) {
  CHARACTER_VALUES[ALPHABET.charCodeAt(index)] = index
}

function base85Digit(character: string): number {
  const code = character.charCodeAt(0)
  const value = code < CHARACTER_VALUES.length ? CHARACTER_VALUES[code] : -1
  if (value < 0) throw new Error('SAM returned a mask with an invalid payload character.')
  return value
}

function unpackPayload(payload: string): Uint8Array {
  if (payload.length < PREFIX_LENGTH) {
    throw new Error('SAM returned a mask without a length prefix.')
  }

  let length = 0
  for (let index = 0; index < PREFIX_LENGTH; index += 1) {
    length = length * RADIX + base85Digit(payload[index] ?? '')
  }
  if (!Number.isSafeInteger(length)) {
    throw new Error('SAM returned a mask with an unsupported length.')
  }

  const remainder = length % 4
  const expected =
    PREFIX_LENGTH + Math.floor(length / 4) * 5 + (remainder === 0 ? 0 : remainder + 1)
  if (payload.length !== expected) {
    throw new Error('SAM returned a mask with an invalid payload length.')
  }

  const output = new Uint8Array(length)
  let source = PREFIX_LENGTH
  let destination = 0
  const full = length - remainder

  for (; destination < full; destination += 4) {
    let value = 0
    for (let index = 0; index < 5; index += 1) {
      value = value * RADIX + base85Digit(payload[source + index] ?? '')
    }
    if (value > UINT32_MAX) {
      throw new Error('SAM returned a mask with an out-of-range group.')
    }
    source += 5
    output[destination] = (value >>> 24) & 0xff
    output[destination + 1] = (value >>> 16) & 0xff
    output[destination + 2] = (value >>> 8) & 0xff
    output[destination + 3] = value & 0xff
  }

  if (remainder > 0) {
    let value = 0
    for (let index = 0; index < 5; index += 1) {
      value =
        value * RADIX +
        (index < remainder + 1 ? base85Digit(payload[source + index] ?? '') : RADIX - 1)
    }
    if (value > UINT32_MAX) {
      throw new Error('SAM returned a mask with an out-of-range tail.')
    }
    for (let index = 0; index < remainder; index += 1) {
      output[destination + index] = (value >>> (24 - index * 8)) & 0xff
    }
  }

  return output
}

function contextAt(
  raster: Uint8Array,
  position: number,
  prior: number,
  earlier: number,
): number {
  return (
    raster[position - 1] |
    (raster[position - 2] << 1) |
    (raster[prior - 2] << 2) |
    (raster[prior - 1] << 3) |
    (raster[prior] << 4) |
    (raster[prior + 1] << 5) |
    (raster[prior + 2] << 6) |
    (raster[earlier - 2] << 7) |
    (raster[earlier - 1] << 8) |
    (raster[earlier] << 9) |
    (raster[earlier + 1] << 10) |
    (raster[earlier + 2] << 11)
  )
}

function updateCounts(counts: Uint16Array, offset: number, bit: number): void {
  counts[offset + bit] += COUNT_INCREMENT
  if (counts[offset] + counts[offset + 1] >= COUNT_LIMIT) {
    counts[offset] = (counts[offset] >> 1) || 1
    counts[offset + 1] = (counts[offset + 1] >> 1) || 1
  }
}

export function decodeOneBitMask(
  payload: string,
  width: number,
  height: number,
): Uint8Array {
  if (!payload.startsWith('!')) {
    throw new Error('SAM returned a mask in an unsupported encoding.')
  }
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    !Number.isSafeInteger(width * height)
  ) {
    throw new Error('SAM returned a mask with invalid dimensions.')
  }

  const packed = unpackPayload(payload.slice(1))
  if (packed.length < 4) {
    throw new Error('SAM returned a truncated mask.')
  }

  let position = 0
  let low = 0
  let range = UINT32_MAX
  let code = 0
  let scaled = 0

  const readByte = (): number => {
    if (position >= packed.length) {
      throw new Error('SAM returned a truncated mask.')
    }
    return packed[position++] ?? 0
  }

  for (let index = 0; index < 4; index += 1) {
    code = ((code << 8) | readByte()) >>> 0
  }

  const frequency = (total: number): number => {
    scaled = Math.floor(range / total)
    if (scaled === 0) throw new Error('SAM returned a mask with invalid coding state.')
    const value = Math.floor(((code - low) >>> 0) / scaled)
    return value >= total ? total - 1 : value
  }

  const decodeRange = (cumulative: number, value: number): void => {
    low = (low + scaled * cumulative) >>> 0
    range = scaled * value
    while (
      ((low ^ (low + range)) >>> 0) < TOP ||
      (range < BOTTOM && ((range = (-low >>> 0) & (BOTTOM - 1)), true))
    ) {
      code = ((code << 8) | readByte()) >>> 0
      low = (low << 8) >>> 0
      range = (range << 8) >>> 0
    }
  }

  const counts = new Uint16Array(CONTEXT_COUNT * 2).fill(1)
  const paddedWidth = width + PADDING * 2
  const padded = new Uint8Array(paddedWidth * (height + PADDING))
  const raster = new Uint8Array(width * height)

  for (let y = 0; y < height; y += 1) {
    const row = (y + PADDING) * paddedWidth + PADDING
    for (let x = 0; x < width; x += 1) {
      const index = row + x
      const context = contextAt(
        padded,
        index,
        index - paddedWidth,
        index - paddedWidth * 2,
      )
      const offset = context << 1
      const zero = counts[offset] ?? 1
      const one = counts[offset + 1] ?? 1
      const value = frequency(zero + one)
      const bit = value < zero ? 0 : 1
      if (bit === 0) decodeRange(0, zero)
      else decodeRange(zero, one)
      padded[index] = bit
      raster[y * width + x] = bit
      updateCounts(counts, offset, bit)
    }
  }

  return raster
}

interface BoxFields {
  x1: number
  y1: number
  x2: number
  y2: number
  width: number
  height: number
}

interface MaskFields {
  width: number
  height: number
  payload: string
}

function parseFields(body: string): Map<string, string> {
  const fields = new Map<string, string>()
  for (const part of body.split(';')) {
    const separator = part.indexOf('=')
    if (separator <= 0) continue
    fields.set(part.slice(0, separator).trim(), part.slice(separator + 1).trim())
  }
  return fields
}

function parseBox(body: string): BoxFields | null {
  const fields = parseFields(body)
  const x1 = Number(fields.get('x1'))
  const y1 = Number(fields.get('y1'))
  const x2 = Number(fields.get('x2'))
  const y2 = Number(fields.get('y2'))
  const width = Number(fields.get('w'))
  const height = Number(fields.get('h'))
  if (
    !Number.isFinite(x1) ||
    !Number.isFinite(y1) ||
    !Number.isFinite(x2) ||
    !Number.isFinite(y2) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    x2 < x1 ||
    y2 < y1
  ) {
    return null
  }
  return { x1, y1, x2, y2, width, height }
}

function parseMask(body: string): MaskFields | null {
  const data = parseFields(body).get('data')
  if (!data) return null
  const first = data.indexOf(',')
  const second = data.indexOf(',', first + 1)
  if (first < 0 || second < 0) return null
  const height = Number(data.slice(0, first))
  const width = Number(data.slice(first + 1, second))
  const payload = data.slice(second + 1)
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    !payload
  ) {
    return null
  }
  return { width, height, payload }
}

export function parseSamOutput(text: string): SegmentationMask | null {
  const boxes = [...text.matchAll(/<\|box;([^|]*)\|>/g)].map((match) => {
    const body = match[1] ?? ''
    return parseBox(body)
  })
  const masks = [...text.matchAll(/<\|mask;([^|]*)\|>/g)].map((match) => {
    const body = match[1] ?? ''
    return parseMask(body)
  })

  const candidates: Array<{ area: number; box: BoxFields; mask: MaskFields }> = []
  const count = Math.min(boxes.length, masks.length)
  for (let index = 0; index < count; index += 1) {
    const box = boxes[index]
    const mask = masks[index]
    if (!box || !mask) continue
    const area = (box.x2 - box.x1 + 1) * (box.y2 - box.y1 + 1)
    if (area > 0) candidates.push({ area, box, mask })
  }
  candidates.sort((left, right) => right.area - left.area)

  let sawMask = false
  for (const candidate of candidates) {
    sawMask = true
    if (!candidate.mask.payload.startsWith('!')) continue
    const raster = decodeOneBitMask(
      candidate.mask.payload,
      candidate.mask.width,
      candidate.mask.height,
    )
    return {
      width: candidate.mask.width,
      height: candidate.mask.height,
      raster,
      bounds: {
        x1: candidate.box.x1,
        y1: candidate.box.y1,
        x2: candidate.box.x2,
        y2: candidate.box.y2,
      },
      sourceWidth: candidate.box.width,
      sourceHeight: candidate.box.height,
    }
  }

  if (sawMask) {
    throw new Error('SAM returned a mask in an unsupported encoding. Please retry.')
  }
  return null
}
