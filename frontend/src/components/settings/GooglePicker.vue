<template>
  <div class="flex flex-col gap-3">
    <h3 class="text-base font-semibold text-ink-gray-8">{{ __('Pick from Google Photos') }}</h3>
    <div v-if="!status" class="h-8" />
    <template v-else-if="!status.configured">
      <p class="text-base text-ink-gray-6">
        {{
          status.can_configure
            ? __('Add a Google client ID and secret in Google Settings to pick photos straight from Google.')
            : __('Ask your administrator to set up Google sign-in to pick photos straight from Google.')
        }}
      </p>
      <div v-if="status.can_configure">
        <Button @click="openGoogleSettings">{{ __('Open Google Settings') }}</Button>
      </div>
    </template>
    <template v-else-if="googleImport.running">
      <div class="text-base text-ink-gray-8">
        {{ __('Importing {0} of {1}', [googleImport.done, googleImport.total || '…']) }}
      </div>
      <Progress
        :value="googleImport.total ? Math.round((googleImport.done / googleImport.total) * 100) : 0"
        size="sm"
      />
    </template>
    <template v-else>
      <p class="text-base text-ink-gray-6">
        {{ __('Choose photos and videos in Google Photos and bring copies of them here.') }}
      </p>
      <div class="flex items-center gap-2">
        <Button v-if="!status.connected" variant="solid" :loading="busy" @click="connect">
          {{ __('Connect Google account') }}
        </Button>
        <template v-else>
          <Button variant="solid" :loading="googleImport.picking" @click="pick">
            {{ googleImport.picking ? __('Waiting for your picks…') : __('Choose photos') }}
          </Button>
          <Button variant="ghost" @click="disconnect">{{ __('Disconnect') }}</Button>
        </template>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { Button, Progress, toast } from 'frappe-ui'

import {
  type GoogleStatus,
  connectGoogle,
  disconnectGoogle,
  googlePickingDone,
  googleStatus,
  importGooglePicked,
  startGooglePicking,
} from '../../resources/google'
import { googleImport } from '../../data/imports'
import { errorText } from '../../resources/drive'

const status = ref<GoogleStatus | null>(null)
const busy = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

googleStatus().then((value) => (status.value = value))
onBeforeUnmount(() => clearTimeout(timer))

const openGoogleSettings = () => window.open('/desk/google-settings', '_blank')

async function connect() {
  busy.value = true
  try {
    window.location.assign(await connectGoogle())
  } catch (error) {
    busy.value = false
    toast.error(errorText(error) || __('Could not connect to Google'))
  }
}

async function disconnect() {
  await disconnectGoogle()
  status.value = await googleStatus()
}

async function pick() {
  const picker = window.open('', '_blank')
  try {
    const session = await startGooglePicking()
    if (picker) picker.location.href = session.url
    else window.open(session.url, '_blank')
    googleImport.picking = true
    const deadline = Date.now() + 30 * 60_000
    const poll = async () => {
      if (Date.now() > deadline) {
        googleImport.picking = false
        return
      }
      if (await googlePickingDone(session.id).catch(() => false)) {
        googleImport.picking = false
        googleImport.running = true
        googleImport.done = 0
        googleImport.total = 0
        await importGooglePicked(session.id)
        return
      }
      timer = setTimeout(poll, Math.max(2, session.poll_seconds) * 1000)
    }
    timer = setTimeout(poll, 3000)
  } catch (error) {
    picker?.close()
    googleImport.picking = false
    toast.error(errorText(error) || __('Could not open Google Photos'))
  }
}
</script>
