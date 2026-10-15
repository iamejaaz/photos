import { call } from 'frappe-ui'

const EXPORT = 'photos.api.export'
export const exportFiles = (files: string[], album?: string) =>
  call(`${EXPORT}.export_files`, { files, album })
export const exportAlbum = (album: string) => call(`${EXPORT}.export_album`, { album })
export const exportLibrary = () => call(`${EXPORT}.export_library`)
