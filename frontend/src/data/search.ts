import { ref } from 'vue'
import { readString, writeString } from '@/utils/localStorage'

const RECENT_KEY = 'photos-recent-searches'
const readRecent = () => {
  try {
    return JSON.parse(readString(RECENT_KEY, '[]')) as string[]
  } catch {
    return []
  }
}
export const recentSearches = ref<string[]>(readRecent())
export function rememberSearch(term: string) {
  const value = term.trim()
  if (!value) return
  recentSearches.value = [
    value,
    ...recentSearches.value.filter((item) => item.toLowerCase() !== value.toLowerCase()),
  ].slice(0, 8)
  writeString(RECENT_KEY, JSON.stringify(recentSearches.value))
}
export function clearRecentSearches() {
  recentSearches.value = []
  writeString(RECENT_KEY, '[]')
}
