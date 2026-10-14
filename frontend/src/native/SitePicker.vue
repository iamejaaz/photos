<template>
  <div class="flex min-h-full flex-col items-center justify-center bg-surface-base px-6 py-10">
    <form class="flex w-full max-w-sm flex-col items-center gap-5 text-center" @submit.prevent="connect">
      <img src="/pwa/icon-192.png" alt="" class="size-16" />
      <div>
        <h1 class="text-xl font-semibold text-ink-gray-9">{{ __('Photos') }}</h1>
        <p class="mt-1 text-base text-ink-gray-6">{{ __('Enter the address of your site to sign in.') }}</p>
      </div>
      <TextInput
        v-model="address"
        class="w-full"
        size="lg"
        placeholder="photos.example.com"
        autocapitalize="off"
        autocorrect="off"
      />
      <ErrorMessage :message="error || notice" />
      <Button
        variant="solid"
        size="lg"
        class="w-full"
        type="submit"
        :loading="busy"
        :disabled="!address.trim()"
      >
        {{ __('Continue') }}
      </Button>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Button, ErrorMessage, TextInput } from 'frappe-ui'

import { signIn } from './auth'
import { type Site, normalizeSiteUrl, probeSite, saveSite } from './sites'

const props = defineProps<{ site?: Site | null; notice?: string }>()
const address = ref(props.site?.url.replace(/^https:\/\//, '') ?? '')
const error = ref('')
const busy = ref(false)

const messages = {
  unreachable: __('Could not reach this site. Check the address and your connection.'),
  'not-photos': __('Photos is not installed on this site.'),
  'no-client': __('This site is not set up for the Photos app yet. Ask your administrator to update Photos.'),
}

async function connect() {
  error.value = ''
  const url = normalizeSiteUrl(address.value)
  if (!url) {
    error.value = __('That does not look like a site address.')
    return
  }
  busy.value = true
  try {
    const probe = await probeSite(url)
    if ('error' in probe) {
      error.value = messages[probe.error]
      return
    }
    await signIn(probe.site.url, probe.site.clientId)
    await saveSite(probe.site)
    window.location.replace('/')
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
</script>
