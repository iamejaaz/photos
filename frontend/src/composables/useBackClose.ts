import { onBeforeUnmount, watch } from 'vue'

const stack: (() => void)[] = []

export const closeTopLayer = () => {
  const close = stack.pop()
  close?.()
  return Boolean(close)
}

export function useBackClose(isOpen: () => boolean, close: () => void) {
  const remove = () => {
    const index = stack.indexOf(close)
    if (index > -1) stack.splice(index, 1)
  }
  watch(isOpen, (open) => (open ? stack.push(close) : remove()), { immediate: true })
  onBeforeUnmount(remove)
}
