<template>
  <Dialog
    v-model:open="open"
    :title="__('Auto-add people')"
    size="md"
    :actions="[{ label: __('Save'), variant: 'solid', loading: saving, onClick: save }]"
  >
    <div class="flex flex-col gap-3">
      <div class="text-base text-ink-gray-6">
        {{ __('Photos of the people you pick are added to this album, now and whenever new ones come in.') }}
      </div>
      <div v-if="people.length" class="grid grid-cols-4 gap-3 sm:grid-cols-5">
        <button
          v-for="person in people"
          :key="person.name"
          class="flex flex-col items-center gap-1.5 text-center"
          :aria-pressed="picked.has(person.name)"
          @click="toggle(person.name)"
        >
          <span class="relative">
            <FaceAvatar
              :face="person.cover_face"
              class="size-14 ring-2 ring-offset-2 transition"
              :class="picked.has(person.name) ? 'ring-outline-gray-5' : 'ring-transparent'"
            />
            <span
              v-if="picked.has(person.name)"
              class="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-surface-gray-10 text-ink-base"
            >
              <LucideCheck class="size-3" />
            </span>
          </span>
          <span class="w-full truncate text-sm text-ink-gray-7">{{
            person.person_name || __('Unnamed')
          }}</span>
        </button>
      </div>
      <div v-else class="text-base text-ink-gray-5">
        {{ __('Turn on People in Settings to group photos by face first.') }}
      </div>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { Dialog, toast } from 'frappe-ui'
import LucideCheck from '~icons/lucide/check'

import { type Album, type Person, getPeople, setAutoPeople } from '../api'
import FaceAvatar from './FaceAvatar.vue'

const props = defineProps<{ album: Album }>()
const open = defineModel<boolean>({ default: false })
const emit = defineEmits<{ saved: [] }>()
const people = ref<Person[]>([])
const picked = ref(new Set<string>())
const saving = ref(false)

watch(open, async (value) => {
  if (!value) return
  picked.value = new Set(props.album.auto_people ?? [])
  people.value = (await getPeople()).people
})

function toggle(name: string) {
  const next = new Set(picked.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  picked.value = next
}

async function save() {
  saving.value = true
  try {
    const added = await setAutoPeople(props.album.name, [...picked.value])
    open.value = false
    emit('saved')
    toast.success(
      added
        ? __('Added {0} photos to this album', [added])
        : __('This album will now add them automatically'),
    )
  } catch (error) {
    toast.error((error as { messages?: string[] }).messages?.[0] ?? __('Could not save'))
  } finally {
    saving.value = false
  }
}
</script>
