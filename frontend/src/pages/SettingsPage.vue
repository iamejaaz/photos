<template>
  <PageHeader>
    <div class="flex min-w-0 items-center gap-1">
      <Button variant="ghost" :aria-label="__('Back')" @click="goBack">
        <template #icon><LucideArrowLeft class="size-5" /></template>
      </Button>
      <h1 class="truncate text-lg font-semibold text-ink-gray-9">{{ current?.label ?? __('Settings') }}</h1>
    </div>
  </PageHeader>
  <nav v-if="!section" class="flex flex-col divide-y divide-outline-gray-1 px-4">
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
  <div v-else-if="current" class="photos-settings settings-page flex flex-col">
    <component :is="current.panel" />
  </div>
  <LoadFailed v-else-if="failed" :retrying="retrying" @retry="load" />
  <div v-else class="flex justify-center py-24">
    <LoadingIndicator class="size-6 text-ink-gray-5" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import { Button, LoadingIndicator, PageHeader, usePageMeta } from 'frappe-ui'
import LucideArrowLeft from '~icons/lucide/arrow-left'

import { appPageMeta } from '@/utils/documentTitle'
import ListRow from '../components/ListRow.vue'
import LoadFailed from '../components/LoadFailed.vue'
import { useSettingsSections } from '../components/settings/sections'
import { loadSettings, settings } from '../data/dialogs'

const props = defineProps<{ section?: string }>()
const router = useRouter()
const failed = ref(false)
const retrying = ref(false)

async function load() {
  retrying.value = true
  try {
    await loadSettings()
    failed.value = false
  } catch {
    failed.value = true
  } finally {
    retrying.value = false
  }
}
if (!settings.data) load()

const { sections, ready } = useSettingsSections()
const current = computed(() => sections.value.find((item) => item.key === props.section))

watchEffect(() => {
  if (props.section && ready.value && !current.value) router.replace({ name: 'photos-settings' })
})

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
