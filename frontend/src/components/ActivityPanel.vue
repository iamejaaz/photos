<template>
  <aside
    class="flex w-80 shrink-0 flex-col border-l bg-surface-base max-md:fixed max-md:inset-0 max-md:z-30 max-md:w-full"
  >
    <div class="flex items-center justify-between px-4 py-3">
      <span class="text-base font-semibold text-ink-gray-9">{{ __('Activity') }}</span>
      <Button variant="ghost" :aria-label="__('Close')" @click="emit('close')">
        <template #icon><LucideX class="size-4" /></template>
      </Button>
    </div>
    <div ref="list" class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
      <p v-if="loaded && !items.length" class="py-10 text-center text-base text-ink-gray-5">
        {{ __('No comments yet. Say something about these photos.') }}
      </p>
      <div v-for="item in items" :key="item.name" class="group flex gap-2.5">
        <Avatar
          :label="item.full_name"
          :image="item.user_image ? mediaUrl(item.user_image) : undefined"
          size="md"
          class="shrink-0"
        />
        <div class="min-w-0 flex-1">
          <div class="flex items-baseline gap-1.5 text-sm">
            <span class="font-medium text-ink-gray-8">{{ item.full_name }}</span>
            <span class="text-ink-gray-5">{{ dayjs(item.creation).fromNow() }}</span>
          </div>
          <p v-if="item.type === 'Comment'" class="whitespace-pre-wrap break-words text-base text-ink-gray-8">
            {{ item.content }}
          </p>
          <p v-else class="flex items-center gap-1 text-base text-ink-gray-7">
            <LucideHeart class="size-3.5 fill-current text-ink-red-3" />
            {{ item.file ? __('liked a photo') : __('liked this album') }}
          </p>
          <button v-if="item.file" class="mt-1.5" @click="emit('open-photo', item.file)">
            <img :src="thumbnailUrl(item.file, album)" class="size-14 rounded-md object-cover" alt="" />
          </button>
        </div>
        <button
          v-if="item.owner === sessionUser || canModerate"
          class="invisible self-start rounded p-1 text-ink-gray-5 hover:bg-surface-gray-2 group-hover:visible"
          :aria-label="__('Remove')"
          @click="remove(item.name)"
        >
          <LucideTrash2 class="size-3.5" />
        </button>
      </div>
    </div>
    <form v-if="loggedIn" class="flex items-end gap-2 border-t p-3" @submit.prevent="send">
      <Textarea
        v-model="draft"
        class="flex-1"
        :rows="1"
        :placeholder="__('Add a comment')"
        @keydown.enter.exact.prevent="send"
      />
      <Button variant="solid" type="submit" :disabled="!draft.trim()" :loading="sending">
        <template #icon><LucideSendHorizontal class="size-4" /></template>
      </Button>
    </form>
  </aside>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { Avatar, Button, Textarea } from 'frappe-ui'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import LucideHeart from '~icons/lucide/heart'
import LucideSendHorizontal from '~icons/lucide/send-horizontal'
import LucideTrash2 from '~icons/lucide/trash-2'
import LucideX from '~icons/lucide/x'

import { initSocket } from '@/apps/drive/socket'
import { useSessionStore } from '@/boot/session'
import { type Activity, addComment, deleteActivity, getActivity, mediaUrl, thumbnailUrl } from '../api'

dayjs.extend(relativeTime)

const props = defineProps<{ album: string; canModerate?: boolean }>()
const emit = defineEmits<{ close: []; 'open-photo': [file: string]; changed: [] }>()

const items = ref<Activity[]>([])
const loaded = ref(false)
const draft = ref('')
const sending = ref(false)
const list = ref<HTMLElement>()
const sessionUser = computed(() => useSessionStore().user)
const loggedIn = computed(() => useSessionStore().isLoggedIn)

async function refresh() {
  items.value = await getActivity(props.album)
  loaded.value = true
  await nextTick()
  list.value?.scrollTo({ top: list.value.scrollHeight })
}
refresh()

async function send() {
  if (!draft.value.trim()) return
  sending.value = true
  try {
    await addComment(props.album, draft.value)
    draft.value = ''
    await refresh()
  } finally {
    sending.value = false
  }
}

async function remove(name: string) {
  await deleteActivity(name)
  await refresh()
  emit('changed')
}

const onActivity = (data: { album: string }) => data.album === props.album && refresh()
const socket = loggedIn.value ? initSocket() : null
socket?.on('photos-album-activity', onActivity)
onBeforeUnmount(() => socket?.off('photos-album-activity', onActivity))

defineExpose({ refresh })
</script>
