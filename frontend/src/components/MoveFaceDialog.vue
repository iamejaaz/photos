<template>
  <Dialog v-model:open="open" :title="__('Who is this?')" size="sm">
    <div class="flex flex-col gap-3">
      <TextInput v-model="query" :placeholder="__('Search or type a new name')" autofocus />
      <div class="flex max-h-72 flex-col overflow-y-auto">
        <button
          v-for="person in matches"
          :key="person.name"
          class="flex items-center gap-3 rounded px-2 py-1.5 text-left text-base text-ink-gray-8 hover:bg-surface-gray-2"
          @click="save(person.name)"
        >
          <FaceAvatar :face="person.cover_face" class="size-8" />
          {{ person.person_name || __('Unnamed') }}
        </button>
        <button
          v-if="query.trim()"
          class="flex items-center gap-3 rounded px-2 py-1.5 text-left text-base text-ink-gray-8 hover:bg-surface-gray-2"
          @click="save(null)"
        >
          <span class="flex size-8 items-center justify-center rounded-full bg-surface-gray-2">
            <LucidePlus class="size-4 text-ink-gray-6" />
          </span>
          {{ __('New person "{0}"', [query.trim()]) }}
        </button>
      </div>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Dialog, TextInput, toast } from 'frappe-ui'
import LucidePlus from '~icons/lucide/plus'

import { type Person, getPeople, moveFace } from '../api'
import FaceAvatar from './FaceAvatar.vue'

const props = defineProps<{ face: string | null; current?: string | null }>()
const open = defineModel<boolean>({ default: false })
const emit = defineEmits<{ moved: [] }>()
const people = ref<Person[]>([])
const query = ref('')

watch(open, async (value) => {
  if (!value) return
  query.value = ''
  people.value = (await getPeople(true)).people
})

const matches = computed(() =>
  people.value
    .filter((person) => person.name !== props.current)
    .filter((person) => (person.person_name || '').toLowerCase().includes(query.value.trim().toLowerCase()))
    .slice(0, 30),
)

async function save(person: string | null) {
  if (!props.face) return
  try {
    await moveFace(props.face, person, person ? undefined : query.value.trim())
    open.value = false
    emit('moved')
    toast.success(__('Face moved'))
  } catch (error) {
    toast.error((error as { messages?: string[] }).messages?.[0] ?? __('Could not move the face'))
  }
}
</script>
