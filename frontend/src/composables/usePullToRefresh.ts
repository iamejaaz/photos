import { onBeforeUnmount, onMounted, ref } from 'vue'

const TRIGGER = 72
const MAX = 120
const DECIDE = 8

const inSideScroller = (target: EventTarget | null, root: HTMLElement) => {
  for (let node = target as HTMLElement | null; node && node !== root; node = node.parentElement) {
    if (node.scrollWidth > node.clientWidth && /(auto|scroll)/.test(getComputedStyle(node).overflowX))
      return true
  }
  return false
}

export function usePullToRefresh(
  container: () => HTMLElement | null,
  refresh: () => Promise<unknown>,
  blocked: () => boolean,
) {
  const pull = ref(0)
  const refreshing = ref(false)
  let startY: number | null = null
  let startX = 0
  let decided = false
  let element: HTMLElement | null = null

  function onStart(event: TouchEvent) {
    decided = false
    startX = event.touches[0]?.clientX ?? 0
    startY =
      event.touches.length === 1 &&
      element &&
      element.scrollTop <= 0 &&
      !blocked() &&
      !inSideScroller(event.target, element)
        ? event.touches[0].clientY
        : null
  }

  function onMove(event: TouchEvent) {
    if (startY === null || refreshing.value || event.touches.length !== 1) return
    const distance = event.touches[0].clientY - startY
    if (!decided) {
      const sideways = Math.abs(event.touches[0].clientX - startX)
      if (Math.max(sideways, Math.abs(distance)) < DECIDE) return
      decided = true
      if (sideways > Math.abs(distance)) {
        startY = null
        pull.value = 0
        return
      }
    }
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
