import { createApp } from 'vue'
import { createPinia } from 'pinia'

import { configureFrappeUI } from '@/boot/config'
import { getSessionUser, userResource } from '@/boot/session'
import { translationPlugin } from '@/boot/translation'
import App from './App.vue'
import { retryFailedImages } from './retryImages'
import router from './router'

configureFrappeUI()
retryFailedImages()
if (getSessionUser()) userResource.fetch()

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(translationPlugin)

router.isReady().then(() => {
  app.mount('#app')
  if (import.meta.env.VITE_NATIVE) import('./native/splash').then(({ hideSplash }) => hideSplash())
})
