<template>
  <PageHeader>
    <div class="flex min-w-0 items-center gap-1">
      <Button variant="ghost" :aria-label="__('Back')" @click="goBack">
        <template #icon><LucideArrowLeft class="size-5" /></template>
      </Button>
      <h1 class="truncate text-lg font-semibold text-ink-gray-9">{{ current?.label ?? __('Settings') }}</h1>
    </div>
  </PageHeader>
  <nav v-if="!current" class="flex flex-col divide-y divide-outline-gray-1 px-4">
    <router-link
      v-for="item in sections"
      :key="item.key"
      :to="{ name: 'photos-settings', params: { section: item.key } }"
      class="flex items-center gap-4 py-4"
    >
      <component :is="item.icon" class="size-5 shrink-0 text-ink-gray-6" />
      <div class="min-w-0 flex-1">
        <div class="text-base font-medium text-ink-gray-8">{{ item.label }}</div>
        <div class="text-sm text-ink-gray-5">{{ item.description }}</div>
      </div>
      <LucideChevronRight class="size-4 shrink-0 text-ink-gray-4" />
    </router-link>
  </nav>
  <div v-else class="photos-settings settings-page flex flex-col">
    <component :is="current.panel" />
  </div>
</template>

<script setup lang="ts">
import { type Component, computed, defineAsyncComponent } from 'vue'
import { useRouter } from 'vue-router'
import { Button, PageHeader, usePageMeta } from 'frappe-ui'
import LucideArrowLeft from '~icons/lucide/arrow-left'
import LucideChevronRight from '~icons/lucide/chevron-right'
import LucideCloudUpload from '~icons/lucide/cloud-upload'
import LucideFileArchive from '~icons/lucide/file-archive'
import LucideHardDriveDownload from '~icons/lucide/hard-drive-download'
import LucideHistory from '~icons/lucide/history'
import LucideSparkles from '~icons/lucide/sparkles'

import { appPageMeta } from '@/utils/documentTitle'
import { loadSettings, settings } from '../data/dialogs'

const props = defineProps<{ section?: string }>()
const router = useRouter()
const native = Boolean(import.meta.env.VITE_NATIVE)

if (!settings.data) loadSettings()

type Section = { key: string; label: string; description: string; icon: Component; panel: Component }
const panel = (load: () => Promise<{ default: Component }>) => defineAsyncComponent(load)

const sections = computed(() => {
  const list: Section[] = []
  if (native)
    list.push({
      key: 'backup',
      label: __('Backup'),
      description: __('Back up this phone and free up space'),
      icon: LucideCloudUpload,
      panel: panel(() => import('../components/settings/BackupPanel.vue')),
    })
  list.push(
    {
      key: 'memories',
      label: __('Memories'),
      description: __('Memories at the top of your photos'),
      icon: LucideHistory,
      panel: panel(() => import('../components/settings/MemoriesPanel.vue')),
    },
    {
      key: 'import',
      label: __('Import'),
      description: __('Bring photos from Google Photos'),
      icon: LucideHardDriveDownload,
      panel: panel(() => import('../components/settings/ImportPanel.vue')),
    },
    {
      key: 'export',
      label: __('Export'),
      description: __('Download a copy of your library'),
      icon: LucideFileArchive,
      panel: panel(() => import('../components/settings/ExportPanel.vue')),
    },
  )
  if (settings.data?.can_manage)
    list.push({
      key: 'features',
      label: __('Smart features'),
      description: __('People, places and search for this site'),
      icon: LucideSparkles,
      panel: panel(() => import('../components/settings/FeaturesPanel.vue')),
    })
  return list
})

const current = computed(() => sections.value.find((item) => item.key === props.section))

function goBack() {
  if (window.history.state?.back) router.back()
  else router.replace(current.value ? { name: 'photos-settings' } : { name: 'photos-library' })
}

usePageMeta(() => appPageMeta(current.value?.label ?? __('Settings'), 'Photos'))
</script>

<style>
.settings-page [class*='px-[4.4rem]'] {
  padding-left: 1rem;
  padding-right: 1rem;
}
.settings-page .pt-10 {
  padding-top: 0.5rem;
}
.settings-page h2 {
  display: none;
}
</style>
