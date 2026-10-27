import { createCutout, loadMockCutout, readImageSize } from './image'
import {
  createVariants,
  getMode,
  publicErrorMessage,
  segmentProduct,
  writeListingCopy,
} from './metaClient'
import type { Cutout, ImageVariant, ListingCopy, ListingResult } from './types'

export type PipelineStage = 'segment' | 'variants' | 'copy'
export type StageStatus = 'running' | 'done' | 'error'

export type PipelineEvent =
  | { type: 'stage'; stage: PipelineStage; status: StageStatus; detail?: string }
  | { type: 'cutout'; cutout: Cutout }
  | { type: 'variants'; variants: ImageVariant[] }
  | { type: 'copy'; copy: ListingCopy }

export interface PipelineOptions {
  subject?: string
  onEvent?: (event: PipelineEvent) => void
}

async function withStage<T>(
  stage: PipelineStage,
  options: PipelineOptions,
  work: () => Promise<T>,
): Promise<T> {
  options.onEvent?.({ type: 'stage', stage, status: 'running' })
  try {
    const result = await work()
    options.onEvent?.({ type: 'stage', stage, status: 'done' })
    return result
  } catch (error) {
    const detail = publicErrorMessage(error)
    options.onEvent?.({ type: 'stage', stage, status: 'error', detail })
    throw new Error(detail)
  }
}

export async function runPipeline(
  file: File,
  options: PipelineOptions = {},
): Promise<ListingResult> {
  const startedAt = performance.now()
  const subject = options.subject?.trim() || 'product'

  const cutout = await withStage('segment', options, async () => {
    if (getMode() === 'mock') {
      const result = await loadMockCutout()
      options.onEvent?.({ type: 'cutout', cutout: result })
      return result
    }
    const imageSize = await readImageSize(file)
    const mask = await segmentProduct(file, subject, imageSize)
    const result = await createCutout(file, mask)
    options.onEvent?.({ type: 'cutout', cutout: result })
    return result
  })

  const variants = await withStage('variants', options, async () => {
    const result = await createVariants(cutout.blob, subject)
    options.onEvent?.({ type: 'variants', variants: result })
    return result
  })

  const copy = await withStage('copy', options, async () => {
    const result = await writeListingCopy(subject, cutout.dataUrl)
    options.onEvent?.({ type: 'copy', copy: result })
    return result
  })

  return {
    mode: getMode(),
    subject,
    cutout,
    variants,
    copy,
    durationMs: Math.round(performance.now() - startedAt),
  }
}
