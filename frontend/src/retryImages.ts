const DELAYS = [1000, 3000, 8000]
const PHOTOS_API = '/api/method/photos.'

export function retryFailedImages() {
  document.addEventListener(
    'error',
    (event) => {
      const image = event.target
      if (!(image instanceof HTMLImageElement) || !image.src.includes(PHOTOS_API)) return
      const url = new URL(image.src)
      const tried = Number(url.searchParams.get('retry') || 0)
      if (tried >= DELAYS.length) return
      setTimeout(() => {
        if (!image.isConnected || !image.src.startsWith(url.origin + url.pathname)) return
        url.searchParams.set('retry', String(tried + 1))
        image.src = url.toString()
      }, DELAYS[tried])
    },
    true,
  )
}
