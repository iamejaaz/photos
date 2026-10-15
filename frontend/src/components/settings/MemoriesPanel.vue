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
      <section v-if="preferences.memories && people.length">
        <h3 class="text-base font-semibold text-ink-gray-8">{{ __('Hide people') }}</h3>
        <div class="mb-3 mt-1 text-base text-ink-gray-6">
          {{ __('Memories skip photos with the people you pick here.') }}
        </div>
        <div class="grid grid-cols-4 gap-3 sm:grid-cols-6">
          <button
            v-for="person in people"
            :key="person.name"
            class="flex flex-col items-center gap-1.5 text-center"
            :aria-pressed="hidden.has(person.name)"
            @click="togglePerson(person.name)"
          >
            <span class="relative">
              <FaceAvatar
                :face="person.cover_face"
                class="size-14 transition-opacity"
                :class="{ 'opacity-40': hidden.has(person.name) }"
              />
              <span
                v-if="hidden.has(person.name)"
                class="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-surface-gray-10 text-ink-base"
              >
                <LucideEyeOff class="size-3" />
              </span>
            </span>
            <span class="w-full truncate text-sm text-ink-gray-7">{{
              person.person_name || __('Unnamed')
            }}</span>
          </button>
        </div>
      </section>
    </div>
  </SettingsBody>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { SettingsBody, SettingsHeader, SettingsRow, Switch, toast } from 'frappe-ui'
import LucideEyeOff from '~icons/lucide/eye-off'

import { type Person, getPeople } from '../../resources/people'
import { type Preferences, getPreferences, savePreferences } from '../../resources/settings'
import { memoriesVersion } from '../../data/viewer'
import FaceAvatar from '../FaceAvatar.vue'

const preferences = ref<Preferences | null>(null)
const people = ref<Person[]>([])
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

function togglePerson(name: string) {
  const next = new Set(hidden.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  save({ memory_hidden_people: [...next] })
}
</script>
