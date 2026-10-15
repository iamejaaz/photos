<template>
  <PhotosHeader :title="__('Library')" hide-upload />
  <nav class="flex flex-col p-2">
    <router-link
      v-for="item in items"
      :key="item.label"
      :to="{ name: item.route }"
      class="flex items-center gap-3 rounded px-3 py-3 text-base text-ink-gray-8 hover:bg-surface-gray-2"
    >
      <component :is="item.icon" class="size-4 text-ink-gray-6" />
      <span class="flex-1">{{ item.label }}</span>
      <LucideChevronRight class="size-4 text-ink-gray-4" />
    </router-link>
    <button
      class="flex items-center gap-3 rounded px-3 py-3 text-left text-base text-ink-gray-8 hover:bg-surface-gray-2"
      @click="libraryShare.open = true"
    >
      <LucideUsers class="size-4 text-ink-gray-6" />
      <span class="flex-1">{{ __('Share your library') }}</span>
    </button>
    <button
      v-if="native"
      class="flex items-center gap-3 rounded px-3 py-3 text-left text-base text-ink-gray-8 hover:bg-surface-gray-2"
      @click="openSettings('backup')"
    >
      <LucideCloudUpload class="size-4 text-ink-gray-6" />
      <span class="flex-1">{{ __('Back up this phone') }}</span>
    </button>
    <button
      v-if="native"
      class="flex items-center gap-3 rounded px-3 py-3 text-left text-base text-ink-gray-8 hover:bg-surface-gray-2"
      @click="openSettings('backup')"
    >
      <LucideSmartphone class="size-4 text-ink-gray-6" />
      <span class="flex-1">{{ __('Free up space') }}</span>
    </button>
    <button
      class="flex items-center gap-3 rounded px-3 py-3 text-left text-base text-ink-gray-8 hover:bg-surface-gray-2"
      @click="openSettings('import')"
    >
      <LucideHardDriveDownload class="size-4 text-ink-gray-6" />
      <span class="flex-1">{{ __('Import from Google Photos') }}</span>
    </button>
    <button
      class="flex items-center gap-3 rounded px-3 py-3 text-left text-base text-ink-gray-8 hover:bg-surface-gray-2"
      @click="openSettings('memories')"
    >
      <LucideSettings class="size-4 text-ink-gray-6" />
      <span class="flex-1">{{ __('Settings') }}</span>
    </button>
  </nav>
</template>

<script setup lang="ts">
import { usePageMeta } from 'frappe-ui'
import LucideArchive from '~icons/lucide/archive'
import LucideBookImage from '~icons/lucide/book-image'
import LucideChevronRight from '~icons/lucide/chevron-right'
import LucideCopy from '~icons/lucide/copy'
import LucideFolder from '~icons/lucide/folder'
import LucideStar from '~icons/lucide/star'
import LucideEyeOff from '~icons/lucide/eye-off'
import LucideHistory from '~icons/lucide/history'
import LucideTrash2 from '~icons/lucide/trash-2'
import LucideCloudUpload from '~icons/lucide/cloud-upload'
import LucideHardDriveDownload from '~icons/lucide/hard-drive-download'
import LucideSettings from '~icons/lucide/settings'
import LucideSmartphone from '~icons/lucide/smartphone'
import LucideUsers from '~icons/lucide/users'
import LucideUsersRound from '~icons/lucide/users-round'

import { appPageMeta } from '@/utils/documentTitle'
import PhotosHeader from '../components/PhotosHeader.vue'
import { libraryShare, openSettings } from '../data/dialogs'

const native = Boolean(import.meta.env.VITE_NATIVE)

const items = [
  { label: __('Albums'), icon: LucideBookImage, route: 'photos-albums' },
  { label: __('Favourites'), icon: LucideStar, route: 'photos-favourites' },
  { label: __('People'), icon: LucideUsersRound, route: 'photos-people' },
  { label: __('Folders'), icon: LucideFolder, route: 'photos-folders' },
  { label: __('Recently added'), icon: LucideHistory, route: 'photos-recent' },
  { label: __('Archive'), icon: LucideArchive, route: 'photos-archive' },
  { label: __('Hidden'), icon: LucideEyeOff, route: 'photos-hidden' },
  { label: __('Duplicates'), icon: LucideCopy, route: 'photos-duplicates' },
  { label: __('Trash'), icon: LucideTrash2, route: 'photos-trash' },
]

usePageMeta(() => appPageMeta(__('Library'), 'Photos'))
</script>
