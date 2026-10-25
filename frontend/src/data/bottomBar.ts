import { onBeforeUnmount, watch, type Ref } from 'vue'

const bars = new Map<symbol, number>()

const apply = () =>
  document.documentElement.style.setProperty('--photos-bottom-bar', `${Math.max(0, ...bars.values())}px`)

export function useBottomBar(el: Ref<HTMLElement | undefined>, active: () => boolean = () => true) {
  const key = Symbol()
  const observer = new ResizeObserver(() => measure())
  const measure = () => {
    if (el.value?.offsetHeight && active())
      bars.set(key, Math.max(0, window.innerHeight - el.value.getBoundingClientRect().top))
    else bars.delete(key)
    apply()
  }
  watch(
    el,
    (node, old) => {
      if (old) observer.unobserve(old)
      if (node) observer.observe(node)
      measure()
    },
    { immediate: true },
  )
  watch(active, measure)
  onBeforeUnmount(() => {
    observer.disconnect()
    bars.delete(key)
    apply()
  })
}
