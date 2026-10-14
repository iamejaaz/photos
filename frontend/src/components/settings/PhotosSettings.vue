<template>
  <SettingsDialog v-model:open="settings.open" v-model:tab="settings.tab">
    <SettingsSidebar>
      <SettingsNavGroup :label="__('Photos')">
        <SettingsNavItem value="import">
          <template #prefix
            ><span class="lucide-hard-drive-download size-4 shrink-0 text-ink-gray-6"
          /></template>
          {{ __('Import') }}
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
      <SettingsPanel value="import"><ImportPanel /></SettingsPanel>
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
import ImportPanel from './ImportPanel.vue'
</script>
