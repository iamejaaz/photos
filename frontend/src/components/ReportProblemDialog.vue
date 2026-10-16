<template>
  <Dialog v-model:open="problemReport.open" :title="__('Report a problem')" size="md">
    <div class="flex flex-col gap-4">
      <Textarea
        v-model="description"
        :rows="3"
        :placeholder="__('What went wrong? This is optional, the screenshot often says enough.')"
      />
      <div v-if="problemReport.screenshot" class="flex flex-col items-start gap-2">
        <img
          :src="problemReport.screenshot"
          class="max-h-48 w-auto rounded-lg border border-outline-gray-2 object-contain"
          :alt="__('Screenshot')"
        />
        <div class="flex gap-1">
          <Button variant="ghost" @click="problemReport.screenshot = null">{{ __('Remove') }}</Button>
          <Button variant="ghost" @click="picker?.click()">{{ __('Use another image') }}</Button>
        </div>
      </div>
      <Button v-else class="self-start" @click="picker?.click()">
        <template #prefix><LucideImagePlus class="size-4" /></template>
        {{ __('Add a screenshot') }}
      </Button>
      <input ref="picker" type="file" accept="image/*" class="hidden" @change="pick" />
      <p class="text-sm text-ink-gray-5">
        {{ __('We also send the page you were on, the app version and recent errors to help fix it.') }}
      </p>
    </div>
    <template #actions>
      <Button variant="solid" class="w-full" :loading="sending" @click="send">{{ __('Send report') }}</Button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { Button, Dialog, Textarea, call, toast } from 'frappe-ui'
import LucideImagePlus from '~icons/lucide/image-plus'

import { problemReport, recentErrors, shrinkImage } from '../data/problems'
import { errorText } from '../resources/drive'

const description = ref('')
const sending = ref(false)
const picker = ref<HTMLInputElement | null>(null)

watch(
  () => problemReport.open,
  (open) => open && (description.value = ''),
)

async function pick(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) problemReport.screenshot = await shrinkImage(file)
  ;(event.target as HTMLInputElement).value = ''
}

async function appVersion() {
  if (!import.meta.env.VITE_NATIVE) return 'web'
  const { App } = await import('@capacitor/app')
  const info = await App.getInfo()
  return `${info.version} (${info.build})`
}

async function send() {
  sending.value = true
  try {
    await call('photos.api.feedback.report_problem', {
      description: description.value,
      page: problemReport.page,
      platform: import.meta.env.VITE_NATIVE ? 'android' : 'web',
      app_version: await appVersion(),
      device: navigator.userAgent,
      recent_errors: JSON.stringify(recentErrors),
      screenshot: problemReport.screenshot,
    })
    problemReport.open = false
    toast.success(__('Thanks. Your report was sent to the site admin.'))
  } catch (error) {
    toast.error(errorText(error) || __('Could not send the report'))
  } finally {
    sending.value = false
  }
}
</script>
