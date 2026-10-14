<template>
  <div v-if="memories.length" class="px-3 pt-4 sm:px-5">
    <div class="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button
        v-for="memory in memories"
        :key="memory.year"
        class="group relative h-44 w-32 shrink-0 overflow-hidden rounded-xl bg-surface-gray-2 text-left sm:h-52 sm:w-40"
        @click="play(memory)"
      >
        <img
          :src="thumbnailUrl(memory.photos[0].name)"
          class="size-full object-cover transition-transform duration-500 group-hover:scale-105"
          alt=""
        />
        <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        <div class="absolute inset-x-3 bottom-3 text-white">
          <div class="text-base font-semibold leading-tight">
            {{ memory.years_ago === 1 ? __('1 year ago') : __('{0} years ago', [memory.years_ago]) }}
          </div>
          <div class="text-xs text-white/80">{{ itemCount(memory.photos.length) }}</div>
        </div>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

import { type Memory, getMemories, thumbnailUrl } from '../api'
import { createStaticFeed, openLightbox } from '../store'
import { itemCount } from '../utils'

const memories = ref<Memory[]>([])
getMemories().then((data) => (memories.value = data))

function play(memory: Memory) {
  const feed = createStaticFeed([...memory.photos].reverse())
  openLightbox(feed, feed.feed.rows[0].name, true)
}
</script>
