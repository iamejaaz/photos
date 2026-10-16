<template>
  <SettingsHeader
    :title="__('Memories')"
    :description="__('Choose what shows up at the top of your photos.')"
  />
  <SettingsBody>
    <div v-if="preferences" class="flex flex-col gap-6 pt-2">
      <SettingsRow :title="__('Show memories')" :description="__('Photos from this week in past years.')">
        <Switch :model-value="preferences.memories" @update:model-value="save({ memories: !!$event })" />
      </SettingsRow>
      <SettingsRow
        v-if="preferences.memories && people.length"
        :title="__('Hide people')"
        :description="
          hidden.size === 1
            ? __('Memories skip photos with 1 person.')
            : hidden.size
              ? __('Memories skip photos with {0} people.', [hidden.size])
              : __('Memories skip photos with the people you pick.')
        "
      >
        <Button @click="picking = true">{{ __('Choose') }}</Button>
      </SettingsRow>
    </div>
    <HideFacesDialog
      v-model:open="picking"
      :people="people.map((person) => ({ ...person, face: person.cover_face }))"
      @changed="getPreferences().then((data) => (preferences = data))"
    />
  </SettingsBody>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Button, SettingsBody, SettingsHeader, SettingsRow, Switch, toast } from 'frappe-ui'

import { type Person, getPeople } from '../../resources/people'
import { type Preferences, getPreferences, savePreferences } from '../../resources/settings'
import { memoriesVersion } from '../../data/viewer'
import HideFacesDialog from '../HideFacesDialog.vue'

const preferences = ref<Preferences | null>(null)
const people = ref<Person[]>([])
const picking = ref(false)
const hidden = computed(() => new Set(preferences.value?.memory_hidden_people ?? []))

getPreferences().then((data) => (preferences.value = data))
getPeople().then((data) => (people.value = data.people))

async function save(changes: Partial<Preferences>) {
  if (!preferences.value) return
  const previous = preferences.value
  preferences.value = { ...previous, ...changes }
  try {
    preferences.value = await savePreferences(preferences.value)
    memoriesVersion.value++
  } catch {
    preferences.value = previous
    toast.error(__('Could not save'))
  }
}
</script>
