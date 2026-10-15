<template>
  <SettingsDialog v-model:open="settings.open" v-model:tab="settings.tab">
    <SettingsSidebar>
      <div class="flex items-center justify-between px-2 pb-1 sm:hidden">
        <span class="text-base font-semibold text-ink-gray-8">{{ __('Settings') }}</span>
        <Button variant="ghost" :aria-label="__('Close')" @click="settings.open = false">
          <template #icon><LucideX class="size-4" /></template>
        </Button>
      </div>
      <SettingsNavGroup v-if="native" :label="__('This phone')">
        <SettingsNavItem value="backup">
          <template #prefix><span class="lucide-cloud-upload size-4 shrink-0 text-ink-gray-6" /></template>
          {{ __('Backup') }}
        </SettingsNavItem>
      </SettingsNavGroup>
      <SettingsNavGroup :label="__('Photos')">
        <SettingsNavItem value="memories">
          <template #prefix><span class="lucide-history size-4 shrink-0 text-ink-gray-6" /></template>
          {{ __('Memories') }}
        </SettingsNavItem>
        <SettingsNavItem value="import">
          <template #prefix
            ><span class="lucide-hard-drive-download size-4 shrink-0 text-ink-gray-6"
          /></template>
          {{ __('Import') }}
        </SettingsNavItem>
        <SettingsNavItem value="export">
          <template #prefix><span class="lucide-file-archive size-4 shrink-0 text-ink-gray-6" /></template>
          {{ __('Export') }}
        </SettingsNavItem>
        <SettingsNavItem v-if="canDelete" value="data">
          <template #prefix><span class="lucide-shield size-4 shrink-0 text-ink-gray-6" /></template>
          {{ __('Your data') }}
        </SettingsNavItem>
      </SettingsNavGroup>
      <SettingsNavGroup v-if="settings.data?.can_manage" :label="__('Administration')">
        <SettingsNavItem value="features">
          <template #prefix><span class="lucide-sparkles size-4 shrink-0 text-ink-gray-6" /></template>
          {{ __('Smart features') }}
        </SettingsNavItem>
      </SettingsNavGroup>
    </SettingsSidebar>
    <SettingsContent class="photos-settings">
      <template v-if="native">
        <SettingsPanel value="backup"><BackupPanel /></SettingsPanel>
      </template>
      <SettingsPanel value="memories"><MemoriesPanel /></SettingsPanel>
      <SettingsPanel value="import"><ImportPanel /></SettingsPanel>
      <SettingsPanel value="export"><ExportPanel /></SettingsPanel>
      <SettingsPanel v-if="canDelete" value="data"><DataPanel /></SettingsPanel>
      <SettingsPanel v-if="settings.data?.can_manage" value="features"><FeaturesPanel /></SettingsPanel>
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

import LucideX from '~icons/lucide/x'

import { settings } from '../../data/dialogs'
import FeaturesPanel from './FeaturesPanel.vue'
import { defineAsyncComponent } from 'vue'

import ExportPanel from './ExportPanel.vue'
import ImportPanel from './ImportPanel.vue'
import MemoriesPanel from './MemoriesPanel.vue'
import { getSessionUser } from '@/boot/session'

const DataPanel = defineAsyncComponent(() => import('./DataPanel.vue'))
const canDelete = (getSessionUser() ?? 'Administrator') !== 'Administrator'

const native = Boolean(import.meta.env.VITE_NATIVE)
const BackupPanel = import.meta.env.VITE_NATIVE
  ? defineAsyncComponent(() => import('./BackupPanel.vue'))
  : null
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
