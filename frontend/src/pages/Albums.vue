<template>
  <PhotosHeader :title="shared ? __('Sharing') : __('Albums')" hide-upload>
    <template #actions>
      <Dropdown v-if="list.length > 1" :options="sortOptions">
        <Button variant="ghost">
          <template #prefix><LucideArrowUpDown class="size-4" /></template>
          <span class="hidden sm:inline">{{ sortLabel }}</span>
        </Button>
      </Dropdown>
      <Button v-if="!shared" variant="subtle" @click="creating = true">
        <template #prefix><LucidePlus class="size-4" /></template>
        {{ __('New album') }}
      </Button>
    </template>
  </PhotosHeader>
  <section v-if="shared && links.length" class="px-3 pt-4 sm:px-5">
    <h2 class="mb-2 text-base font-semibold text-ink-gray-8">{{ __('Links you shared') }}</h2>
    <div class="flex flex-col divide-y divide-outline-gray-1">
      <div v-for="link in links" :key="link.name" class="flex items-center gap-3 py-2">
        <router-link
          :to="{ name: 'photos-album', params: { album: link.name } }"
          class="flex min-w-0 flex-1 items-center gap-3"
        >
          <img
            v-if="link.cover"
            :src="thumbnailUrl(link.cover, link.name)"
            class="size-10 shrink-0 rounded object-cover"
            alt=""
          />
          <div class="min-w-0">
            <div class="truncate text-base text-ink-gray-8">{{ link.title }}</div>
            <div class="text-sm text-ink-gray-5">{{ itemCount(link.count) }}</div>
          </div>
        </router-link>
        <Button variant="ghost" @click="copyLink(link.name)">{{ __('Copy link') }}</Button>
        <Button variant="ghost" theme="red" @click="stopLink(link.name)">{{ __('Stop sharing') }}</Button>
      </div>
    </div>
  </section>
  <section v-if="shared && libraries.length" class="px-3 pt-4 sm:px-5">
    <h2 class="mb-3 text-base font-semibold text-ink-gray-8">{{ __('Libraries shared with you') }}</h2>
    <div class="flex flex-wrap gap-3">
      <router-link
        v-for="library in libraries"
        :key="library.name"
        :to="{ name: 'photos-folder', params: { folder: library.name } }"
        class="flex items-center gap-3 rounded-lg border p-2 pr-4 hover:bg-surface-gray-1"
      >
        <img
          v-if="library.cover"
          :src="thumbnailUrl(library.cover)"
          class="size-10 rounded object-cover"
          alt=""
        />
        <div>
          <div class="text-base font-medium text-ink-gray-8">{{ library.owner_name }}</div>
          <div class="text-sm text-ink-gray-5">{{ itemCount(library.count) }}</div>
        </div>
      </router-link>
    </div>
    <h2 class="mb-1 mt-6 text-base font-semibold text-ink-gray-8">{{ __('Albums') }}</h2>
  </section>
  <div class="grid grid-cols-2 gap-x-4 gap-y-6 p-3 sm:grid-cols-3 sm:p-5 lg:grid-cols-4 xl:grid-cols-5">
    <router-link
      v-for="album in list"
      :key="album.name"
      :to="{ name: 'photos-album', params: { album: album.name } }"
      class="group flex flex-col gap-2"
    >
      <div class="relative aspect-square overflow-hidden rounded-xl bg-surface-gray-2">
        <img
          v-if="album.cover"
          :src="thumbnailUrl(album.cover, album.name)"
          class="size-full object-cover transition-transform duration-300 group-hover:scale-105"
          alt=""
        />
        <div v-else class="flex size-full items-center justify-center">
          <LucideImages class="size-8 text-ink-gray-4" />
        </div>
        <div
          v-if="album.shared"
          class="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-black/50 text-white"
        >
          <component :is="album.general === 'public' ? LucideGlobe : LucideUsers" class="size-3.5" />
        </div>
      </div>
      <div>
        <div class="truncate text-base font-medium text-ink-gray-8">{{ album.title }}</div>
        <div class="truncate text-sm text-ink-gray-5">
          {{ shared ? `${album.owner_name} · ${itemCount(album.count)}` : itemCount(album.count) }}
        </div>
      </div>
    </router-link>
  </div>
  <div v-if="albumsLoaded && !list.length" class="flex flex-col items-center gap-3 py-24 text-center">
    <div class="flex size-14 items-center justify-center rounded-full bg-surface-gray-2">
      <component :is="shared ? LucideUsers : LucideImages" class="size-6 text-ink-gray-6" />
    </div>
    <div class="text-lg font-medium text-ink-gray-8">
      {{ shared ? __('Nothing shared with you yet') : __('No albums yet') }}
    </div>
    <div class="max-w-sm text-base text-ink-gray-5">
      {{
        shared
          ? __('Albums people share with you show up here.')
          : __(
              'Group photos into albums and share them. A photo can be in many albums and stays where it is in Drive.',
            )
      }}
    </div>
  </div>
  <Dialog
    v-model:open="creating"
    :title="__('New album')"
    size="sm"
    :actions="[{ label: __('Create'), variant: 'solid', onClick: create }]"
  >
    <TextInput v-model="title" :placeholder="__('Album title')" autofocus @keydown.enter="create" />
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Dialog, Dropdown, TextInput, toast, usePageMeta } from 'frappe-ui'
import LucideArrowUpDown from '~icons/lucide/arrow-up-down'
import LucideGlobe from '~icons/lucide/globe'
import LucideImages from '~icons/lucide/images'
import LucidePlus from '~icons/lucide/plus'
import LucideUsers from '~icons/lucide/users'

import { appPageMeta } from '@/utils/documentTitle'
import { readString, writeString } from '@/utils/localStorage'
import { type Album, createAlbum, deleteAlbum, getShareLinks } from '../resources/albums'
import { type Folder, getFolders, getLibraryFolder } from '../resources/photos'
import { thumbnailUrl } from '../resources/media'
import PhotosHeader from '../components/PhotosHeader.vue'
import { albums, albumsLoaded, loadAlbums, sharedAlbums } from '../data/albums'
import { markSharingSeen } from '../data/prefs'
import { itemCount } from '../utils'

const props = defineProps<{ shared?: boolean }>()
const router = useRouter()
const creating = ref(Boolean(useRoute().query.new))
const title = ref('')
const sorts = {
  recent: {
    label: __('Recent activity'),
    compare: (a: Album, b: Album) => (b.modified ?? '').localeCompare(a.modified ?? ''),
  },
  name: { label: __('Name'), compare: (a: Album, b: Album) => a.title.localeCompare(b.title) },
  newest: {
    label: __('Newest photo'),
    compare: (a: Album, b: Album) => (b.latest ?? '').localeCompare(a.latest ?? ''),
  },
}
type Sort = keyof typeof sorts
const sort = ref<Sort>(
  (readString('photos-album-sort') as Sort) in sorts ? (readString('photos-album-sort') as Sort) : 'recent',
)
const sortLabel = computed(() => sorts[sort.value].label)
const sortOptions = computed(() =>
  (Object.keys(sorts) as Sort[]).map((key) => ({
    label: sorts[key].label,
    icon: sort.value === key ? 'lucide-check' : undefined,
    onClick: () => {
      sort.value = key
      writeString('photos-album-sort', key)
    },
  })),
)
const list = computed(() =>
  [...(props.shared ? sharedAlbums.value : albums.value)].sort(sorts[sort.value].compare),
)
const libraries = ref<Folder[]>([])
const links = ref<Album[]>([])
if (props.shared) getShareLinks().then((rows) => (links.value = rows))

async function copyLink(album: string) {
  await navigator.clipboard.writeText(`${window.location.origin}/photos/albums/${album}`)
  toast.success(__('Link copied'))
}

async function stopLink(album: string) {
  await deleteAlbum(album)
  links.value = links.value.filter((link) => link.name !== album)
  toast.success(__('Link stopped'))
}
if (props.shared) {
  Promise.all([getFolders(), getLibraryFolder()]).then(([folders, mine]) => {
    libraries.value = folders.filter((folder) => folder.title === 'Photos' && folder.name !== mine.name)
  })
}
loadAlbums().then(() => props.shared && markSharingSeen())

async function create() {
  if (!title.value.trim()) return
  const name = await createAlbum(title.value.trim())
  creating.value = false
  title.value = ''
  await loadAlbums()
  router.push({ name: 'photos-album', params: { album: name } })
}

usePageMeta(() => appPageMeta(props.shared ? __('Sharing') : __('Albums'), 'Photos'))
</script>
