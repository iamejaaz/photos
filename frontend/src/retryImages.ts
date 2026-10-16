const DELAYS = [1000, 3000, 8000]
const PHOTOS_API = '/api/method/photos.'

const failed = new Set<HTMLImageElement>()

const isPhoto = (image: EventTarget | null): image is HTMLImageElement =>
  image instanceof HTMLImageElement && decodeURIComponent(image.src).includes(PHOTOS_API)

const load = (image: HTMLImageElement, attempt: number) => {
  const url = new URL(image.src)
  url.searchParams.set('retry', String(attempt))
  image.src = url.toString()
}

export function retryFailedImages() {
  document.addEventListener(
    'error',
    (event) => {
      const image = event.target
      if (!isPhoto(image)) return
      image.style.visibility = 'hidden'
      failed.add(image)
      const url = new URL(image.src)
      const tried = Number(url.searchParams.get('retry') || 0)
      if (tried >= DELAYS.length) return
      setTimeout(() => {
        if (image.isConnected && image.src.startsWith(url.origin + url.pathname)) load(image, tried + 1)
      }, DELAYS[tried])
    },
    true,
  )
  document.addEventListener(
    'load',
    (event) => {
      if (!isPhoto(event.target) || !failed.delete(event.target)) return
      event.target.style.visibility = ''
    },
    true,
  )
}

export function retryAllImages() {
  for (const image of failed) {
    if (image.isConnected) load(image, 0)
    else failed.delete(image)
  }
}
