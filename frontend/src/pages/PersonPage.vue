<template>
  <PhotosHeader mode="person" hide-upload @remove-from-person="removePhotos">
    <template #title>
      <router-link
        :to="{ name: 'photos-people' }"
        class="text-lg font-semibold text-ink-gray-5 hover:text-ink-gray-8"
      >
        {{ __('People') }}
      </router-link>
      <LucideChevronRight class="size-4 shrink-0 text-ink-gray-4" />
      <FaceAvatar :face="info?.cover_face" class="size-7 shrink-0" />
      <form v-if="editing" ref="nameForm" @submit.prevent="saveName">
        <TextInput
          v-model="nameDraft"
          class="w-56"
          :placeholder="__('Add a name')"
          autofocus
          @blur="saveName"
        />
      </form>
      <button
        v-else
        class="truncate text-lg font-semibold"
        :class="info?.person_name ? 'text-ink-gray-9' : 'text-ink-gray-5'"
        @click="startEditing"
      >
        {{ info?.person_name || __('Add a name') }}
      </button>
    </template>
    <template #actions>
      <Dropdown :options="menu">
        <Button variant="ghost" :aria-label="__('Person options')">
          <template #icon><LucideEllipsis class="size-4" /></template>
        </Button>
      </Dropdown>
    </template>
  </PhotosHeader>
  <PhotoGrid
    :handle="handle"
    :empty-icon="LucideUserRound"
    :empty-title="__('No photos')"
    :empty-text="__('This person is not in any photos anymore.')"
  />
  <Dialog v-model:open="merging" :title="__('Same person as…')" size="xl">
    <p class="mb-3 text-base text-ink-gray-6">
      {{
        __('Pick everyone who is really {0}. Their photos move here.', [
          info?.person_name || __('this person'),
        ])
      }}
    </p>
    <div class="grid max-h-80 grid-cols-4 gap-3 overflow-y-auto sm:grid-cols-6">
      <button
        v-for="other in others"
        :key="other.name"
        class="flex flex-col items-center gap-1.5 text-center"
        @click="toggleMerge(other.name)"
      >
        <div class="relative w-full">
          <FaceAvatar
            :face="other.cover_face"
            class="aspect-square w-full"
            :class="{ 'ring-2 ring-outline-gray-5 ring-offset-2': mergePicks.has(other.name) }"
          />
          <span
            v-if="mergePicks.has(other.name)"
            class="absolute right-0 top-0 flex size-5 items-center justify-center rounded-full bg-surface-gray-10 text-ink-base"
          >
            <LucideCheck class="size-3" />
          </span>
        </div>
        <span class="w-full truncate text-sm text-ink-gray-7">{{ other.person_name || __('No name') }}</span>
      </button>
    </div>
    <template #actions>
      <div class="flex justify-end">
        <Button variant="solid" :disabled="!mergePicks.size" @click="merge">
          {{ __('Merge {0}', [mergePicks.size]) }}
        </Button>
      </div>
    </template>
  </Dialog>
  <Dialog
    :open="Boolean(duplicate)"
    :title="__('Same person?')"
    size="sm"
    @update:open="(open: boolean) => !open && (duplicate = null)"
  >
    <div class="flex flex-col items-center gap-4 py-2 text-center">
      <div class="flex items-center gap-3">
        <FaceAvatar :face="info?.cover_face" class="size-20" />
        <FaceAvatar :face="duplicate?.cover_face" class="size-20" />
      </div>
      <p class="text-base text-ink-gray-7">
        {{
          __('You already have someone named {0}. Are these the same person?', [duplicate?.person_name ?? ''])
        }}
      </p>
    </div>
    <template #actions>
      <div class="flex justify-end gap-2">
        <Button @click="keepSeparate">{{ __('Different people') }}</Button>
        <Button variant="solid" @click="mergeIntoDuplicate">{{ __('Same person') }}</Button>
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Dialog, Dropdown, TextInput, toast, usePageMeta } from 'frappe-ui'
import LucideCheck from '~icons/lucide/check'
import LucideChevronRight from '~icons/lucide/chevron-right'
import LucideEllipsis from '~icons/lucide/ellipsis'
import LucideUserRound from '~icons/lucide/user-round'

import { appPageMeta } from '@/utils/documentTitle'
import {
  PERSON_PHOTOS,
  type Person,
  type PersonSummary,
  getPeople,
  getPerson,
  mergePeople,
  removePhotosFromPerson,
  renamePerson,
  setPersonHidden,
} from '../resources/people'
import FaceAvatar from '../components/FaceAvatar.vue'
import PhotoGrid from '../components/PhotoGrid.vue'
import PhotosHeader from '../components/PhotosHeader.vue'
import { clearSelection } from '../data/selection'
import { createFeed } from '../data/feed'
import { errorText } from '../resources/drive'
import { mergedToast } from '../data/actions'

const props = defineProps<{ person: string }>()
const router = useRouter()
const handle = createFeed(PERSON_PHOTOS, { person: props.person })
const info = ref<Person>()
const editing = ref(false)
const nameForm = ref<HTMLFormElement>()
const nameDraft = ref('')
const merging = ref(false)
const duplicate = ref<PersonSummary | null>(null)
const others = ref<Person[]>([])
const mergePicks = reactive(new Set<string>())

async function refresh() {
  try {
    info.value = await getPerson(props.person)
  } catch (error) {
    toast.info(errorText(error) || __('This person is no longer in your library.'))
    router.replace({ name: 'photos-people' })
  }
}
refresh()

async function startEditing() {
  nameDraft.value = info.value?.person_name ?? ''
  editing.value = true
  await nextTick()
  nameForm.value?.querySelector('input')?.focus()
}

async function saveName() {
  if (!editing.value) return
  editing.value = false
  if ((nameDraft.value || '') === (info.value?.person_name || '')) return
  const result = await renamePerson(props.person, nameDraft.value)
  if (result?.duplicate) {
    duplicate.value = result.duplicate
    return
  }
  await refresh()
}

async function keepSeparate() {
  if (!duplicate.value) return
  await renamePerson(props.person, duplicate.value.person_name ?? '', false, true)
  duplicate.value = null
  await refresh()
}

async function mergeIntoDuplicate() {
  if (!duplicate.value) return
  const result = await renamePerson(props.person, duplicate.value.person_name ?? '', true)
  duplicate.value = null
  mergedToast(result?.undo, () => router.replace({ name: 'photos-person', params: { person: props.person } }))
  if (result?.merged_into) router.replace({ name: 'photos-person', params: { person: result.merged_into } })
}

const menu = computed(() => [
  { label: __('Rename'), icon: 'lucide-pencil', onClick: startEditing },
  { label: __('Same person as…'), icon: 'lucide-users', onClick: openMerge },
  info.value?.hidden
    ? { label: __('Show in People'), icon: 'lucide-eye', onClick: () => hide(false) }
    : { label: __('Hide from People'), icon: 'lucide-eye-off', onClick: () => hide(true) },
])

async function openMerge() {
  mergePicks.clear()
  others.value = (await getPeople(true)).people.filter((person) => person.name !== props.person)
  merging.value = true
}

function toggleMerge(name: string) {
  if (mergePicks.has(name)) mergePicks.delete(name)
  else mergePicks.add(name)
}

async function merge() {
  const { undo } = await mergePeople(props.person, [...mergePicks])
  merging.value = false
  mergedToast(undo, async () => {
    await refresh()
    handle.reload()
  })
  await refresh()
  handle.reload()
}

async function hide(value: boolean) {
  await setPersonHidden(props.person, value)
  if (value) {
    toast.success(__('Hidden from People'))
    router.push({ name: 'photos-people' })
  } else await refresh()
}

async function removePhotos(files: string[]) {
  await removePhotosFromPerson(props.person, files)
  handle.remove(files)
  clearSelection()
  toast.success(__('Removed from this person'))
  refresh()
}

usePageMeta(() => appPageMeta(info.value?.person_name || __('People'), 'Photos'))
</script>
