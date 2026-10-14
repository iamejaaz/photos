import frappeUIPreset from 'frappe-ui/tailwind'

export default {
  presets: [frappeUIPreset],
  content: [
    './index.html',
    './src/**/*.{vue,js,ts}',
    '../../suite/frontend/src/apps/drive/ui/**/*.{vue,js,ts}',
    './node_modules/frappe-ui/src/**/*.{vue,js,ts}',
    '../node_modules/frappe-ui/src/**/*.{vue,js,ts}',
    './node_modules/frappe-ui/experimental/**/*.{vue,js,ts}',
    '../node_modules/frappe-ui/experimental/**/*.{vue,js,ts}',
  ],
}
