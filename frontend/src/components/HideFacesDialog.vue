<template>
  <Dialog v-model:open="open" :title="__('Hide faces from memories')" size="lg">
    <div class="grid grid-cols-4 gap-3 sm:grid-cols-6">
      <button
        v-for="person in people"
        :key="person.name"
        class="flex flex-col items-center gap-1.5 text-center"
        :aria-pressed="hidden.has(person.name)"
        @click="toggle(person.name)"
      >
        <span class="relative">
          <FaceAvatar
            :face="person.face"
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
        <span class="w-full truncate text-sm text-ink-gray-7">{{ person.person_name || __('Unnamed') }}</span>
      </button>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Dialog, toast } from 'frappe-ui'
import LucideEyeOff from '~icons/lucide/eye-off'

import { type Preferences, getPreferences, savePreferences } from '../resources/settings'
import { memoriesVersion } from '../data/viewer'
import FaceAvatar from './FaceAvatar.vue'

defineProps<{ people: { name: string; person_name?: string | null; face: string }[] }>()
const emit = defineEmits<{ changed: [hidden: Set<string>] }>()
const open = defineModel<boolean>('open', { default: false })

const preferences = ref<Preferences | null>(null)
const hidden = computed(() => new Set(preferences.value?.memory_hidden_people ?? []))

watch(open, (value) => value && getPreferences().then((data) => (preferences.value = data)), {
  immediate: true,
})

async function toggle(name: string) {
  if (!preferences.value) return
  const next = new Set(hidden.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  const previous = preferences.value
  preferences.value = { ...previous, memory_hidden_people: [...next] }
  try {
    preferences.value = await savePreferences(preferences.value)
    memoriesVersion.value++
    emit('changed', hidden.value)
  } catch {
    preferences.value = previous
    toast.error(__('Could not save'))
  }
}
</script>
