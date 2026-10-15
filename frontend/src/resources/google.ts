import { call } from 'frappe-ui'

const GOOGLE = 'photos.api.google'
export interface GoogleStatus {
  configured: boolean
  connected: boolean
  can_configure: boolean
}
export const googleStatus = () => call(`${GOOGLE}.status`) as Promise<GoogleStatus>
export const connectGoogle = () => call(`${GOOGLE}.connect`) as Promise<string>
export const disconnectGoogle = () => call(`${GOOGLE}.disconnect`)
export const startGooglePicking = () =>
  call(`${GOOGLE}.start_picking`) as Promise<{ id: string; url: string; poll_seconds: number }>
export const googlePickingDone = (sessionId: string) =>
  call(`${GOOGLE}.picking_done`, { session_id: sessionId }) as Promise<boolean>
export const importGooglePicked = (sessionId: string) =>
  call(`${GOOGLE}.import_picked`, { session_id: sessionId })
