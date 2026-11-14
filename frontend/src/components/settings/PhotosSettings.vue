<template>
  <SettingsDialog v-model:open="settings.open" v-model:tab="settings.tab">
    <SettingsSidebar>
      <div class="flex items-center justify-between px-2 pb-1 sm:hidden">
        <span class="text-base font-semibold text-ink-gray-8">{{ __('Settings') }}</span>
        <Button variant="ghost" :aria-label="__('Close')" @click="settings.open = false">
          <template #icon><LucideX class="size-4" /></template>
        </Button>
      </div>
      <template v-for="group in groups" :key="group.key">
        <SettingsNavGroup v-if="group.items.length" :label="group.label">
          <SettingsNavItem v-for="item in group.items" :key="item.key" :value="item.key">
            <template #prefix><component :is="item.icon" class="size-4 shrink-0 text-ink-gray-6" /></template>
            {{ item.label }}
          </SettingsNavItem>
        </SettingsNavGroup>
      </template>
    </SettingsSidebar>
    <SettingsContent class="photos-settings">
      <SettingsPanel v-for="item in sections" :key="item.key" :value="item.key">
        <component :is="item.panel" />
      </SettingsPanel>
    </SettingsContent>
  </SettingsDialog>
</template>

<script setup lang="ts">
import {
  Button,
  SettingsContent,
  SettingsDialog,
  SettingsNavGroup,
  SettingsNavItem,
  SettingsPanel,
  SettingsSidebar,
} from 'frappe-ui'

import { computed } from 'vue'
import LucideX from '~icons/lucide/x'

import { settings } from '../../data/dialogs'
import { type SettingsGroup, useSettingsSections } from './sections'

const { sections } = useSettingsSections()
const groups = computed(() =>
  (
    [
      ['phone', __('This phone')],
      ['photos', __('Photos')],
      ['admin', __('Administration')],
    ] as [SettingsGroup, string][]
  ).map(([key, label]) => ({ key, label, items: sections.value.filter((item) => item.group === key) })),
)
</script>

<style>
@media (max-width: 639px) {
  .photos-settings [class*='px-[4.4rem]'] {
    padding-left: 1rem;
    padding-right: 1rem;
  }
  .photos-settings .pt-10 {
    padding-top: 1rem;
  }
  [role='dialog']:has(.photos-settings) .w-screen {
    width: 100%;
  }
}
</style>
