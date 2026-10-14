let active: { origin: string; getToken: () => string } | null = null

export const setActiveSite = (origin: string, getToken: () => string) => {
  active = { origin, getToken }
}

export const siteOrigin = (): string => active?.origin ?? window.location.origin

export const siteToken = (): string | undefined => active?.getToken()

const isAbsolute = (path: string) => /^(https?:|blob:|data:)/i.test(path)

export const siteUrl = (path: string): string =>
  active && !isAbsolute(path) ? `${active.origin}${path}` : path

export const APP_HEADERS = { 'X-Photos-App': '1' } as const
