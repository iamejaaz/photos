import { nativePlugin } from './platform'

export type PhotosShellPlugin = {
  authorize(options: {
    url: string
    scheme: string
    redirect: string
  }): Promise<{ url?: string; cancelled?: boolean }>
  openExternal(options: { url: string }): Promise<void>
  screenLockAvailable(): Promise<{ available: boolean }>
  confirmScreenLock(options: { title: string }): Promise<{ confirmed: boolean }>
  captureScreen(): Promise<{ dataUrl: string }>
  setLandscape(options: { landscape: boolean }): Promise<void>
  installUpdate(options: { url: string }): Promise<{ needsPermission?: boolean }>
  addListener(
    event: 'updateProgress',
    listener: (progress: { percent: number }) => void,
  ): Promise<{ remove(): Promise<void> }>
}

export const photosShell = nativePlugin<PhotosShellPlugin>('PhotosShell')
