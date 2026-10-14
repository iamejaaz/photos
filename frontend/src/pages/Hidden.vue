<template>
  <PhotosHeader :title="__('Hidden')" mode="hidden" hide-upload>
    <template v-if="unlocked" #actions>
      <Button variant="ghost" @click="relock">
        <template #prefix><LucideLock class="size-4" /></template>
        {{ __('Lock') }}
      </Button>
    </template>
  </PhotosHeader>
  <form
    v-if="unlocked === false"
    class="mx-auto flex max-w-xs flex-col items-center gap-3 px-6 py-24 text-center"
    @submit.prevent="unlock"
  >
    <LucideLock class="size-6 text-ink-gray-6" />
    <div class="text-lg font-medium text-ink-gray-8">{{ __('Hidden photos are locked') }}</div>
    <div class="text-base text-ink-gray-5">{{ __('Enter your account password to see them.') }}</div>
    <Password v-model="password" class="w-full" autofocus />
    <ErrorMessage :message="passwordError" />
    <Button variant="solid" class="w-full" type="submit" :loading="unlocking">{{ __('Unlock') }}</Button>
  </form>
  <template v-else-if="unlocked">
    <div class="px-3 pt-3 text-base text-ink-gray-5 sm:px-5">
      {{
        __(
          'Hidden photos stay out of your timeline, search, memories and albums here. They are still in your Drive.',
        )
      }}
    </div>
    <PhotoGrid
      :handle="handle"
      :empty-icon="LucideEyeOff"
      :empty-title="__('Nothing hidden')"
      :empty-text="__('Select photos and choose Hide to keep them here, behind your password.')"
    />
  </template>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { Button, ErrorMessage, Password, usePageMeta } from 'frappe-ui'
import LucideEyeOff from '~icons/lucide/eye-off'
import LucideLock from '~icons/lucide/lock'

import { appPageMeta } from '@/utils/documentTitle'
import { HIDDEN_PHOTOS, hiddenState, lockHidden, unlockHidden } from '../api'
import PhotoGrid from '../components/PhotoGrid.vue'
import PhotosHeader from '../components/PhotosHeader.vue'
import { createFeed } from '../store'

const unlocked = ref<boolean | null>(null)
const password = ref('')
const passwordError = ref('')
const unlocking = ref(false)
const handle = createFeed(HIDDEN_PHOTOS)

hiddenState().then((state) => (unlocked.value = state.unlocked))
const timer = setInterval(
  () => unlocked.value && hiddenState().then((state) => (unlocked.value = state.unlocked)),
  60_000,
)
onBeforeUnmount(() => clearInterval(timer))

async function unlock() {
  unlocking.value = true
  passwordError.value = ''
  try {
    await unlockHidden(password.value)
    password.value = ''
    unlocked.value = true
  } catch (error) {
    passwordError.value =
      (error as { messages?: string[] }).messages?.[0] ?? __('That password is not right.')
  } finally {
    unlocking.value = false
  }
}

async function relock() {
  await lockHidden()
  unlocked.value = false
}

usePageMeta(() => appPageMeta(__('Hidden'), 'Photos'))
</script>
