import { reactive } from 'vue'

export const selection = reactive(new Set<string>())
export const clearSelection = () => selection.clear()
