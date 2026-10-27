export type Mode = 'mock' | 'live'

export interface Size {
  width: number
  height: number
}

export interface MaskBounds {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface SegmentationMask extends Size {
  raster: Uint8Array
  bounds: MaskBounds
  sourceWidth: number
  sourceHeight: number
}

export interface Cutout {
  dataUrl: string
  blob: Blob
  width: number
  height: number
}

export interface ImageVariant {
  id: string
  label: string
  description: string
  dataUrl: string
}

export interface ListingCopy {
  title: string
  description: string
}

export interface ListingResult {
  mode: Mode
  subject: string
  cutout: Cutout
  variants: ImageVariant[]
  copy: ListingCopy
  durationMs: number
}
