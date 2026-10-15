import { App } from '@capacitor/app'

const PREFIX = 'io.frappe.photos://open'

async function go(url: string | undefined) {
  if (!url?.startsWith(PREFIX)) return
  const { default: router } = await import('../router')
  router.push(url.slice(PREFIX.length) || '/')
}

export async function watchOpenLinks() {
  await App.addListener('appUrlOpen', ({ url }) => go(url))
  go((await App.getLaunchUrl())?.url)
}
