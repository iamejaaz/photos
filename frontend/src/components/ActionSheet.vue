<template>
  <BottomSheet v-model:open="open">
    <div class="flex flex-col pb-[calc(1rem+var(--inset-bottom,0px))]">
      <ListRow
        v-for="option in options"
        :key="option.label"
        class="px-5"
        :icon="option.icon"
        :label="option.label"
        @click="choose(option)"
      />
    </div>
  </BottomSheet>
</template>

<script setup lang="ts">
import type { Component } from 'vue'
import { BottomSheet } from 'frappe-ui'

import ListRow from './ListRow.vue'

export type SheetOption = { label: string; icon: Component; onClick: () => unknown }

defineProps<{ options: SheetOption[] }>()
const open = defineModel<boolean>('open', { default: false })

function choose(option: SheetOption) {
  open.value = false
  option.onClick()
}
</script>
