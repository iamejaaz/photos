import { call } from 'frappe-ui'

export interface PlaceMatch {
  label: string
  country: string
  latitude: number
  longitude: number
}
const EDIT = 'photos.api.edit'
export const editDate = (files: string[], values: { taken_on?: string; shift_minutes?: number }) =>
  call(`${EDIT}.edit_date`, { files, ...values })
export const editLocation = (files: string[], place: PlaceMatch | null) =>
  call(`${EDIT}.edit_location`, {
    files,
    latitude: place?.latitude ?? null,
    longitude: place?.longitude ?? null,
    place: place?.label ?? null,
  })
export const editCaption = (file: string, caption: string) =>
  call(`${EDIT}.edit_caption`, { file, caption }) as Promise<string | null>
export const createAnimation = (files: string[], album?: string) =>
  call(`${EDIT}.create_animation`, { files, album }) as Promise<string>
export const markEdited = (file: string, original: string) => call(`${EDIT}.mark_edited`, { file, original })
export const trimVideo = (file: string, start: number, end: number, mute = false) =>
  call(`${EDIT}.trim_video`, { file, start, end, mute: mute ? 1 : 0 })
export const exportFrame = (file: string, at: number) =>
  call(`${EDIT}.export_frame`, { file, at }) as Promise<string>
export const searchPlaces = (query: string) =>
  call(`${EDIT}.search_places`, { query }) as Promise<PlaceMatch[]>
