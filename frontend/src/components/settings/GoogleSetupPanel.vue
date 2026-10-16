<template>
  <SettingsHeader
    :title="__('Google Photos import')"
    :description="
      __(
        'Google needs Photos registered once before anyone can pick photos from their Google account. Every person still signs in with their own account.',
      )
    "
  />
  <SettingsBody>
    <div v-if="!setup" class="flex justify-center py-8"><LoadingIndicator class="size-5" /></div>
    <div v-else class="flex flex-col gap-5">
      <div class="flex items-center gap-2 rounded-lg bg-surface-gray-2 px-3 py-2 text-base text-ink-gray-8">
        <component
          :is="setup.working ? LucideCircleCheck : LucideCircleAlert"
          class="size-4 shrink-0"
          :class="setup.working ? 'text-ink-green-3' : 'text-ink-amber-3'"
        />
        {{
          setup.working
            ? __('Ready. People can connect their Google account in Import.')
            : __('Not set up yet. Follow the steps below once.')
        }}
      </div>
      <ol class="flex min-w-0 list-decimal flex-col gap-3 pl-5 text-base text-ink-gray-8">
        <li>
          {{ __('In Google Cloud, create a project and turn on the') }}
          <a class="underline" :href="PICKER_API" target="_blank" rel="noopener">{{
            __('Photos Picker API')
          }}</a
          >.
        </li>
        <li>
          {{ __('Set up the') }}
          <a class="underline" :href="CONSENT" target="_blank" rel="noopener">{{
            __('OAuth consent screen')
          }}</a>
          {{ __('as External and add the Photos Picker scope.') }}
        </li>
        <li class="min-w-0">
          <span>
            {{ __('Create an') }}
            <a class="underline" :href="CREDENTIALS" target="_blank" rel="noopener">{{
              __('OAuth client')
            }}</a>
            {{ __('of type Web application with this redirect address:') }}
          </span>
          <div class="mt-2 flex items-center gap-2">
            <code class="min-w-0 flex-1 break-all rounded bg-surface-gray-2 px-2 py-1.5 text-sm">{{
              setup.redirect_url
            }}</code>
            <Button @click="copyRedirect">
              <template #prefix><LucideCopy class="size-4" /></template>
              {{ copied ? __('Copied') : __('Copy') }}
            </Button>
          </div>
        </li>
        <li>{{ __('Paste the client ID and secret here and save.') }}</li>
      </ol>
      <form class="flex flex-col gap-3" @submit.prevent="save">
        <FormControl
          v-model="clientId"
          :label="__('Client ID')"
          placeholder="1234-abc.apps.googleusercontent.com"
        />
        <FormControl
          v-model="clientSecret"
          type="password"
          :label="__('Client secret')"
          :placeholder="setup.has_secret ? __('Saved. Type a new one to replace it.') : ''"
        />
        <ErrorMessage :message="error" />
        <div>
          <Button variant="solid" type="submit" :loading="saving" :disabled="!clientId.trim()">
            {{ __('Save') }}
          </Button>
        </div>
      </form>
    </div>
  </SettingsBody>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import {
  Button,
  ErrorMessage,
  FormControl,
  LoadingIndicator,
  SettingsBody,
  SettingsHeader,
  call,
  toast,
} from 'frappe-ui'
import LucideCircleAlert from '~icons/lucide/circle-alert'
import LucideCircleCheck from '~icons/lucide/circle-check'
import LucideCopy from '~icons/lucide/copy'

import { errorText } from '../../resources/drive'

type Setup = {
  enabled: boolean
  client_id: string
  has_secret: boolean
  redirect_url: string
  working: boolean
}

const PICKER_API = 'https://console.cloud.google.com/apis/library/photospicker.googleapis.com'
const CONSENT = 'https://console.cloud.google.com/auth/branding'
const CREDENTIALS = 'https://console.cloud.google.com/auth/clients'

const setup = ref<Setup | null>(null)
const clientId = ref('')
const clientSecret = ref('')
const error = ref('')
const saving = ref(false)
const copied = ref(false)

;(call('photos.api.google.google_setup') as Promise<Setup>).then((value) => {
  setup.value = value
  clientId.value = value.client_id
})

async function copyRedirect() {
  await navigator.clipboard.writeText(setup.value?.redirect_url ?? '')
  copied.value = true
}

async function save() {
  error.value = ''
  saving.value = true
  try {
    setup.value = (await call('photos.api.google.save_google_setup', {
      client_id: clientId.value,
      client_secret: clientSecret.value,
    })) as Setup
    clientSecret.value = ''
    toast.success(__('Saved. People can now connect their Google account.'))
  } catch (err) {
    error.value = errorText(err) || __('Could not save')
  } finally {
    saving.value = false
  }
}
</script>
