import { call } from 'frappe-ui'

const EXPORT = 'photos.api.export'
type Started = Promise<{ id: string }>
export const exportFiles = (files: string[], album?: string) =>
  call(`${EXPORT}.export_files`, { files, album }) as Started
export const exportAlbum = (album: string) => call(`${EXPORT}.export_album`, { album }) as Started
export const exportLibrary = () => call(`${EXPORT}.export_library`) as Started
