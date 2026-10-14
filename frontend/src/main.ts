import './index.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { spritePlugin } from 'frappe-ui/experimental'

import { configureFrappeUI } from '@/boot/config'
import { getSessionUser, userResource } from '@/boot/session'
import { translationPlugin } from '@/boot/translation'
import App from './App.vue'
import router from './router'

configureFrappeUI()
if (getSessionUser()) userResource.fetch()

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(spritePlugin)
app.use(translationPlugin)

router.isReady().then(() => app.mount('#app'))

if (import.meta.env.PROD && 'serviceWorker' in navigator)
  navigator.serviceWorker
    .register('/api/method/photos.api.pwa.service_worker', { scope: '/photos/' })
    .catch(() => {})
