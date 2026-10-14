<template>
  <SettingsDialog v-model:open="settings.open" v-model:tab="settings.tab">
    <SettingsSidebar>
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
      </SettingsNavGroup>
      <SettingsNavGroup v-if="settings.data?.can_manage" :label="__('Administration')">
        <SettingsNavItem value="features">
          <template #prefix><span class="lucide-sparkles size-4 shrink-0 text-ink-gray-6" /></template>
          {{ __('Smart features') }}
        </SettingsNavItem>
      </SettingsNavGroup>
    </SettingsSidebar>
    <SettingsContent>
      <SettingsPanel value="memories"><MemoriesPanel /></SettingsPanel>
      <SettingsPanel value="import"><ImportPanel /></SettingsPanel>
      <SettingsPanel value="export"><ExportPanel /></SettingsPanel>
      <SettingsPanel v-if="settings.data?.can_manage" value="features"><FeaturesPanel /></SettingsPanel>
    </SettingsContent>
  </SettingsDialog>
</template>

<script setup lang="ts">
import {
  SettingsContent,
  SettingsDialog,
  SettingsNavGroup,
  SettingsNavItem,
  SettingsPanel,
  SettingsSidebar,
} from 'frappe-ui'

import { settings } from '../../store'
import FeaturesPanel from './FeaturesPanel.vue'
import ExportPanel from './ExportPanel.vue'
import ImportPanel from './ImportPanel.vue'
import MemoriesPanel from './MemoriesPanel.vue'
</script>
