<template>
  <SettingsHeader :title="__('Your data')" :description="__('Download or delete what you keep in Photos.')" />
  <SettingsBody>
    <div class="flex flex-col divide-y divide-outline-gray-1 pt-2">
      <SettingsRow
        :title="__('Download your photos')"
        :description="__('Get a zip of everything first if you want to keep a copy.')"
      >
        <Button @click="startExport(exportLibrary)">{{ __('Export') }}</Button>
      </SettingsRow>
      <SettingsRow
        :title="__('Delete all your photos')"
        :description="
          __('Removes every photo and video you uploaded, with your albums and people. Your account stays.')
        "
      >
        <Button theme="red" :loading="deletingLibrary" @click="confirm = 'library'">
          {{ __('Delete photos') }}
        </Button>
      </SettingsRow>
      <SettingsRow
        :title="__('Delete your account')"
        :description="
          pending
            ? __(
                'We sent you an email. Open the link in it to confirm, and your account and photos are deleted.',
              )
            : __('Removes your account and everything in Photos. We email you a link to confirm first.')
        "
      >
        <Button theme="red" :disabled="Boolean(pending)" @click="confirm = 'account'">
          {{ pending ? __('Requested') : __('Delete account') }}
        </Button>
      </SettingsRow>
    </div>
    <Dialog
      :open="Boolean(confirm)"
      :title="confirm === 'account' ? __('Delete your account?') : __('Delete all your photos?')"
      size="md"
      @update:open="(open) => !open && (confirm = null)"
    >
      <div class="flex flex-col gap-3 text-base text-ink-gray-7">
        <p>
          {{
            confirm === 'account'
              ? __(
                  'Your account, every photo and video you uploaded, your albums, people and memories are deleted for good. Albums others shared with you stay with them.',
                )
              : __(
                  'Every photo and video you uploaded, your albums, people and memories are deleted for good. Albums others shared with you stay with them.',
                )
          }}
        </p>
        <p class="font-medium text-ink-gray-9">{{ __('This cannot be undone.') }}</p>
        <TextInput
          v-model="typed"
          :placeholder="__('Type DELETE to confirm')"
          autocapitalize="characters"
          autocomplete="off"
        />
      </div>
      <template #actions>
        <div class="flex justify-end gap-2">
          <Button @click="confirm = null">{{ __('Cancel') }}</Button>
          <Button
            variant="solid"
            theme="red"
            :disabled="typed.trim().toUpperCase() !== 'DELETE'"
            @click="run"
          >
            {{ confirm === 'account' ? __('Delete account') : __('Delete photos') }}
          </Button>
        </div>
      </template>
    </Dialog>
  </SettingsBody>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { Button, Dialog, SettingsBody, SettingsHeader, SettingsRow, TextInput, toast } from 'frappe-ui'

import { initSocket } from '@/apps/drive/socket'
import { accountDeletionStatus, deleteAccount, deleteLibrary } from '../../resources/account'
import { errorText } from '../../resources/drive'
import { exportLibrary } from '../../resources/export'
import { startExport } from '../../data/imports'

const confirm = ref<'library' | 'account' | null>(null)
const typed = ref('')
const deletingLibrary = ref(false)
const pending = ref<string | null>(null)

accountDeletionStatus().then((status) => (pending.value = status))
watch(confirm, () => (typed.value = ''))

const socket = initSocket()
const onDeleted = ({ failed = 0 }: { failed?: number } = {}) => {
  deletingLibrary.value = false
  if (failed) return toast.warning(__('{0} items could not be deleted. Try again.', [failed]))
  toast.success(__('All your photos are deleted'))
  window.location.reload()
}
socket?.on('photos_library_deleted', onDeleted)
onBeforeUnmount(() => socket?.off('photos_library_deleted', onDeleted))

async function run() {
  const kind = confirm.value
  confirm.value = null
  try {
    if (kind === 'library') {
      deletingLibrary.value = true
      await deleteLibrary()
      toast.success(__('Deleting your photos. This can take a few minutes.'))
    } else {
      await deleteAccount()
      pending.value = 'Pending Verification'
      toast.success(__('Check your email to confirm'))
    }
  } catch (error) {
    deletingLibrary.value = false
    toast.error(errorText(error))
  }
}
</script>
