<template>
  <div class="overflow-hidden rounded-full bg-surface-gray-2">
    <img v-if="face" :src="faceUrl(face)" class="size-full object-cover" alt="" loading="lazy" />
  </div>
</template>

<script setup lang="ts">
import { faceUrl } from '../resources/people'

defineProps<{ face?: string | null }>()
</script>
