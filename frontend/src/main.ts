import './index.css'

import { translate } from '@/boot/translation'

async function start() {
  if (import.meta.env.VITE_NATIVE) {
    window.__ = translate
    const { startNative } = await import('./native/boot')
    if (!(await startNative())) return
  } else if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('/api/method/photos.api.pwa.service_worker', { scope: '/photos/' })
      .catch(() => {})
  }
  await import('./app')
}

start()
