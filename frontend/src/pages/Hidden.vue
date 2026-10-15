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
    <template v-if="device.saved">
      <div class="text-base text-ink-gray-5">
        {{ __('Use your fingerprint or screen lock to see them.') }}
      </div>
      <Button variant="solid" class="w-full" :loading="unlocking" @click="deviceUnlock">
        <template #prefix><LucideFingerprint class="size-4" /></template>
        {{ __('Unlock with screen lock') }}
      </Button>
      <div class="mt-4 text-sm text-ink-gray-5">{{ __('Or use your password') }}</div>
    </template>
    <div v-else class="text-base text-ink-gray-5">{{ __('Enter your account password to see them.') }}</div>
    <Password v-model="password" class="w-full" :autofocus="!device.saved" />
    <ErrorMessage :message="passwordError" />
    <Button :variant="device.saved ? 'subtle' : 'solid'" class="w-full" type="submit" :loading="unlocking">
      {{ __('Unlock') }}
    </Button>
  </form>
  <template v-else-if="unlocked">
    <div
      v-if="device.available && !device.saved"
      class="mx-3 mt-3 flex items-center gap-3 rounded-xl bg-surface-gray-2 p-3 sm:mx-5"
    >
      <LucideFingerprint class="size-5 shrink-0 text-ink-gray-7" />
      <div class="flex-1 text-base text-ink-gray-7">
        {{ __('Unlock with your fingerprint or screen lock next time') }}
      </div>
      <Button size="sm" :loading="enabling" @click="turnOnDeviceUnlock">{{ __('Turn on') }}</Button>
    </div>
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
import { onBeforeUnmount, reactive, ref } from 'vue'
import { Button, ErrorMessage, Password, toast, usePageMeta } from 'frappe-ui'
import LucideEyeOff from '~icons/lucide/eye-off'
import LucideFingerprint from '~icons/lucide/fingerprint'
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

const device = reactive({ available: false, saved: false })
const enabling = ref(false)
const nativeUnlock = () => import('../native/deviceUnlock')

hiddenState().then(async (state) => {
  unlocked.value = state.unlocked
  if (!import.meta.env.VITE_NATIVE) return
  Object.assign(device, await (await nativeUnlock()).deviceUnlockStatus())
  if (!state.unlocked && device.saved) deviceUnlock()
})

async function deviceUnlock() {
  unlocking.value = true
  passwordError.value = ''
  try {
    if (await (await nativeUnlock()).unlockWithDevice(__('Unlock hidden photos'))) unlocked.value = true
  } catch (error) {
    device.saved = false
    passwordError.value = (error as { messages?: string[] }).messages?.[0] ?? __('Enter your password.')
  } finally {
    unlocking.value = false
  }
}

async function turnOnDeviceUnlock() {
  enabling.value = true
  try {
    await (await nativeUnlock()).enableDeviceUnlock()
    device.saved = true
    toast.success(__('You can now unlock with your screen lock'))
  } catch (error) {
    toast.error((error as Error).message || __('Could not turn this on'))
  } finally {
    enabling.value = false
  }
}
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
