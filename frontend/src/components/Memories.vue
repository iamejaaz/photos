<template>
  <div v-if="memories.length" class="px-3 pt-4 sm:px-5">
    <div class="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button
        v-for="memory in memories"
        :key="memory.year"
        class="group relative h-64 w-44 shrink-0 overflow-hidden rounded-3xl bg-surface-gray-2 text-left sm:h-52 sm:w-40 sm:rounded-xl"
        @click="play(memory)"
      >
        <img
          :src="thumbnailUrl(memory.photos[0].name)"
          class="size-full object-cover transition-transform duration-500 group-hover:scale-105"
          :class="{ 'brightness-50 saturate-50': memory.seen }"
          alt=""
        />
        <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        <div class="absolute inset-x-3 bottom-3" :class="memory.seen ? 'text-white/70' : 'text-white'">
          <div class="text-lg font-semibold leading-tight sm:text-base">
            {{ memory.years_ago === 1 ? __('1 year ago') : __('{0} years ago', [memory.years_ago]) }}
          </div>
          <div class="text-xs opacity-80">{{ itemCount(memory.photos.length) }}</div>
        </div>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

import { getSessionUser } from '@/boot/session'
import { readJSON, writeJSON } from '@/utils/localStorage'

import { type Memory, getMemories, isVideo } from '../resources/photos'
import { contentUrl, thumbnailUrl } from '../resources/media'
import { memoriesVersion, playMemories } from '../data/viewer'
import { itemCount } from '../utils'

const KEY = `photos-memories:${getSessionUser() ?? ''}`
const today = () => new Date().toDateString()
const saved = readJSON(KEY) as { day: string; memories: Memory[] } | null
const memories = ref<Memory[]>(saved?.day === today() ? saved.memories : [])
watch(
  () => memoriesVersion.value,
  () =>
    getMemories().then((data) => {
      memories.value = data
      writeJSON(KEY, { day: today(), memories: data })
      warmUp(data)
    }),
  { immediate: true },
)

function warmUp(list: Memory[]) {
  const start = () =>
    list
      .slice(0, 3)
      .map((memory) => memory.photos[0])
      .filter((photo) => photo && !isVideo(photo))
      .forEach((photo) => (new Image().src = contentUrl(photo.name)))
  if ('requestIdleCallback' in window) requestIdleCallback(start)
  else setTimeout(start, 1000)
}

function play(memory: Memory) {
  playMemories(memories.value, memories.value.indexOf(memory))
}
</script>
