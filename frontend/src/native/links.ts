import { photosShell } from './shell'
import { siteOrigin } from './site'

export const openOnSite = async (path: string) => {
  const { plugin } = await photosShell()
  await plugin.openExternal({ url: path.startsWith('http') ? path : `${siteOrigin()}${path}` })
}

export const watchExternalLinks = () => {
  document.addEventListener('click', (event) => {
    const anchor = (event.target as Element | null)?.closest?.('a[href]')
    const href = anchor?.getAttribute('href') ?? ''
    if (!anchor || event.defaultPrevented || !/^(\/(drive|app|desk|api)\b|https?:)/.test(href)) return
    event.preventDefault()
    openOnSite(href)
  })
}
