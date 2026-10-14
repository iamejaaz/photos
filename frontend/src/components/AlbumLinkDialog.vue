<template>
  <Dialog v-model:open="open" :title="__('Link settings')" size="md">
    <div v-if="settings" class="flex flex-col gap-4">
      <div
        v-if="!settings.public"
        class="flex items-center justify-between gap-3 rounded bg-surface-gray-2 px-3 py-2 text-base text-ink-gray-7"
      >
        {{ __('These apply when the album is shared with "Anyone with the link".') }}
        <Button size="sm" @click="emit('share')">{{ __('Share') }}</Button>
      </div>
      <div class="divide-y divide-outline-gray-1">
        <SettingsRow
          :title="__('Let people add photos')"
          :description="__('Anyone with the link can upload. They are asked for their name.')"
        >
          <Switch v-model="form.allow_uploads" />
        </SettingsRow>
        <SettingsRow :title="__('Allow downloads')" :description="__('Show download and export buttons.')">
          <Switch v-model="form.allow_download" />
        </SettingsRow>
        <SettingsRow :title="__('Link expires')" :description="__('After this, the link stops working.')">
          <div class="flex items-center gap-1">
            <DatePicker v-model="form.link_expires_on" :placeholder="__('Never')" class="w-36" />
            <Button
              v-if="form.link_expires_on"
              variant="ghost"
              :aria-label="__('Clear')"
              @click="form.link_expires_on = ''"
            >
              <template #icon><LucideX class="size-4" /></template>
            </Button>
          </div>
        </SettingsRow>
        <SettingsRow
          :title="__('Password')"
          :description="
            settings.has_password && !removePassword
              ? __('A password is set.')
              : __('Ask for a password before showing the album.')
          "
        >
          <Button v-if="settings.has_password && !removePassword" @click="removePassword = true">
            {{ __('Remove') }}
          </Button>
          <Password v-else v-model="form.password" :placeholder="__('No password')" class="w-44" />
        </SettingsRow>
      </div>
    </div>
    <template #actions>
      <Button variant="solid" class="w-full" :loading="saving" @click="save">{{ __('Save') }}</Button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { Button, DatePicker, Dialog, Password, SettingsRow, Switch, toast } from 'frappe-ui'
import LucideX from '~icons/lucide/x'

import { type LinkSettings, getLinkSettings, saveLinkSettings } from '../api'

const props = defineProps<{ album: string }>()
const open = defineModel<boolean>({ default: false })
const emit = defineEmits<{ share: [] }>()

const settings = ref<LinkSettings | null>(null)
const form = reactive({ allow_uploads: false, allow_download: true, link_expires_on: '', password: '' })
const removePassword = ref(false)
const saving = ref(false)

watch(open, async (value) => {
  if (!value) return
  settings.value = await getLinkSettings(props.album)
  removePassword.value = false
  Object.assign(form, {
    allow_uploads: Boolean(settings.value.allow_uploads),
    allow_download: Boolean(settings.value.allow_download),
    link_expires_on: settings.value.link_expires_on?.slice(0, 10) ?? '',
    password: '',
  })
})

async function save() {
  saving.value = true
  try {
    settings.value = await saveLinkSettings(props.album, {
      allow_uploads: form.allow_uploads,
      allow_download: form.allow_download,
      link_expires_on: form.link_expires_on ? `${form.link_expires_on} 23:59:59` : null,
      password: form.password || null,
      remove_password: removePassword.value,
    })
    open.value = false
    toast.success(__('Link settings saved'))
  } catch (error) {
    toast.error((error as { messages?: string[] }).messages?.[0] ?? __('Could not save'))
  } finally {
    saving.value = false
  }
}
</script>
