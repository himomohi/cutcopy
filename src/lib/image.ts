import type { Cutout, ImageVariant, SegmentationMask, Size } from './types'

const MAX_CUTOUT_SIDE = 1400

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('Could not read the image data.'))
    }
    reader.onerror = () => reject(new Error('Could not read the image data.'))
    reader.readAsDataURL(blob)
  })
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not open that image. Try a PNG, JPG, or WebP file.'))
    image.src = src
  })
}

export async function readImageSize(file: File): Promise<Size> {
  const url = URL.createObjectURL(file)
  try {
    const image = await loadImage(url)
    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height
    if (!width || !height) throw new Error('That image has no readable dimensions.')
    return { width, height }
  } finally {
    URL.revokeObjectURL(url)
  }
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Could not export the cutout image.'))
    }, 'image/png')
  })
}

export async function createCutout(file: File, mask: SegmentationMask): Promise<Cutout> {
  if (mask.raster.length !== mask.width * mask.height) {
    throw new Error('SAM returned an incomplete mask.')
  }

  const url = URL.createObjectURL(file)
  try {
    const image = await loadImage(url)
    const naturalWidth = image.naturalWidth || image.width
    const naturalHeight = image.naturalHeight || image.height
    const scaleDown = Math.min(1, MAX_CUTOUT_SIDE / Math.max(naturalWidth, naturalHeight))
    const width = Math.max(1, Math.round(naturalWidth * scaleDown))
    const height = Math.max(1, Math.round(naturalHeight * scaleDown))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas is unavailable in this browser.')
    context.drawImage(image, 0, 0, width, height)

    const maskCanvas = document.createElement('canvas')
    maskCanvas.width = mask.width
    maskCanvas.height = mask.height
    const maskContext = maskCanvas.getContext('2d')
    if (!maskContext) throw new Error('Canvas is unavailable in this browser.')

    const maskImage = maskContext.createImageData(mask.width, mask.height)
    for (let index = 0; index < mask.raster.length; index += 1) {
      if (!mask.raster[index]) continue
      const offset = index * 4
      maskImage.data[offset] = 255
      maskImage.data[offset + 1] = 255
      maskImage.data[offset + 2] = 255
      maskImage.data[offset + 3] = 255
    }
    maskContext.putImageData(maskImage, 0, 0)

    context.globalCompositeOperation = 'destination-in'
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(maskCanvas, 0, 0, width, height)
    context.globalCompositeOperation = 'source-over'

    const blob = await canvasToBlob(canvas)
    return { dataUrl: await blobToDataUrl(blob), blob, width, height }
  } finally {
    URL.revokeObjectURL(url)
  }
}

const MOCK_CUTOUT_SRC = '/mug-cutout.jpg'

const MOCK_VARIANTS: Array<{
  id: string
  label: string
  description: string
  src: string
}> = [
  {
    id: 'studio',
    label: 'Studio',
    description: 'Seamless warm-white set',
    src: '/variants/studio.jpg',
  },
  {
    id: 'kitchen',
    label: 'Kitchen',
    description: 'Morning window light',
    src: '/variants/kitchen.jpg',
  },
  {
    id: 'garden',
    label: 'Garden',
    description: 'Sunlit stone ledge',
    src: '/variants/garden.jpg',
  },
]

async function fetchAsCutout(src: string): Promise<Cutout> {
  const response = await fetch(src)
  if (!response.ok) throw new Error(`Could not load mock asset ${src}.`)
  const blob = await response.blob()
  const dataUrl = await blobToDataUrl(blob)
  const image = await loadImage(dataUrl)
  return {
    dataUrl,
    blob,
    width: image.naturalWidth || image.width || 1,
    height: image.naturalHeight || image.height || 1,
  }
}

/** Desk mock: real cutout photo instead of a canvas mask. */
export async function loadMockCutout(): Promise<Cutout> {
  return fetchAsCutout(MOCK_CUTOUT_SRC)
}

/** Desk mock: real variant photos instead of CSS/canvas scene fakes. */
export async function renderMockVariants(_cutout?: Blob): Promise<ImageVariant[]> {
  return Promise.all(
    MOCK_VARIANTS.map(async (scene) => {
      const response = await fetch(scene.src)
      if (!response.ok) throw new Error(`Could not load mock variant ${scene.src}.`)
      const blob = await response.blob()
      return {
        id: scene.id,
        label: scene.label,
        description: scene.description,
        dataUrl: await blobToDataUrl(blob),
      }
    }),
  )
}
