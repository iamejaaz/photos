import type { CapacitorConfig } from '@capacitor/cli'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const config: CapacitorConfig = {
  appId: 'io.frappe.photos',
  appName: 'Photos',
  webDir: '../frontend/dist-native',
  android: { allowMixedContent: false, useLegacyBridge: true },
  plugins: {
    SplashScreen: { launchAutoHide: true, launchShowDuration: 8000 },
  },
}

const localPath = join(__dirname, 'capacitor.config.local.json')
if (existsSync(localPath)) {
  const local = JSON.parse(readFileSync(localPath, 'utf8'))
  config.server = { ...config.server, ...local.server }
  config.android = { ...config.android, ...local.android }
}

export default config
