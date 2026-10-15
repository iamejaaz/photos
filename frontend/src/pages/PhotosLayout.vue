<template>
  <FrappeUIProvider>
    <div v-if="!loggedIn" class="flex h-full flex-col bg-surface-base">
      <header class="flex items-center justify-between border-b px-3 py-2 sm:px-5">
        <div class="flex items-center gap-2">
          <img :src="photosLogo" class="size-7" alt="" />
          <span class="text-base font-semibold text-ink-gray-9">{{ __('Photos') }}</span>
        </div>
        <Button variant="subtle" :link="`/login?redirect-to=${encodeURIComponent($route.fullPath)}`">
          {{ __('Sign in') }}
        </Button>
      </header>
      <div class="min-h-0 flex-1 overflow-y-auto">
        <router-view :key="$route.fullPath" />
      </div>
    </div>
    <DesktopShell v-else-if="isDesktop" class="isolate">
      <template #sidebar><PhotosSidebar /></template>
      <div class="relative flex min-h-full flex-col bg-surface-base" @dragover.prevent="onDragOver">
        <router-view v-slot="{ Component, route: current }">
          <KeepAlive :include="KEEP_ALIVE">
            <component :is="Component" :key="current.fullPath" />
          </KeepAlive>
        </router-view>
      </div>
    </DesktopShell>
    <MobileShell v-else class="isolate">
      <div class="relative flex min-h-full flex-col bg-surface-base pb-20">
        <PullToRefresh />
        <router-view v-slot="{ Component, route: current }">
          <KeepAlive :include="KEEP_ALIVE">
            <component :is="Component" :key="current.fullPath" />
          </KeepAlive>
        </router-view>
      </div>
      <template #nav>
        <nav
          class="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-3 pb-3 transition-transform duration-200 ease-out"
          :class="{ 'translate-y-[150%]': selection.size || $route.name === 'photos-settings' }"
        >
          <div
            class="pointer-events-auto flex items-center gap-1 rounded-full bg-surface-base/90 p-1.5 shadow-xl ring-1 ring-black/5 backdrop-blur-md"
          >
            <router-link
              v-for="item in mobileNav"
              :key="item.label"
              :to="item.to"
              class="flex items-center gap-1.5 rounded-full px-3.5 py-2.5 text-sm transition-colors"
              :class="
                $route.name === item.to.name
                  ? 'bg-surface-gray-3 font-semibold text-ink-gray-9'
                  : 'text-ink-gray-6'
              "
            >
              <component :is="item.icon" class="size-5" />
              <span v-if="$route.name === item.to.name">{{ item.label }}</span>
            </router-link>
          </div>
        </nav>
      </template>
    </MobileShell>
    <div
      v-if="dragging"
      class="fixed inset-0 z-40 flex items-center justify-center bg-surface-base/80 backdrop-blur-sm"
      @dragleave.self="dragging = false"
      @dragover.prevent
      @drop.prevent="onDrop"
    >
      <div
        class="pointer-events-none flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-outline-gray-3 px-16 py-12"
      >
        <LucideUpload class="size-8 text-ink-gray-6" />
        <div class="text-lg font-medium text-ink-gray-8">
          {{ __('Drop to add photos') }}
        </div>
        <div class="text-base text-ink-gray-5">
          {{ __('They are saved to the Photos folder in your Drive') }}
        </div>
      </div>
    </div>
    <Lightbox />
    <MemoryStory />
    <AlbumPicker />
    <MovieDialog />
    <LibraryShareDialog />
    <KeyboardShortcutsDialog v-model:open="showShortcuts" />
    <CollageDialog />
    <PhotosSettings />
    <AccountSheet v-if="loggedIn && !isDesktop" />
    <SharePhotosDialog />
    <EditDateDialog />
    <EditLocationDialog />
  </FrappeUIProvider>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMediaQuery } from '@vueuse/core'
import {
  Button,
  DesktopShell,
  FrappeUIProvider,
  KeyboardShortcutsDialog,
  MobileShell,
  toast,
  useKeyboardShortcut,
} from 'frappe-ui'
import LucideLibrary from '~icons/lucide/library'
import LucideImages from '~icons/lucide/images'
import LucideCompass from '~icons/lucide/compass'
import LucideUsers from '~icons/lucide/users'
import LucideUpload from '~icons/lucide/upload'

const KEEP_ALIVE = ['Timeline']

import { initSocket } from '@/apps/drive/socket'
import photosLogo from '../assets/photos.svg'
import { useSessionStore } from '@/boot/session'
import { setupTheme } from '@/utils/setupTheme'
import AlbumPicker from '../components/AlbumPicker.vue'
import CollageDialog from '../components/CollageDialog.vue'
import LibraryShareDialog from '../components/LibraryShareDialog.vue'
import MovieDialog from '../components/MovieDialog.vue'
import PhotosSettings from '../components/settings/PhotosSettings.vue'
import AccountSheet from '../components/AccountSheet.vue'
import SharePhotosDialog from '../components/SharePhotosDialog.vue'
import EditDateDialog from '../components/EditDateDialog.vue'
import EditLocationDialog from '../components/EditLocationDialog.vue'
import Lightbox from '../components/Lightbox.vue'
import MemoryStory from '../components/MemoryStory.vue'
import PullToRefresh from '../components/PullToRefresh.vue'
import PhotosSidebar from '../components/PhotosSidebar.vue'
import { useBackClose } from '../composables/useBackClose'
import { changeZoom } from '../data/prefs'
import { clearSelection, selection } from '../data/selection'
import { googleImport, loadImport } from '../data/imports'
import { lightbox } from '../data/viewer'
import { openSettings, loadSettings } from '../data/dialogs'
import { loadAlbums } from '../data/albums'
import { notifyUploaded, uploadPhotos } from '../data/uploads'

setupTheme()
useBackClose(() => selection.size > 0, clearSelection)
const loggedIn = computed(() => useSessionStore().isLoggedIn)
if (loggedIn.value) {
  initSocket().on('photos-import-update', async (data: { name: string }) => {
    const job = await loadImport(data.name)
    if (job?.status === 'Done') toast.success(__('Google Photos import finished'))
  })
  initSocket().on('photos-export-ready', (data: { file: string; title: string }) => {
    toast.success(__('{0} is ready', [data.title]), {
      duration: 30000,
      action: {
        label: __('Download'),
        onClick: () => {
          const url = `/api/method/suite.drive.api.files.get_file_content?entity_name=${data.file}&trigger_download=1`
          if (!import.meta.env.VITE_NATIVE) return window.location.assign(url)
          import('../native/save').then(({ saveFiles }) => saveFiles([{ url, name: `${data.title}.zip` }]))
        },
      },
    })
  })
  initSocket().on('photos-export-failed', () => toast.error(__('The export failed. Please try again.')))
  initSocket().on('photos-setup-status', (data: { status: string }) => {
    loadSettings()
    if (data.status === 'Ready') toast.success(__('People, places and things are ready'))
    if (data.status === 'Failed') toast.error(__('Photos setup failed. Open Settings to see why.'))
  })
  initSocket().on(
    'photos-google-import',
    (data: {
      finished: boolean
      done?: number
      total?: number
      imported?: number
      skipped?: number
      failed?: number
    }) => {
      if (!data.finished) {
        Object.assign(googleImport, { running: true, done: data.done ?? 0, total: data.total ?? 0 })
        return
      }
      googleImport.running = false
      notifyUploaded()
      const imported = data.imported ?? 0
      toast.success(
        imported === 1
          ? __('Imported 1 item from Google Photos')
          : __('Imported {0} items from Google Photos', [imported]),
      )
      if (data.failed) toast.error(__('{0} items could not be imported', [data.failed]))
    },
  )
  initSocket().on('photos-trim-ready', () => {
    notifyUploaded()
    toast.success(__('The trimmed video is ready in Photos'))
  })
  initSocket().on('photos-trim-failed', () => toast.error(__('Could not trim this video')))
  initSocket().on('photos-movie-ready', (data: { title: string }) => {
    notifyUploaded()
    toast.success(__('“{0}” is ready in Photos', [data.title]), {
      action: { label: __('View'), onClick: () => router.push({ name: 'photos-home' }) },
    })
  })
  loadAlbums()
  loadSettings()
  receiveShared()
  googleConnected()
}

function googleConnected() {
  if (new URLSearchParams(window.location.search).get('google') !== 'connected') return
  window.history.replaceState(null, '', window.location.pathname)
  toast.success(__('Google account connected'))
  openSettings('import')
}

async function receiveShared() {
  if (!new URLSearchParams(window.location.search).has('shared') || !('caches' in window)) return
  const cache = await caches.open('photos-share')
  const requests = await cache.keys()
  const files = await Promise.all(
    requests.map(async (request) => {
      const response = await cache.match(request)
      const blob = await response!.blob()
      const name = decodeURIComponent(response!.headers.get('X-File-Name') || 'shared')
      return new File([blob], name, { type: blob.type })
    }),
  )
  await Promise.all(requests.map((request) => cache.delete(request)))
  window.history.replaceState(null, '', window.location.pathname)
  if (files.length) uploadPhotos(files)
}

const route = useRoute()
const router = useRouter()
const isDesktop = useMediaQuery('(min-width: 768px)')
const dragging = ref(false)

const mobileNav = [
  { label: __('Photos'), icon: LucideImages, to: { name: 'photos-home' } },
  { label: __('Explore'), icon: LucideCompass, to: { name: 'photos-explore' } },
  { label: __('Sharing'), icon: LucideUsers, to: { name: 'photos-sharing' } },
  { label: __('Library'), icon: LucideLibrary, to: { name: 'photos-library' } },
]

function onDragOver(event: DragEvent) {
  if (event.dataTransfer?.types.includes('Files')) dragging.value = true
}

function onDrop(event: DragEvent) {
  dragging.value = false
  const files = [...(event.dataTransfer?.files ?? [])]
  if (!files.length) return
  const album = route.name === 'photos-album' ? String(route.params.album) : undefined
  uploadPhotos(files, album)
}

watch(
  () => route.fullPath,
  () => {
    clearSelection()
    lightbox.open = false
  },
)

const showShortcuts = ref(false)
const browsing = () => loggedIn.value && !lightbox.open
useKeyboardShortcut([
  {
    combo: 'Shift+Slash',
    description: __('Keyboard shortcuts'),
    group: __('General'),
    enabled: () => loggedIn.value,
    allowInDialog: true,
    handler: () => (showShortcuts.value = !showShortcuts.value),
  },
  {
    combo: 'Slash',
    description: __('Search'),
    group: __('General'),
    enabled: browsing,
    handler: () => document.querySelector<HTMLInputElement>('[data-photos-search] input')?.focus(),
  },
  {
    combo: 'Equal',
    description: __('Bigger photos'),
    group: __('Grid'),
    enabled: browsing,
    handler: () => changeZoom(0.1),
  },
  {
    combo: 'Minus',
    description: __('Smaller photos'),
    group: __('Grid'),
    enabled: browsing,
    handler: () => changeZoom(-0.1),
  },
  {
    combo: 'Escape',
    description: __('Clear selection'),
    group: __('Grid'),
    enabled: () => browsing() && selection.size > 0,
    handler: clearSelection,
  },
])

onBeforeUnmount(() => {
  clearSelection()
  lightbox.open = false
})
</script>
