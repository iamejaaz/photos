<template>
  <PhotosHeader :title="__('Library')" hide-upload />
  <div class="flex flex-col gap-6 px-3 pb-6 pt-3 sm:px-5">
    <nav class="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <router-link
        v-for="item in shortcuts"
        :key="item.label"
        :to="{ name: item.route }"
        class="flex items-center gap-3 rounded-xl bg-surface-gray-2 px-4 py-3.5 text-base font-medium text-ink-gray-8 transition-colors hover:bg-surface-gray-3 active:bg-surface-gray-3"
      >
        <component :is="item.icon" class="size-5 shrink-0 text-ink-gray-7" />
        <span class="truncate">{{ item.label }}</span>
      </router-link>
    </nav>

    <section>
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-lg font-semibold text-ink-gray-9">{{ __('Albums') }}</h2>
        <router-link
          v-if="albums.length > ALBUM_PREVIEW"
          :to="{ name: 'photos-albums' }"
          class="text-base font-medium text-ink-gray-6 hover:text-ink-gray-8"
        >
          {{ __('View all') }}
        </router-link>
      </div>
      <div class="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4 lg:grid-cols-6">
        <router-link :to="{ name: 'photos-albums', query: { new: 1 } }" class="flex flex-col gap-2">
          <div
            class="flex aspect-square items-center justify-center rounded-xl border border-dashed border-outline-gray-3 text-ink-gray-6"
          >
            <LucidePlus class="size-7" />
          </div>
          <div class="text-base font-medium text-ink-gray-8">{{ __('New album') }}</div>
        </router-link>
        <router-link
          v-for="album in albums.slice(0, ALBUM_PREVIEW)"
          :key="album.name"
          :to="{ name: 'photos-album', params: { album: album.name } }"
          class="flex min-w-0 flex-col gap-2"
        >
          <div class="aspect-square overflow-hidden rounded-xl bg-surface-gray-2">
            <img
              v-if="album.cover"
              :src="thumbnailUrl(album.cover, album.name)"
              class="size-full object-cover"
              alt=""
            />
          </div>
          <div class="min-w-0">
            <div class="truncate text-base font-medium text-ink-gray-8">{{ album.title }}</div>
            <div class="text-sm text-ink-gray-5">
              {{ album.count === 1 ? __('1 item') : __('{0} items', [album.count]) }}
            </div>
          </div>
        </router-link>
      </div>
    </section>

    <nav class="flex flex-col divide-y divide-outline-gray-1">
      <component
        :is="action.route ? 'router-link' : 'button'"
        v-for="action in actions"
        :key="action.label"
        :to="action.route ? { name: action.route } : undefined"
        class="flex items-center gap-3 py-3.5 text-left text-base text-ink-gray-8"
        @click="action.onClick?.()"
      >
        <component :is="action.icon" class="size-5 text-ink-gray-6" />
        <span class="flex-1">{{ action.label }}</span>
        <LucideChevronRight class="size-4 text-ink-gray-4" />
      </component>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { usePageMeta } from 'frappe-ui'
import LucideArchive from '~icons/lucide/archive'
import LucideChevronRight from '~icons/lucide/chevron-right'
import LucideCloudUpload from '~icons/lucide/cloud-upload'
import LucideCopy from '~icons/lucide/copy'
import LucideEyeOff from '~icons/lucide/eye-off'
import LucideFolder from '~icons/lucide/folder'
import LucideHardDriveDownload from '~icons/lucide/hard-drive-download'
import LucideHistory from '~icons/lucide/history'
import LucidePlus from '~icons/lucide/plus'
import LucideSettings from '~icons/lucide/settings'
import LucideSmartphone from '~icons/lucide/smartphone'
import LucideStar from '~icons/lucide/star'
import LucideTrash2 from '~icons/lucide/trash-2'
import LucideUsers from '~icons/lucide/users'

import { appPageMeta } from '@/utils/documentTitle'
import PhotosHeader from '../components/PhotosHeader.vue'
import { thumbnailUrl } from '../resources/media'
import { albums, albumsLoaded, loadAlbums } from '../data/albums'
import { libraryShare, openSettings } from '../data/dialogs'

const native = Boolean(import.meta.env.VITE_NATIVE)
const ALBUM_PREVIEW = 5

if (!albumsLoaded.value) loadAlbums()

const shortcuts = [
  { label: __('Favourites'), icon: LucideStar, route: 'photos-favourites' },
  { label: __('Archive'), icon: LucideArchive, route: 'photos-archive' },
  { label: __('Trash'), icon: LucideTrash2, route: 'photos-trash' },
  { label: __('Hidden'), icon: LucideEyeOff, route: 'photos-hidden' },
  { label: __('Recently added'), icon: LucideHistory, route: 'photos-recent' },
  { label: __('Folders'), icon: LucideFolder, route: 'photos-folders' },
  { label: __('Duplicates'), icon: LucideCopy, route: 'photos-duplicates' },
]

const actions: { label: string; icon: unknown; route?: string; onClick?: () => void }[] = [
  ...(native
    ? [
        { label: __('Back up this phone'), icon: LucideCloudUpload, onClick: () => openSettings('backup') },
        { label: __('Free up space'), icon: LucideSmartphone, onClick: () => openSettings('backup') },
      ]
    : []),
  { label: __('Share your library'), icon: LucideUsers, onClick: () => (libraryShare.open = true) },
  {
    label: __('Import from Google Photos'),
    icon: LucideHardDriveDownload,
    onClick: () => openSettings('import'),
  },
  { label: __('Settings'), icon: LucideSettings, onClick: () => openSettings('memories') },
]

usePageMeta(() => appPageMeta(__('Library'), 'Photos'))
</script>
