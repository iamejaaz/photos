<template>
  <SettingsHeader
    :title="__('People, places, things and text')"
    :description="__('Everything runs on this server. Photos are never sent anywhere.')"
  />
  <SettingsBody>
    <div class="divide-y divide-outline-gray-1">
      <SettingsRow
        v-for="feature in features"
        :key="feature.key"
        :title="feature.label"
        :description="feature.description"
      >
        <Switch
          :model-value="form[feature.key]"
          :disabled="saving"
          @update:model-value="toggle(feature.key, $event)"
        />
      </SettingsRow>
    </div>
    <div v-if="statusText" class="mt-4 flex items-center gap-2 text-base text-ink-gray-7">
      <LoadingIndicator v-if="busy" class="size-3.5" />
      {{ statusText }}
    </div>
    <ErrorMessage
      v-if="settings.data?.status === 'Failed'"
      class="mt-2"
      :message="settings.data.error ?? undefined"
    />
  </SettingsBody>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watchEffect } from 'vue'
import {
  ErrorMessage,
  LoadingIndicator,
  SettingsBody,
  SettingsHeader,
  SettingsRow,
  Switch,
  toast,
} from 'frappe-ui'

import { type Feature, saveSettings } from '../../resources/settings'
import { settings } from '../../data/dialogs'

const features: { key: Feature; label: string; description: string }[] = [
  { key: 'people', label: __('People'), description: __('Group photos and videos by the faces in them') },
  {
    key: 'places',
    label: __('Places'),
    description: __('Show the city where a photo was taken, from its location'),
  },
  {
    key: 'things',
    label: __('Things'),
    description: __('Sort photos into beaches, food, mountains and more'),
  },
  {
    key: 'text',
    label: __('Text in photos'),
    description: __('Find receipts, signs and screenshots by the words in them'),
  },
  {
    key: 'smart_search',
    label: __('Search by description'),
    description: __('Find photos by what is in them, like “dog on the beach” or “birthday cake”'),
  },
]

const form = reactive<Record<Feature, boolean>>({
  people: false,
  places: false,
  things: false,
  text: false,
  smart_search: false,
})
const saving = ref(false)
watchEffect(() => {
  if (settings.data) features.forEach(({ key }) => (form[key] = settings.data![key]))
})

const busy = computed(() => ['Downloading', 'Scanning'].includes(settings.data?.status ?? ''))
const statusText = computed(
  () =>
    ({
      Downloading: __('Downloading models…'),
      Scanning: __('Scanning your photos…'),
      Ready: __('Up to date'),
    })[settings.data?.status ?? ''],
)

async function toggle(key: Feature, value: boolean) {
  form[key] = value
  saving.value = true
  try {
    settings.data = await saveSettings({ ...form })
  } catch (error) {
    form[key] = !value
    toast.error((error as { messages?: string[] }).messages?.[0] ?? __('Could not save settings'))
  } finally {
    saving.value = false
  }
}
</script>
