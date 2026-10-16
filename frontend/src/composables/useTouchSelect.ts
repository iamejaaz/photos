import { onBeforeUnmount } from 'vue'

interface Options {
  names: () => string[]
  selection: Set<string>
}

const HOLD_MS = 300
const SLOP = 10
const EDGE = 80
const SCROLL_STEP = 12

export function useTouchSelect({ names, selection }: Options) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let start = { x: 0, y: 0 }
  let anchor = -1
  let base = new Set<string>()
  let adding = true
  let dragging = false
  let point = { x: 0, y: 0 }
  let frame = 0
  let suppressClick = false
  let pressed = ''
  let mouse = false

  const scroller = (element: Element | null): Element => {
    for (let node = element?.parentElement; node; node = node.parentElement) {
      const style = getComputedStyle(node)
      if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) return node
    }
    return document.scrollingElement || document.documentElement
  }
  let scrollTarget: Element | null = null

  function cancel() {
    clearTimeout(timer)
    timer = undefined
    dragging = false
    cancelAnimationFrame(frame)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', cancel)
    window.removeEventListener('pointercancel', cancel)
    document.removeEventListener('touchmove', blockScroll)
  }

  function blockScroll(event: TouchEvent) {
    const touch = event.touches[0]
    const sideways =
      selection.size > 0 && touch && Math.abs(touch.clientX - start.x) > Math.abs(touch.clientY - start.y)
    if (dragging || sideways) event.preventDefault()
  }

  function nameAt(x: number, y: number) {
    return (document.elementFromPoint(x, y)?.closest('[data-photo]') as HTMLElement | null)?.dataset.photo
  }

  function extend() {
    const name = nameAt(point.x, point.y)
    if (!name) return
    const list = names()
    const current = list.indexOf(name)
    if (current < 0 || anchor < 0) return
    const [a, b] = [anchor, current].sort((x, y) => x - y)
    const range = new Set(list.slice(a, b + 1))
    for (const item of list) {
      const wanted = range.has(item) ? adding : base.has(item)
      if (wanted) selection.add(item)
      else selection.delete(item)
    }
  }

  function autoScroll() {
    if (!dragging || !scrollTarget) return
    const step = point.y < EDGE ? -SCROLL_STEP : point.y > window.innerHeight - EDGE ? SCROLL_STEP : 0
    if (step) {
      scrollTarget.scrollBy(0, step)
      extend()
    }
    frame = requestAnimationFrame(autoScroll)
  }

  function begin(name: string) {
    clearTimeout(timer)
    dragging = true
    suppressClick = true
    anchor = names().indexOf(name)
    base = new Set(selection)
    adding = !selection.has(name)
    if (adding) selection.add(name)
    else selection.delete(name)
    navigator.vibrate?.(15)
    frame = requestAnimationFrame(autoScroll)
  }

  function onMove(event: PointerEvent) {
    point = { x: event.clientX, y: event.clientY }
    if (!dragging) {
      const dx = Math.abs(event.clientX - start.x)
      const dy = Math.abs(event.clientY - start.y)
      if (Math.hypot(dx, dy) <= SLOP) return
      if (selection.size && (mouse || dx > dy)) {
        begin(pressed)
        extend()
      } else cancel()
      return
    }
    extend()
  }

  function onPress(event: PointerEvent, name: string) {
    mouse = event.pointerType === 'mouse'
    if (mouse ? event.button !== 0 || !selection.size : event.pointerType !== 'touch') return
    suppressClick = false
    cancel()
    pressed = name
    start = point = { x: event.clientX, y: event.clientY }
    scrollTarget = scroller(event.currentTarget as Element)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', cancel)
    window.addEventListener('pointercancel', cancel)
    document.addEventListener('touchmove', blockScroll, { passive: false })
    if (!mouse) timer = setTimeout(() => begin(name), HOLD_MS)
  }

  function takeClick() {
    const suppressed = suppressClick
    suppressClick = false
    return suppressed
  }

  onBeforeUnmount(cancel)
  return { onPress, takeClick }
}
