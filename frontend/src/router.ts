import { createRouter, createWebHistory } from 'vue-router'

import { useSessionStore } from '@/boot/session'
import { routes } from './routes'

declare module 'vue-router' {
  interface RouteMeta {
    allowGuest?: boolean
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.VITE_NATIVE ? '/' : '/photos'),
  routes,
})

router.beforeEach((to) => {
  if (!useSessionStore().isLoggedIn && !to.meta.allowGuest) {
    window.location.href = `/login?redirect-to=${encodeURIComponent(`/photos${to.fullPath}`)}`
    return false
  }
})

router.onError((error, to, from) => {
  if (
    from.matched.length &&
    /dynamically imported module|Importing a module script failed/.test(String(error?.message))
  ) {
    window.location.assign(import.meta.env.VITE_NATIVE ? to.fullPath : `/photos${to.fullPath}`)
  }
})

export default router
