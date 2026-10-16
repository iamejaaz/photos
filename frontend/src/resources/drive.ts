import { call } from 'frappe-ui'

export const DRIVE = 'suite.drive.api.files'
const CHUNK_SIZE = 20 * 1024 * 1024
export const setFavourite = (names: string[], value: boolean) =>
  call(`${DRIVE}.set_favourite`, {
    entities: names.map((name) => ({ name, is_favourite: JSON.stringify(value) })),
  })
export const toggleTrash = (names: string[]) => call(`${DRIVE}.remove_or_restore`, { entity_names: names })
export const deleteForever = (names: string[]) => call(`${DRIVE}.delete_entities`, { entity_names: names })
export async function uploadFile(file: File, parent: string, onProgress: (loaded: number) => void) {
  const uuid = crypto.randomUUID()
  const total = Math.max(1, Math.ceil(file.size / CHUNK_SIZE))
  for (let index = 0; index < total; index++) {
    const offset = index * CHUNK_SIZE
    const form = new FormData()
    form.append('file', file.slice(offset, offset + CHUNK_SIZE), file.name)
    form.append('parent', parent)
    form.append('uuid', uuid)
    form.append('total_file_size', String(file.size))
    form.append('file_modified', String(file.lastModified))
    form.append('chunk_index', String(index))
    form.append('total_chunk_count', String(total))
    form.append('chunk_byte_offset', String(offset))
    const response = await fetch(`/api/method/${DRIVE}.upload_file`, {
      method: 'POST',
      body: form,
      headers: { 'X-Frappe-CSRF-Token': window.csrf_token ?? '' },
    })
    if (!response.ok) throw new Error(await errorMessage(response))
    onProgress(Math.min(file.size, offset + CHUNK_SIZE))
    if (index === total - 1) return ((await response.json()).message?.name as string | undefined) ?? null
  }
  return null
}
export async function errorMessage(response: Response) {
  try {
    const body = await response.json()
    const messages = JSON.parse(body._server_messages || '[]')
    return messages.length ? JSON.parse(messages[0]).message : body.exception || response.statusText
  } catch {
    return response.statusText
  }
}
const OLDER_SITE = /Failed to get method for command|has no attribute/

const NETWORK_FAILURE = /^(Failed to fetch|Load failed|NetworkError when attempting to fetch resource\.?)$/

export const errorText = (error: unknown) => {
  const text = (error as { messages?: string[] }).messages?.find(Boolean) || (error as Error)?.message
  if (text && NETWORK_FAILURE.test(text)) return __("You're offline. Connect to the internet and try again.")
  return text && OLDER_SITE.test(text)
    ? __('Your site needs a newer version of Photos for this. Ask your administrator to update it.')
    : text
}
