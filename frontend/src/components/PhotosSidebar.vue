<template>
  <Sidebar v-model:collapsed="collapsed">
    <SidebarHeader :title="__('Photos')" :subtitle="fullName" :logo="photosLogo" :menu-items="menuItems" />
    <div class="flex-1 overflow-y-auto px-2">
      <SidebarSection>
        <SidebarItem
          v-for="item in mainItems"
          :key="item.label"
          :label="item.label"
          :icon="item.icon"
          :route="item.to"
          :active="item.active"
          :suffix="item.suffix"
        />
      </SidebarSection>
      <SidebarSection :label="__('Library')">
        <SidebarItem
          v-for="entry in libraryItems"
          :key="entry.label"
          :label="entry.label"
          :icon="entry.icon"
          :route="entry.to"
          :active="entry.active"
        />
      </SidebarSection>
      <SidebarSection v-if="albums.length" :label="__('Albums')" collapsible>
        <SidebarItem
          v-for="album in albums.slice(0, 10)"
          :key="album.name"
          :label="album.title"
          :icon="LucideBookImage"
          :route="{ name: 'photos-album', params: { album: album.name } }"
          :active="route.name === 'photos-album' && route.params.album === album.name"
        />
      </SidebarSection>
    </div>
    <div class="p-2">
      <SidebarItem
        :label="__('Report a problem')"
        :icon="LucideMessageSquareWarning"
        :on-click="reportProblem"
      />
      <SidebarCollapseToggle />
    </div>
  </Sidebar>
</template>

<script setup lang="ts">
import { type Component, computed, ref } from 'vue'
import { reportProblem } from '../data/problems'
import { useRoute } from 'vue-router'
import { Sidebar, SidebarCollapseToggle, SidebarHeader, SidebarItem, SidebarSection } from 'frappe-ui'
import LucideArchive from '~icons/lucide/archive'
import LucideBookImage from '~icons/lucide/book-image'
import LucideCompass from '~icons/lucide/compass'
import LucideCopy from '~icons/lucide/copy'
import LucideEyeOff from '~icons/lucide/eye-off'
import LucideHistory from '~icons/lucide/history'
import LucideTrash2 from '~icons/lucide/trash-2'
import LucideUsersRound from '~icons/lucide/users-round'
import LucideUsers from '~icons/lucide/users'
import LucideCheck from '~icons/lucide/check'
import LucideFolder from '~icons/lucide/folder'
import LucideMessageSquareWarning from '~icons/lucide/message-square-warning'
import LucideImages from '~icons/lucide/images'
import LucideMonitor from '~icons/lucide/monitor'
import LucideMoon from '~icons/lucide/moon'
import LucideStar from '~icons/lucide/star'
import LucideSun from '~icons/lucide/sun'
import LucideSunMoon from '~icons/lucide/sun-moon'

import photosLogo from '../assets/photos.svg'
import { useCurrentUser, useSessionStore } from '@/boot/session'
import { switchTheme, themeMode } from '@/utils/setupTheme'
import { albums, sharedAlbums } from '../data/albums'
import { libraryShare, openSettings } from '../data/dialogs'
import { sharingSeen } from '../data/prefs'

const route = useRoute()
const collapsed = ref<boolean | null>(window.innerWidth < 1024 ? true : null)
const { fullName } = useCurrentUser()
const hasNewShares = computed(() =>
  sharedAlbums.value.some((album) => album.shared_on && album.shared_on > sharingSeen.value),
)

const item = (label: string, icon: Component, name: string, suffix?: string) => ({
  label,
  icon,
  suffix,
  to: { name },
  active: route.name === name,
})
const mainItems = computed(() => [
  item(__('Photos'), LucideImages, 'photos-home'),
  item(__('Explore'), LucideCompass, 'photos-explore'),
  item(__('People'), LucideUsersRound, 'photos-people'),
  item(__('Sharing'), LucideUsers, 'photos-sharing', hasNewShares.value ? '●' : undefined),
])
const libraryItems = computed(() => [
  item(__('Favourites'), LucideStar, 'photos-favourites'),
  item(__('Albums'), LucideBookImage, 'photos-albums'),
  item(__('Folders'), LucideFolder, 'photos-folders'),
  item(__('Recently added'), LucideHistory, 'photos-recent'),
  item(__('Archive'), LucideArchive, 'photos-archive'),
  item(__('Hidden'), LucideEyeOff, 'photos-hidden'),
  item(__('Duplicates'), LucideCopy, 'photos-duplicates'),
  item(__('Trash'), LucideTrash2, 'photos-trash'),
])

const themeOption = (label: string, value: string, icon: Component) => ({
  label,
  icon: themeMode.value === value.toLowerCase() ? LucideCheck : icon,
  onClick: () => switchTheme(value),
})

const menuItems = computed(() => [
  {
    group: __('Manage'),
    hideLabel: true,
    options: [
      {
        label: __('Share your library'),
        icon: 'lucide-users',
        onClick: () => (libraryShare.open = true),
      },
      {
        label: __('Import from Google Photos'),
        icon: 'lucide-hard-drive-download',
        onClick: () => openSettings('import'),
      },
      { label: __('Settings'), icon: 'lucide-settings', onClick: () => openSettings() },
      {
        label: __('Theme'),
        icon: LucideSunMoon,
        submenu: [
          themeOption(__('Light'), 'Light', LucideSun),
          themeOption(__('Dark'), 'Dark', LucideMoon),
          themeOption(__('Automatic'), 'Automatic', LucideMonitor),
        ],
      },
    ],
  },
  {
    group: __('Others'),
    hideLabel: true,
    options: [
      {
        label: __('Log out'),
        icon: 'lucide-log-out',
        onClick: () => useSessionStore().logout.submit(),
      },
    ],
  },
])
</script>
