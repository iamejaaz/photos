import { onBeforeUnmount, onMounted, ref } from 'vue'

const TRIGGER = 72
const MAX = 120

export function usePullToRefresh(
  container: () => HTMLElement | null,
  refresh: () => Promise<unknown>,
  blocked: () => boolean,
) {
  const pull = ref(0)
  const refreshing = ref(false)
  let startY: number | null = null
  let element: HTMLElement | null = null

  function onStart(event: TouchEvent) {
    startY =
      event.touches.length === 1 && element && element.scrollTop <= 0 && !blocked()
        ? event.touches[0].clientY
        : null
  }

  function onMove(event: TouchEvent) {
    if (startY === null || refreshing.value || event.touches.length !== 1) return
    const distance = event.touches[0].clientY - startY
    if (distance <= 0 || (element?.scrollTop ?? 0) > 0) {
      pull.value = 0
      return
    }
    event.preventDefault()
    pull.value = Math.min(MAX, distance * 0.5)
  }

  async function onEnd() {
    if (startY === null) return
    startY = null
    if (pull.value < TRIGGER) {
      pull.value = 0
      return
    }
    refreshing.value = true
    pull.value = TRIGGER
    try {
      await Promise.all([refresh(), new Promise((resolve) => setTimeout(resolve, 600))])
    } finally {
      refreshing.value = false
      pull.value = 0
    }
  }

  onMounted(() => {
    element = container()
    element?.addEventListener('touchstart', onStart, { passive: true })
    element?.addEventListener('touchmove', onMove, { passive: false })
    element?.addEventListener('touchend', onEnd)
    element?.addEventListener('touchcancel', onEnd)
  })
  onBeforeUnmount(() => {
    element?.removeEventListener('touchstart', onStart)
    element?.removeEventListener('touchmove', onMove)
    element?.removeEventListener('touchend', onEnd)
    element?.removeEventListener('touchcancel', onEnd)
  })

  return { pull, refreshing, trigger: TRIGGER }
}
