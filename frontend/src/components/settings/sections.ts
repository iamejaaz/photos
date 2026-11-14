import { type Component, computed, defineAsyncComponent } from 'vue'
import LucideCloudUpload from '~icons/lucide/cloud-upload'
import LucideFileArchive from '~icons/lucide/file-archive'
import LucideHardDriveDownload from '~icons/lucide/hard-drive-download'
import LucideHistory from '~icons/lucide/history'
import LucideShield from '~icons/lucide/shield'
import LucideSparkles from '~icons/lucide/sparkles'
import LucideMailWarning from '~icons/lucide/mail-warning'
import LucideKeyRound from '~icons/lucide/key-round'
import LucideMessageSquareWarning from '~icons/lucide/message-square-warning'

import { getSessionUser } from '@/boot/session'
import { settings, useGoogleSetupNeeded } from '../../data/dialogs'

export type SettingsGroup = 'phone' | 'photos' | 'admin'
export type SettingsSection = {
  key: string
  group: SettingsGroup
  label: string
  description: string
  icon: Component
  panel: Component
}

const panel = (load: () => Promise<{ default: Component }>) => defineAsyncComponent(load)
const native = Boolean(import.meta.env.VITE_NATIVE)

const PANELS: Record<string, Component> = {
  backup: panel(() => import('./BackupPanel.vue')),
  memories: panel(() => import('./MemoriesPanel.vue')),
  import: panel(() => import('./ImportPanel.vue')),
  export: panel(() => import('./ExportPanel.vue')),
  data: panel(() => import('./DataPanel.vue')),
  features: panel(() => import('./FeaturesPanel.vue')),
  google: panel(() => import('./GoogleSetupPanel.vue')),
  signups: panel(() => import('./SignupsPanel.vue')),
  reports: panel(() => import('./ProblemReportsPanel.vue')),
}

const allSections = (): SettingsSection[] => [
  {
    key: 'backup',
    group: 'phone',
    label: __('Backup'),
    description: __('Back up this phone and free up space'),
    icon: LucideCloudUpload,
    panel: PANELS.backup,
  },
  {
    key: 'memories',
    group: 'photos',
    label: __('Memories'),
    description: __('Memories at the top of your photos'),
    icon: LucideHistory,
    panel: PANELS.memories,
  },
  {
    key: 'import',
    group: 'photos',
    label: __('Import'),
    description: __('Bring photos from Google Photos'),
    icon: LucideHardDriveDownload,
    panel: PANELS.import,
  },
  {
    key: 'export',
    group: 'photos',
    label: __('Export'),
    description: __('Download a copy of your library'),
    icon: LucideFileArchive,
    panel: PANELS.export,
  },
  {
    key: 'data',
    group: 'photos',
    label: __('Your data'),
    description: __('Download or delete your photos and account'),
    icon: LucideShield,
    panel: PANELS.data,
  },
  {
    key: 'features',
    group: 'admin',
    label: __('Smart features'),
    description: __('People, places and search for this site'),
    icon: LucideSparkles,
    panel: PANELS.features,
  },
  {
    key: 'google',
    group: 'admin',
    label: __('Google Photos import'),
    description: __('Register Photos with Google once'),
    icon: LucideKeyRound,
    panel: PANELS.google,
  },
  {
    key: 'signups',
    group: 'admin',
    label: __('Sign-up problems'),
    description: __('People who did not get their sign-up email'),
    icon: LucideMailWarning,
    panel: PANELS.signups,
  },
  {
    key: 'reports',
    group: 'admin',
    label: __('Problem reports'),
    description: __('Problems people reported from the app or the web'),
    icon: LucideMessageSquareWarning,
    panel: PANELS.reports,
  },
]

export function useSettingsSections() {
  const google = useGoogleSetupNeeded()
  const ready = computed(() => Boolean(settings.data) && (!settings.data?.can_manage || google.checked.value))
  const sections = computed(() =>
    allSections().filter(({ key, group }) => {
      if (key === 'backup') return native
      if (key === 'data') return (getSessionUser() ?? 'Administrator') !== 'Administrator'
      if (group === 'admin' && !settings.data?.can_manage) return false
      if (key === 'google') return google.needed.value
      return true
    }),
  )
  return { sections, ready }
}
