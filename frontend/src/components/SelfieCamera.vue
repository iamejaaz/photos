<template>
  <Dialog v-model:open="open" :title="__('Find me')" size="lg">
    <div class="relative aspect-[4/3] overflow-hidden rounded-lg bg-surface-gray-2">
      <video
        v-show="streaming"
        ref="video"
        class="size-full -scale-x-100 object-cover"
        autoplay
        muted
        playsinline
        @playing="streaming = true"
      />
      <div
        v-if="!streaming"
        class="absolute inset-0 flex items-center justify-center p-6 text-center text-p-sm text-ink-gray-6"
      >
        <LoadingIndicator v-if="!problem" class="size-6" />
        <span v-else>{{ problem }}</span>
      </div>
    </div>
    <p class="mt-3 text-p-sm text-ink-gray-6">
      {{ __('Look at the camera. Your selfie is only used to find you in this album.') }}
    </p>
    <template #actions>
      <div class="flex justify-end gap-2">
        <Button variant="subtle" @click="picker?.click()">{{ __('Choose a photo') }}</Button>
        <Button variant="solid" :disabled="!streaming" @click="take">{{ __('Take photo') }}</Button>
      </div>
      <input ref="picker" type="file" accept="image/*" class="hidden" @change="onPick" />
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { Button, Dialog, LoadingIndicator } from 'frappe-ui'

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ taken: [selfie: File] }>()

const video = ref<HTMLVideoElement>()
const picker = ref<HTMLInputElement>()
const streaming = ref(false)
const problem = ref('')
let stream: MediaStream | null = null

watch(open, async (value) => {
  if (!value) return stop()
  streaming.value = false
  problem.value = ''
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
    if (!open.value) return stop()
    if (video.value) video.value.srcObject = stream
  } catch (error) {
    problem.value =
      (error as Error).name === 'NotAllowedError'
        ? __('Camera access is blocked. Allow it from the camera icon in the address bar, or choose a photo.')
        : __('No camera found. Choose a photo instead.')
  }
})

function stop() {
  stream?.getTracks().forEach((track) => track.stop())
  stream = null
  streaming.value = false
}

function take() {
  const el = video.value
  if (!el?.videoWidth) return
  const canvas = document.createElement('canvas')
  canvas.width = el.videoWidth
  canvas.height = el.videoHeight
  canvas.getContext('2d')?.drawImage(el, 0, 0)
  canvas.toBlob(
    (blob) => {
      if (!blob) return
      emit('taken', new File([blob], 'selfie.jpg', { type: 'image/jpeg' }))
      open.value = false
    },
    'image/jpeg',
    0.9,
  )
}

function onPick(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  emit('taken', file)
  open.value = false
}
</script>
