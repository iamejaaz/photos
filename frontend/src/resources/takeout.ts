import { call } from 'frappe-ui'

export interface ImportJob {
  name: string
  status: 'Reading' | 'Ready' | 'Importing' | 'Done' | 'Failed'
  summary: { albums: string[]; items: [number[], number, number, number, number][] } | null
  done: number
  total: number
  result: { imported: number; skipped: number; albums: number } | null
  error: string | null
}
export interface ImportOptions {
  mode: 'all' | 'some'
  albums: number[]
  years: number[]
  archived: boolean
  favourites: boolean
}
const TAKEOUT = 'photos.api.takeout'
export const createImport = (files: string[]) =>
  call(`${TAKEOUT}.create_import`, { files }) as Promise<ImportJob>
export const getImport = (name?: string) =>
  call(`${TAKEOUT}.get_import`, { name }) as Promise<ImportJob | null>
export const startImport = (name: string, options: ImportOptions) =>
  call(`${TAKEOUT}.start_import`, { name, options }) as Promise<ImportJob>
export const cancelImport = (name: string) => call(`${TAKEOUT}.cancel_import`, { name })
