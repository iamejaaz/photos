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
    <template v-if="codeSentTo">
      <div class="text-base text-ink-gray-5">
        {{ __('Enter the 6 digit code we sent to {0}.', [codeSentTo]) }}
      </div>
      <TextInput
        v-model="code"
        class="w-full"
        :aria-label="__('Code')"
        inputmode="numeric"
        autocomplete="one-time-code"
        :maxlength="6"
        autofocus
      />
    </template>
    <template v-else>
      <div class="text-base text-ink-gray-5">{{ __('Enter your account password to see them.') }}</div>
      <Password v-model="password" class="w-full" :aria-label="__('Password')" :autofocus="!screenLock" />
    </template>
    <ErrorMessage :message="passwordError" />
    <Button variant="solid" class="w-full" type="submit" :loading="unlocking">{{ __('Unlock') }}</Button>
    <Button v-if="screenLock" variant="ghost" class="w-full" :loading="unlocking" @click="screenUnlock">
      <template #prefix><LucideFingerprint class="size-4" /></template>
      {{ __('Use screen lock') }}
    </Button>
    <Button variant="ghost" class="w-full" :loading="sendingCode" @click="sendCode">
      <template #prefix><LucideMail class="size-4" /></template>
      {{ codeSentTo ? __('Send a new code') : __('Email me a code') }}
    </Button>
    <Button v-if="codeSentTo" variant="ghost" class="w-full" @click="codeSentTo = ''">
      {{ __('Use password instead') }}
    </Button>
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
import { errorText } from '../resources/drive'
import { onBeforeUnmount, ref } from 'vue'
import { Button, ErrorMessage, Password, TextInput, usePageMeta } from 'frappe-ui'
import LucideEyeOff from '~icons/lucide/eye-off'
import LucideFingerprint from '~icons/lucide/fingerprint'
import LucideLock from '~icons/lucide/lock'
import LucideMail from '~icons/lucide/mail'

import { appPageMeta } from '@/utils/documentTitle'
import {
  HIDDEN_PHOTOS,
  emailUnlockCode,
  hiddenState,
  lockHidden,
  unlockHidden,
  unlockWithCode,
} from '../resources/hidden'
import PhotoGrid from '../components/PhotoGrid.vue'
import PhotosHeader from '../components/PhotosHeader.vue'
import { createFeed } from '../data/feed'

const unlocked = ref<boolean | null>(null)
const password = ref('')
const passwordError = ref('')
const unlocking = ref(false)
const code = ref('')
const codeSentTo = ref('')
const sendingCode = ref(false)
const handle = createFeed(HIDDEN_PHOTOS)

const screenLock = ref(false)

hiddenState().then(async (state) => {
  unlocked.value = state.unlocked
  if (!import.meta.env.VITE_NATIVE) return
  screenLock.value = await (await import('../native/deviceUnlock')).screenLockAvailable()
  if (!state.unlocked && screenLock.value) screenUnlock()
})

async function screenUnlock() {
  unlocking.value = true
  passwordError.value = ''
  try {
    const { unlockWithScreenLock } = await import('../native/deviceUnlock')
    if (await unlockWithScreenLock(__('Unlock hidden photos'))) unlocked.value = true
  } catch (error) {
    passwordError.value = errorText(error) || __('Enter your password.')
  } finally {
    unlocking.value = false
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
    if (codeSentTo.value) await unlockWithCode(code.value)
    else await unlockHidden(password.value)
    password.value = ''
    code.value = ''
    codeSentTo.value = ''
    unlocked.value = true
  } catch (error) {
    passwordError.value = errorText(error) || __('That password is not right.')
  } finally {
    unlocking.value = false
  }
}

async function sendCode() {
  sendingCode.value = true
  passwordError.value = ''
  try {
    codeSentTo.value = (await emailUnlockCode()).email
    code.value = ''
  } catch (error) {
    passwordError.value = errorText(error) || __('Could not send the code. Try again in a bit.')
  } finally {
    sendingCode.value = false
  }
}

async function relock() {
  await lockHidden()
  unlocked.value = false
}

usePageMeta(() => appPageMeta(__('Hidden'), 'Photos'))
</script>
