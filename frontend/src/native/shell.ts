import { nativePlugin } from './platform'

export type PhotosShellPlugin = {
  authorize(options: {
    url: string
    scheme: string
    redirect: string
  }): Promise<{ url?: string; cancelled?: boolean }>
  openExternal(options: { url: string }): Promise<void>
}

export const photosShell = nativePlugin<PhotosShellPlugin>('PhotosShell')
