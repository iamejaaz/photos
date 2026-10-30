import { call } from 'frappe-ui'

export type Feature = 'people' | 'places' | 'things' | 'text' | 'smart_search'
export interface Settings extends Record<Feature, boolean> {
  status: string | null
  error: string | null
  can_manage: boolean
}
const SETTINGS = 'photos.api.settings'
export const getSettings = () => call(`${SETTINGS}.get_settings`) as Promise<Settings>
export const saveSettings = (values: Record<Feature, boolean>) =>
  call(`${SETTINGS}.save_settings`, values) as Promise<Settings>
export interface Preferences {
  memories: boolean
  memory_hidden_people: string[]
  memory_removed: string[]
  me: string | null
}
export const getPreferences = () => call('photos.api.preferences.get_preferences') as Promise<Preferences>
export const savePreferences = (values: Preferences) =>
  call('photos.api.preferences.save_preferences', values) as Promise<Preferences>
export const setMe = (person: string | null) =>
  call('photos.api.preferences.set_me', { person }) as Promise<Preferences>
export const removeFromMemories = (file: string) =>
  call('photos.api.preferences.remove_from_memories', { file }) as Promise<Preferences>
