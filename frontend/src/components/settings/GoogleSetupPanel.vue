<template>
  <SettingsHeader
    :title="__('Google Photos import')"
    :description="__('Register Photos with Google once so people can pick from their own Google Photos.')"
  >
    <template v-if="setup" #actions>
      <Badge
        :theme="setup.working ? 'green' : 'amber'"
        :label="setup.working ? __('Ready') : __('Not set up')"
      />
    </template>
  </SettingsHeader>
  <SettingsBody>
    <div v-if="!setup" class="flex justify-center py-8"><LoadingIndicator class="size-5" /></div>
    <template v-else>
      <div class="divide-y divide-outline-gray-1">
        <SettingsRow
          :title="__('Turn on the Photos Picker API')"
          :description="__('In a Google Cloud project you own.')"
        >
          <Button :href="PICKER_API">
            <template #suffix><LucideArrowUpRight class="size-4" /></template>
            {{ __('Open') }}
          </Button>
        </SettingsRow>
        <SettingsRow
          :title="__('Set up the consent screen')"
          :description="__('Choose External and add the Photos Picker scope.')"
        >
          <Button :href="CONSENT">
            <template #suffix><LucideArrowUpRight class="size-4" /></template>
            {{ __('Open') }}
          </Button>
        </SettingsRow>
        <SettingsRow
          :title="__('Create a Web application client')"
          :description="__('Paste the redirect address Photos copies for you.')"
        >
          <div class="flex gap-2">
            <Button @click="copyRedirect">{{ copied ? __('Copied') : __('Copy address') }}</Button>
            <Button :href="CREDENTIALS" :aria-label="__('Open Google Cloud credentials')">
              <template #icon><LucideArrowUpRight class="size-4" /></template>
            </Button>
          </div>
        </SettingsRow>
      </div>
      <form class="mt-6 flex flex-col gap-4" @submit.prevent="save">
        <FormControl
          v-model="clientId"
          :label="__('Client ID')"
          placeholder="1234-abc.apps.googleusercontent.com"
        />
        <FormControl
          v-model="clientSecret"
          type="password"
          :label="__('Client secret')"
          :placeholder="setup.has_secret ? __('Saved') : ''"
          :description="setup.has_secret ? __('Leave empty to keep the saved secret.') : undefined"
        />
        <ErrorMessage :message="error" />
        <div>
          <Button variant="solid" type="submit" :loading="saving" :disabled="!clientId.trim()">
            {{ __('Save') }}
          </Button>
        </div>
      </form>
    </template>
  </SettingsBody>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import {
  Badge,
  Button,
  ErrorMessage,
  FormControl,
  LoadingIndicator,
  SettingsBody,
  SettingsHeader,
  SettingsRow,
  call,
  toast,
} from 'frappe-ui'
import LucideArrowUpRight from '~icons/lucide/arrow-up-right'

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
