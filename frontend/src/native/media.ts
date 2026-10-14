import { siteOrigin } from './site'
import { nativePlugin } from './platform'

type PhotosMediaPlugin = {
  setSession(options: { origin: string; token: string }): Promise<void>
  trim(options: { budgetBytes: number }): Promise<void>
}
const media = nativePlugin<PhotosMediaPlugin>('PhotosMedia')

export const setMediaSession = async (token: string) => {
  const { plugin } = await media()
  await plugin.setSession({ origin: siteOrigin(), token }).catch(() => {})
}

const BUDGET_BYTES = 500 * 1024 * 1024

export const trimMediaCache = async (budgetBytes = BUDGET_BYTES) => {
  const { plugin } = await media()
  await plugin.trim({ budgetBytes }).catch(() => {})
}
