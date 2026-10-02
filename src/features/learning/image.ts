/** Load a picked image file, scale it down (longest side ≤ max px) and return a JPEG data URL. */
export async function resizeImageFile(file: File, max = 360, quality = 0.82): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('Não consegui abrir essa imagem'))
      el.src = url
    })
    const w = img.naturalWidth || img.width
    const h = img.naturalHeight || img.height
    const scale = Math.min(1, max / Math.max(w, h))
    const { width, height } = scaledSize(w, h, scale)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas indisponível')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, width, height)
    return canvas.toDataURL('image/jpeg', quality)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function scaledSize(w: number, h: number, scale: number): { width: number; height: number } {
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) }
}

export function isImageUrl(text: string): boolean {
  return /^(https?:\/\/\S+|data:image\/)/i.test(text.trim())
}
