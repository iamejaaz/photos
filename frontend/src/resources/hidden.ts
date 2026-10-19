import { call } from 'frappe-ui'

const HIDDEN = 'photos.api.hidden'
export const HIDDEN_PHOTOS = `${HIDDEN}.hidden_photos`
export const setHidden = (files: string[], hidden: boolean) => call(`${HIDDEN}.set_hidden`, { files, hidden })
export const hiddenState = () =>
  call(`${HIDDEN}.hidden_state`) as Promise<{ unlocked: boolean; count: number }>
export const unlockHidden = (password: string) => call(`${HIDDEN}.unlock`, { password })
export const lockHidden = () => call(`${HIDDEN}.lock`)
export const emailUnlockCode = () => call(`${HIDDEN}.email_unlock_code`) as Promise<{ email: string }>
export const unlockWithCode = (code: string) => call(`${HIDDEN}.unlock_with_code`, { code })
