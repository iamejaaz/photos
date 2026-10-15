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
          alt=""
        />
        <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        <div class="absolute inset-x-3 bottom-3 text-white">
          <div class="text-lg font-semibold leading-tight sm:text-base">
            {{ memory.years_ago === 1 ? __('1 year ago') : __('{0} years ago', [memory.years_ago]) }}
          </div>
          <div class="text-xs text-white/80">{{ itemCount(memory.photos.length) }}</div>
        </div>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

import { type Memory, getMemories } from '../resources/photos'
import { thumbnailUrl } from '../resources/media'
import { memoriesVersion, playMemories } from '../data/viewer'
import { itemCount } from '../utils'

const memories = ref<Memory[]>([])
watch(
  () => memoriesVersion.value,
  () => getMemories().then((data) => (memories.value = data)),
  { immediate: true },
)

function play(memory: Memory) {
  playMemories(memories.value, memories.value.indexOf(memory))
}
</script>
