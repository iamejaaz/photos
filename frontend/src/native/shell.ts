import { nativePlugin } from './platform'

export type PhotosShellPlugin = {
  authorize(options: {
    url: string
    scheme: string
    redirect: string
  }): Promise<{ url?: string; cancelled?: boolean }>
  openExternal(options: { url: string }): Promise<void>
  deviceUnlockStatus(options: { key: string }): Promise<{ available: boolean; saved: boolean }>
  saveUnlockSecret(options: { key: string; secret: string }): Promise<void>
  forgetUnlockSecret(options: { key: string }): Promise<void>
  readUnlockSecret(options: { key: string; title: string }): Promise<{ secret?: string; cancelled?: boolean }>
}

export const photosShell = nativePlugin<PhotosShellPlugin>('PhotosShell')
