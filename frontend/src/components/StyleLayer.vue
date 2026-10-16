<template>
  <div :style="styleOf()"><slot /></div>
</template>

<script setup lang="ts">
import type { StyleValue } from 'vue'

defineProps<{ styleOf: () => StyleValue }>()
</script>
