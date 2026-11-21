/**
 * Shrinks an image in the browser before upload: longest side at most `maxSide` px, re-encoded as
 * WebP (JPEG where the browser can't encode WebP). Scoreboards stay readable at 1920px and drop
 * from several MB to a few hundred KB.
 */
export async function compressImage(file: File, maxSide = 1920, quality = 0.85): Promise<{ blob: Blob; ext: string }> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const encode = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
  const webp = await encode('image/webp')
  if (webp && webp.type === 'image/webp') return { blob: webp, ext: 'webp' }
  const jpeg = await encode('image/jpeg')
  if (!jpeg) throw new Error('Could not encode the image')
  return { blob: jpeg, ext: 'jpg' }
}

export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']
