import { nativePlugin } from './platform'

export type BackupStatus = {
  enabled: boolean
  wifiOnly: boolean
  network: 'wifi' | 'mobile' | 'none'
  includeVideos: boolean
  permission: 'granted' | 'partial' | 'denied' | 'prompt'
  running: boolean
  total: number
  done: number
  lastRun: number | null
  lastError: string | null
  signedIn: boolean
  site: string
  user: string
}

export type PhotosBackupPlugin = {
  configure(options: {
    site: string
    user: string
    clientId: string
    accessToken: string
    refreshToken: string
    expiresIn: number
  }): Promise<void>
  getStatus(): Promise<BackupStatus>
  setOptions(options: {
    enabled?: boolean
    wifiOnly?: boolean
    includeVideos?: boolean
  }): Promise<BackupStatus>
  requestPermission(): Promise<BackupStatus>
  runNow(): Promise<void>
  signOut(): Promise<void>
  findFreeable(): Promise<{ count: number; bytes: number }>
  freeUpSpace(): Promise<{ count: number; bytes: number }>
  saveToDevice(options: { url: string; name?: string; headers: Record<string, string> }): Promise<void>
  shareFiles(options: {
    files: { url: string; name: string }[]
    headers: Record<string, string>
  }): Promise<void>
  addListener(event: 'status', listener: (status: BackupStatus) => void): Promise<{ remove(): Promise<void> }>
}

export const photosBackup = nativePlugin<PhotosBackupPlugin>('PhotosBackup')

export function waitingFor(status: BackupStatus): 'wifi' | 'internet' | null {
  if (!status.enabled || status.running) return null
  if (status.network === 'none') return 'internet'
  if (status.wifiOnly && status.network === 'mobile') return 'wifi'
  return null
}
