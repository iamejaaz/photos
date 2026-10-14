import { computed, h } from 'vue'

import { getAppSwitcherItems } from '@/apps/registry'
import { translate as __ } from '@/boot/translation'

export function useAppSwitcher(currentAppId: string) {
  return computed(() => ({
    label: __('Apps'),
    icon: 'lucide-layout-grid',
    submenu: getAppSwitcherItems(currentAppId).map((app) => ({
      label: app.title,
      icon: h('img', { src: app.logo, class: '!size-6' }),
      onClick: () => window.location.assign(app.route),
    })),
  }))
}
