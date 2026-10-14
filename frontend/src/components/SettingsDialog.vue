<template>
  <Dialog
    v-model:open="settings.open"
    :title="__('Photos settings')"
    size="md"
    :actions="[{ label: __('Save'), variant: 'solid', loading: saving, onClick: save }]"
  >
    <div class="flex flex-col gap-1">
      <Switch
        v-for="feature in features"
        :key="feature.key"
        v-model="form[feature.key]"
        padded
        :icon="feature.icon"
        :label="feature.label"
        :description="feature.description"
      />
    </div>
    <div class="mt-4 text-sm text-ink-gray-5">
      {{ __('Everything runs on this server. Photos are never sent anywhere.') }}
    </div>
    <div v-if="statusText" class="mt-2 flex items-center gap-2 text-sm text-ink-gray-7">
      <LoadingIndicator v-if="busy" class="size-3.5" />
      {{ statusText }}
    </div>
    <ErrorMessage v-if="settings.data?.status === 'Failed'" class="mt-2" :message="settings.data.error ?? undefined" />
  </Dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Dialog, ErrorMessage, LoadingIndicator, Switch, toast } from 'frappe-ui'

import { type Feature, saveSettings } from '../api'
import { settings } from '../store'

const features: { key: Feature; label: string; description: string; icon: string }[] = [
  {
    key: 'people',
    label: __('People'),
    description: __('Group photos and videos by the faces in them'),
    icon: 'lucide-users-round',
  },
  {
    key: 'places',
    label: __('Places'),
    description: __('Show the city where a photo was taken, from its location'),
    icon: 'lucide-map-pin',
  },
  {
    key: 'things',
    label: __('Things'),
    description: __('Sort photos into beaches, food, mountains and more'),
    icon: 'lucide-shapes',
  },
]

const form = reactive<Record<Feature, boolean>>({ people: false, places: false, things: false })
const saving = ref(false)
const busy = computed(() => ['Downloading', 'Scanning'].includes(settings.data?.status ?? ''))
const statusText = computed(
  () =>
    ({
      Downloading: __('Downloading models…'),
      Scanning: __('Scanning your photos…'),
      Ready: __('Up to date'),
    })[settings.data?.status ?? ''],
)

watch(
  () => settings.open,
  (open) => {
    if (open && settings.data) features.forEach(({ key }) => (form[key] = settings.data![key]))
  },
)

async function save() {
  saving.value = true
  try {
    settings.data = await saveSettings(form)
    settings.open = false
    if (busy.value) toast.info(__('Setting up. You can keep using Photos.'))
  } catch (error) {
    toast.error((error as { messages?: string[] }).messages?.[0] ?? __('Could not save settings'))
  } finally {
    saving.value = false
  }
}
</script>
