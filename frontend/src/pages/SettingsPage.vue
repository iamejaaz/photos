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
    <ListRow
      v-for="item in sections"
      :key="item.key"
      :to="{ name: 'photos-settings', params: { section: item.key } }"
      :icon="item.icon"
      :label="item.label"
      :description="item.description"
      chevron
    />
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
import LucideCloudUpload from '~icons/lucide/cloud-upload'
import LucideFileArchive from '~icons/lucide/file-archive'
import LucideHardDriveDownload from '~icons/lucide/hard-drive-download'
import LucideHistory from '~icons/lucide/history'
import LucideShield from '~icons/lucide/shield'
import LucideSparkles from '~icons/lucide/sparkles'
import LucideMailWarning from '~icons/lucide/mail-warning'
import LucideKeyRound from '~icons/lucide/key-round'
import LucideMessageSquareWarning from '~icons/lucide/message-square-warning'

import { appPageMeta } from '@/utils/documentTitle'
import { getSessionUser } from '@/boot/session'
import ListRow from '../components/ListRow.vue'
import { loadSettings, settings, useGoogleSetupNeeded } from '../data/dialogs'

const props = defineProps<{ section?: string }>()
const router = useRouter()
const native = Boolean(import.meta.env.VITE_NATIVE)

if (!settings.data) loadSettings()

type Section = { key: string; label: string; description: string; icon: Component; panel: Component }
const panel = (load: () => Promise<{ default: Component }>) => defineAsyncComponent(load)

const canSetUpGoogle = useGoogleSetupNeeded()

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
  if ((getSessionUser() ?? 'Administrator') !== 'Administrator')
    list.push({
      key: 'data',
      label: __('Your data'),
      description: __('Download or delete your photos and account'),
      icon: LucideShield,
      panel: panel(() => import('../components/settings/DataPanel.vue')),
    })
  if (settings.data?.can_manage)
    list.push({
      key: 'features',
      label: __('Smart features'),
      description: __('People, places and search for this site'),
      icon: LucideSparkles,
      panel: panel(() => import('../components/settings/FeaturesPanel.vue')),
    })
  if (settings.data?.can_manage && canSetUpGoogle.value)
    list.push({
      key: 'google',
      label: __('Google Photos import'),
      description: __('Register Photos with Google once'),
      icon: LucideKeyRound,
      panel: panel(() => import('../components/settings/GoogleSetupPanel.vue')),
    })
  if (settings.data?.can_manage)
    list.push({
      key: 'signups',
      label: __('Sign-up problems'),
      description: __('People who did not get their sign-up email'),
      icon: LucideMailWarning,
      panel: panel(() => import('../components/settings/SignupsPanel.vue')),
    })
  if (settings.data?.can_manage)
    list.push({
      key: 'reports',
      label: __('Problem reports'),
      description: __('Problems people reported from the app or the web'),
      icon: LucideMessageSquareWarning,
      panel: panel(() => import('../components/settings/ProblemReportsPanel.vue')),
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
