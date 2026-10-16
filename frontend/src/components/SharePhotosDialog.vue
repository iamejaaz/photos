<template>
  <Dialog
    v-model:open="sharePhotos.open"
    :title="count === 1 ? __('Share photo') : __('Share {0} items', [count])"
    size="sm"
  >
    <div class="flex flex-col gap-3">
      <template v-if="link">
        <div class="text-base text-ink-gray-6">{{ __('Anyone with this link can see these photos.') }}</div>
        <div class="flex items-center gap-2">
          <TextInput
            :model-value="link"
            readonly
            class="flex-1"
            @focus="($event.target as HTMLInputElement).select()"
          />
          <Button variant="solid" @click="copy">{{ copied ? __('Copied') : __('Copy') }}</Button>
        </div>
        <div class="text-sm text-ink-gray-5">
          {{ __('Find it later under Sharing, where you can also stop sharing it.') }}
        </div>
      </template>
      <template v-else>
        <Button variant="solid" class="w-full" :loading="creating" @click="createLink">
          <template #prefix><LucideLink class="size-4" /></template>
          {{ __('Create link') }}
        </Button>
        <Button v-if="canSendFiles" class="w-full" :loading="sending" @click="sendToApps">
          <template #prefix><LucideSend class="size-4" /></template>
          {{ __('Send to apps') }}
        </Button>
      </template>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { errorText } from '../resources/drive'
import { computed, ref, watch } from 'vue'
import { Button, Dialog, TextInput, toast } from 'frappe-ui'
import LucideLink from '~icons/lucide/link'
import LucideSend from '~icons/lucide/send'

import { createShareLink } from '../resources/albums'
import { downloadUrl } from '../resources/media'
import { activeFeed } from '../data/feed'
import { clearSelection } from '../data/selection'
import { sharePhotos } from '../data/dialogs'

const MAX_SEND = 20
const count = computed(() => sharePhotos.files.length)
const link = ref('')
const copied = ref(false)
const creating = ref(false)
const sending = ref(false)
const canSendFiles =
  Boolean(import.meta.env.VITE_NATIVE) ||
  (typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [new File([], 'a.jpg', { type: 'image/jpeg' })] }))

watch(
  () => sharePhotos.open,
  (open) => open && ((link.value = ''), (copied.value = false)),
)

async function createLink() {
  creating.value = true
  try {
    const album = await createShareLink(sharePhotos.files)
    link.value = `${window.location.origin}/photos/albums/${album}`
    clearSelection()
  } catch (error) {
    toast.error(errorText(error) || __('Could not create the link'))
  } finally {
    creating.value = false
  }
}

async function copy() {
  await navigator.clipboard.writeText(link.value)
  copied.value = true
}

async function sendToApps() {
  if (count.value > MAX_SEND) {
    toast.warning(__('Pick up to {0} items to send', [MAX_SEND]))
    return
  }
  sending.value = true
  try {
    if (import.meta.env.VITE_NATIVE) {
      const { shareFiles } = await import('../native/save')
      const rows = activeFeed.value?.feed.rows ?? []
      await shareFiles(
        sharePhotos.files.map((name) => ({
          url: downloadUrl(name),
          name: rows.find((row) => row.name === name)?.file_name ?? name,
        })),
      )
      sharePhotos.open = false
      clearSelection()
      return
    }
    const files = await Promise.all(
      sharePhotos.files.map(async (name) => {
        const response = await fetch(downloadUrl(name))
        const blob = await response.blob()
        const fileName = /filename\*?=(?:UTF-8'')?"?([^";]+)/.exec(
          response.headers.get('Content-Disposition') || '',
        )
        return new File([blob], decodeURIComponent(fileName?.[1] || name), { type: blob.type })
      }),
    )
    await navigator.share({ files })
    sharePhotos.open = false
    clearSelection()
  } catch (error) {
    if ((error as Error).name !== 'AbortError') toast.error(__('Could not send these photos'))
  } finally {
    sending.value = false
  }
}
</script>
