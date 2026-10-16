import { computed, reactive } from 'vue'

type Mode = 'swipe' | 'dismiss' | 'info' | 'pan' | 'pinch' | null

interface Options {
  canPrevious: () => boolean
  canNext: () => boolean
  onPrevious: () => void
  onNext: () => void
  onClose: () => void
  onDismiss?: () => void
  onInfo: () => void
  onTap: () => void
  onBackdropClick?: (event: PointerEvent) => boolean
  zoomable: () => boolean
}

export const SWIPE_GAP = 16
const SLOP = 8
const PINCH_CLOSE_FLOOR = 0.5
const PINCH_CLOSE_AT = 0.85
const FLICK = 0.45
const DOUBLE_TAP_MS = 280
const MAX_SCALE = 4
const DOUBLE_TAP_SCALE = 2.5

export function useViewerGestures(options: Options) {
  const state = reactive({ dx: 0, dy: 0, scale: 1, panX: 0, panY: 0, animating: false })
  const pointers = new Map<number, { x: number; y: number }>()
  let mode: Mode = null
  let start = { x: 0, y: 0, time: 0, panX: 0, panY: 0 }
  let pinch = { distance: 0, scale: 1 }
  let lastTap = { time: 0, x: 0, y: 0 }
  let tapTimer: ReturnType<typeof setTimeout> | undefined
  let width = 1
  let height = 1

  const distance = () => {
    const [a, b] = [...pointers.values()]
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  function animate(apply: () => void, then?: () => void) {
    state.animating = true
    apply()
    setTimeout(() => {
      state.animating = false
      then?.()
    }, 220)
  }

  function reset() {
    Object.assign(state, { dx: 0, dy: 0, scale: 1, panX: 0, panY: 0, animating: false })
    mode = null
    pointers.clear()
  }

  function onPointerDown(event: PointerEvent) {
    const target = event.target as HTMLElement
    if (target.closest('button, a, input') || state.animating) return
    if (target instanceof HTMLVideoElement && event.offsetY > target.clientHeight - 72) return
    const stage = event.currentTarget as HTMLElement
    width = stage.clientWidth || 1
    height = stage.clientHeight || 1
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.size === 2 && options.zoomable()) {
      mode = 'pinch'
      pinch = { distance: distance(), scale: state.scale }
      return
    }
    if (pointers.size === 1) {
      mode = null
      start = { x: event.clientX, y: event.clientY, time: Date.now(), panX: state.panX, panY: state.panY }
    }
  }

  function onPointerMove(event: PointerEvent) {
    if (!pointers.has(event.pointerId)) return
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (mode === 'pinch' && pointers.size === 2) {
      const floor = pinch.scale <= 1.01 && options.onDismiss ? PINCH_CLOSE_FLOOR : 1
      state.scale = Math.min(MAX_SCALE, Math.max(floor, (pinch.scale * distance()) / pinch.distance))
      if (state.scale <= 1) Object.assign(state, { panX: 0, panY: 0 })
      return
    }
    if (pointers.size !== 1) return
    const x = event.clientX - start.x
    const y = event.clientY - start.y
    if (!mode) {
      if (Math.hypot(x, y) < SLOP) return
      if (state.scale > 1) mode = 'pan'
      else if (Math.abs(x) > Math.abs(y)) mode = 'swipe'
      else mode = y > 0 ? 'dismiss' : 'info'
    }
    if (mode === 'pan') {
      const limitX = (width * (state.scale - 1)) / 2
      const limitY = (height * (state.scale - 1)) / 2
      state.panX = Math.max(-limitX, Math.min(limitX, start.panX + x))
      state.panY = Math.max(-limitY, Math.min(limitY, start.panY + y))
    } else if (mode === 'swipe') {
      const blocked = (x > 0 && !options.canPrevious()) || (x < 0 && !options.canNext())
      state.dx = blocked ? x * 0.25 : x
    } else if (mode === 'dismiss') {
      state.dy = Math.max(0, y)
    } else if (mode === 'info') {
      state.dy = Math.min(0, y) * 0.3
    }
  }

  function onPointerUp(event: PointerEvent) {
    if (!pointers.has(event.pointerId)) return
    pointers.delete(event.pointerId)
    if (mode === 'pinch') {
      if (pointers.size === 0) {
        mode = null
        if (state.scale < PINCH_CLOSE_AT && options.onDismiss) {
          const dismiss = options.onDismiss
          animate(() => Object.assign(state, { scale: 1, panX: 0, panY: 0 }))
          dismiss()
        } else if (state.scale < 1.05) animate(() => Object.assign(state, { scale: 1, panX: 0, panY: 0 }))
      }
      return
    }
    const elapsed = Math.max(1, Date.now() - start.time)
    const x = event.clientX - start.x
    const y = event.clientY - start.y
    if (mode === 'swipe') {
      const fast = Math.abs(x) / elapsed > FLICK
      const far = Math.abs(x) > width * 0.2
      if ((fast || far) && x < 0 && options.canNext()) {
        animate(
          () => (state.dx = -width - SWIPE_GAP),
          () => {
            options.onNext()
            state.dx = 0
          },
        )
      } else if ((fast || far) && x > 0 && options.canPrevious()) {
        animate(
          () => (state.dx = width + SWIPE_GAP),
          () => {
            options.onPrevious()
            state.dx = 0
          },
        )
      } else animate(() => (state.dx = 0))
    } else if (mode === 'dismiss') {
      if ((y > height * 0.18 || y / elapsed > FLICK) && options.onDismiss) {
        animate(() => (state.dy = 0))
        options.onDismiss()
      } else if (y > height * 0.18 || y / elapsed > FLICK) {
        animate(
          () => (state.dy = height),
          () => {
            options.onClose()
            reset()
          },
        )
      } else animate(() => (state.dy = 0))
    } else if (mode === 'info') {
      animate(() => (state.dy = 0))
      if (-y > 50) options.onInfo()
    } else if (!mode) {
      tap(event)
    }
    mode = null
  }

  function tap(event: PointerEvent) {
    if (event.pointerType === 'mouse' && state.scale === 1 && options.onBackdropClick?.(event)) return
    const now = Date.now()
    const double =
      now - lastTap.time < DOUBLE_TAP_MS &&
      Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < 30
    if (double && options.zoomable()) {
      clearTimeout(tapTimer)
      lastTap = { time: 0, x: 0, y: 0 }
      const stage = (event.currentTarget as HTMLElement).getBoundingClientRect()
      if (state.scale > 1) animate(() => Object.assign(state, { scale: 1, panX: 0, panY: 0 }))
      else {
        const offsetX = event.clientX - stage.left - stage.width / 2
        const offsetY = event.clientY - stage.top - stage.height / 2
        animate(() =>
          Object.assign(state, {
            scale: DOUBLE_TAP_SCALE,
            panX: -offsetX * (DOUBLE_TAP_SCALE - 1),
            panY: -offsetY * (DOUBLE_TAP_SCALE - 1),
          }),
        )
      }
      return
    }
    lastTap = { time: now, x: event.clientX, y: event.clientY }
    clearTimeout(tapTimer)
    tapTimer = setTimeout(options.onTap, DOUBLE_TAP_MS)
  }

  const transition = computed(() =>
    state.animating ? 'transform 220ms ease-out, opacity 220ms ease-out' : 'none',
  )
  const trackStyle = computed(() => ({
    transform: `translate3d(${state.dx}px, ${state.dy}px, 0) scale(${1 - Math.min(0.3, state.dy / (height * 2))})`,
    transition: transition.value,
  }))
  const contentStyle = computed(() => ({
    transform: `translate3d(${state.panX}px, ${state.panY}px, 0) scale(${state.scale})`,
    transition: transition.value,
  }))
  const backdropOpacity = computed(
    () =>
      (1 - Math.min(0.8, Math.max(0, state.dy) / height)) *
      (state.scale < 1 ? Math.max(0.2, (state.scale - PINCH_CLOSE_FLOOR) / (1 - PINCH_CLOSE_FLOOR)) : 1),
  )

  return {
    state,
    reset,
    trackStyle,
    contentStyle,
    backdropOpacity,
    handlers: {
      pointerdown: onPointerDown,
      pointermove: onPointerMove,
      pointerup: onPointerUp,
      pointercancel: onPointerUp,
    },
  }
}
