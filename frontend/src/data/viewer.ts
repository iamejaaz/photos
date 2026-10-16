import { reactive, ref } from 'vue'
import { type Memory } from '../resources/photos'
import { FeedHandle, activeFeed } from './feed'

export const lightbox = reactive<{
  open: boolean
  index: number
  showInfo: boolean
  slideshow: boolean
  placeholder: { name: string; src: string } | null
}>({
  open: false,
  index: 0,
  showInfo: false,
  slideshow: false,
  placeholder: null,
})
export function openLightbox(feed: FeedHandle, name: string, slideshow = false, thumbnail?: string) {
  activeFeed.value = feed
  lightbox.index = feed.feed.rows.findIndex((row) => row.name === name)
  lightbox.slideshow = slideshow
  lightbox.placeholder = thumbnail ? { name, src: thumbnail } : null
  lightbox.open = lightbox.index > -1
}
export const memoriesVersion = ref(0)
export const memoryStory = reactive<{ open: boolean; memories: Memory[]; memory: number; index: number }>({
  open: false,
  memories: [],
  memory: 0,
  index: 0,
})
export function playMemories(memories: Memory[], start: number) {
  Object.assign(memoryStory, {
    memories: memories.map((memory) => ({ ...memory, photos: [...memory.photos].reverse() })),
    memory: start,
    index: 0,
    open: true,
  })
}
