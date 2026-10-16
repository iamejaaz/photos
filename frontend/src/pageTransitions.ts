import { nextTick } from 'vue'
import type { RouteLocationNormalized, Router } from 'vue-router'

const TABS = new Set(['photos-home', 'photos-explore', 'photos-sharing', 'photos-library'])
const DETAILS = new Set(['photos-person', 'photos-album', 'photos-folder'])

const depth = (route: RouteLocationNormalized) =>
  TABS.has(String(route.name)) ? 0 : DETAILS.has(String(route.name)) ? 2 : 1

const phone = () => window.matchMedia('(max-width: 639px)').matches
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function animatePageChanges(router: Router) {
  let finish: (() => void) | null = null

  router.beforeResolve((to, from) => {
    if (!from.name || to.name === from.name || !document.startViewTransition || !phone() || reduced()) return
    const change = depth(to) - depth(from)
    document.documentElement.dataset.pageMove = change > 0 ? 'forward' : change < 0 ? 'back' : 'fade'
    return new Promise<void>((resolve) => {
      const transition = document.startViewTransition(
        () =>
          new Promise<void>((done) => {
            finish = done
            resolve()
          }),
      )
      transition.finished.finally(() => delete document.documentElement.dataset.pageMove)
    })
  })

  router.afterEach(async () => {
    if (!finish) return
    const done = finish
    finish = null
    await nextTick()
    done()
  })
}
