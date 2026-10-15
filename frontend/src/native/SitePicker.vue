<template>
  <div class="flex min-h-full flex-col items-center justify-center bg-surface-base px-6 py-10">
    <form class="flex w-full max-w-sm flex-col items-center gap-5 text-center" @submit.prevent="connect">
      <img src="/pwa/icon-192.png" alt="" class="size-16" />
      <div>
        <h1 class="text-xl font-semibold text-ink-gray-9">{{ __('Photos') }}</h1>
        <p class="mt-1 text-base text-ink-gray-6">
          {{
            cancellable
              ? __('Enter the address of another site. You stay signed in to your current one.')
              : __('Enter the address of your site to sign in.')
          }}
        </p>
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
      <div v-if="others.length" class="flex w-full flex-col gap-2 pt-2">
        <div class="text-sm text-ink-gray-5">{{ __('Or go to a site you are signed in to') }}</div>
        <button
          v-for="other in others"
          :key="other.url"
          type="button"
          class="flex w-full items-center gap-3 rounded-lg border border-outline-gray-2 px-3 py-2.5 text-left active:bg-surface-gray-2"
          @click="switchAccount(other)"
        >
          <Avatar size="lg" :image="other.image ?? undefined" :label="other.fullName || other.user" />
          <div class="min-w-0">
            <div class="truncate text-base font-medium text-ink-gray-8">
              {{ other.fullName || other.user }}
            </div>
            <div class="truncate text-sm text-ink-gray-5">{{ hostOf(other.url) }}</div>
          </div>
        </button>
      </div>
      <Button v-if="cancellable" variant="ghost" size="lg" class="w-full" @click="cancel">
        {{ __('Cancel') }}
      </Button>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Avatar, Button, ErrorMessage, TextInput } from 'frappe-ui'

import { signIn } from './auth'
import { tokenStore } from './auth'
import {
  type Account,
  type Site,
  normalizeSiteUrl,
  probeSite,
  saveSite,
  savedAccounts,
  stopAddingSite,
  switchAccount,
} from './sites'

const props = defineProps<{ site?: Site | null; notice?: string; cancellable?: boolean }>()
const address = ref(props.site?.url.replace(/^https:\/\//, '') ?? '')
const error = ref('')
const busy = ref(false)
const others = ref<Account[]>([])
const hostOf = (url: string) => new URL(url).host

savedAccounts().then(async (accounts) => {
  const usable = await Promise.all(
    accounts.map(async (account) =>
      account.url !== props.site?.url && !props.cancellable && (await tokenStore.get(account.url))
        ? account
        : null,
    ),
  )
  others.value = usable.filter((account): account is Account => Boolean(account))
})

const messages = {
  unreachable: __('Could not reach this site. Check the address and your connection.'),
  'not-photos': __('Photos is not installed on this site.'),
  'no-client': __('This site is not set up for the Photos app yet. Ask your administrator to update Photos.'),
}

function cancel() {
  stopAddingSite()
  window.location.replace('/')
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
    stopAddingSite()
    await saveSite(probe.site)
    window.location.replace('/')
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
</script>
