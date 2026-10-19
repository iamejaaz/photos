import { reactive } from 'vue'
import { toast } from 'frappe-ui'

const KEEP_ERRORS = 15
const SCREENSHOT_SIDE = 1280
const DIALOG_OPEN_MS = 250

export const recentErrors: string[] = []
export const problemReport = reactive({
  open: false,
  page: '',
  screenshot: null as string | null,
  capturing: false,
})

export function recordError(text: unknown) {
  if (!text) return
  recentErrors.push(`${new Date().toISOString()} ${window.location.pathname} ${String(text).slice(0, 500)}`)
  if (recentErrors.length > KEEP_ERRORS) recentErrors.shift()
}

export async function reportProblem() {
  problemReport.page = window.location.pathname + window.location.search
  problemReport.screenshot = null
  if (import.meta.env.VITE_NATIVE) {
    problemReport.screenshot = await captureNative().catch(() => null)
    problemReport.open = true
    return
  }
  const onScreen = new Set(document.body.children)
  problemReport.capturing = true
  problemReport.open = true
  await new Promise((painted) => setTimeout(painted, DIALOG_OPEN_MS))
  problemReport.screenshot = await capturePage(onScreen).catch(() => null)
  problemReport.capturing = false
}

async function captureNative() {
  const { photosShell } = await import('../native/shell')
  const { plugin } = await photosShell()
  return (await plugin.captureScreen()).dataUrl
}

async function capturePage(onScreen: Set<Element>) {
  const { toJpeg } = await import('html-to-image')
  const scale = Math.min(1, SCREENSHOT_SIDE / Math.max(window.innerWidth, window.innerHeight))
  return toJpeg(document.body, {
    quality: 0.75,
    pixelRatio: scale,
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: getComputedStyle(document.body).backgroundColor,
    filter: (node) =>
      !(node instanceof HTMLElement && node.parentElement === document.body) ||
      (onScreen.has(node) && !node.querySelector('[data-problem-report]')),
  })
}

export function shrinkImage(file: File) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const scale = Math.min(1, SCREENSHOT_SIDE / Math.max(image.width, image.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(image.width * scale)
      canvas.height = Math.round(image.height * scale)
      canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(image.src)
      resolve(canvas.toDataURL('image/jpeg', 0.8))
    }
    image.onerror = reject
    image.src = URL.createObjectURL(file)
  })
}

export function watchProblems() {
  window.addEventListener('error', (event) => recordError(event.message))
  window.addEventListener('unhandledrejection', (event) =>
    recordError((event.reason as Error)?.message ?? event.reason),
  )
  const showError = toast.error
  toast.error = (message, data) => {
    recordError(typeof message === 'string' ? message : '')
    return showError(message, {
      action: { label: __('Report'), onClick: () => reportProblem() },
      ...data,
    })
  }
}
