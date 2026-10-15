import { reactive, shallowRef } from 'vue'
import { type Photo, fetchPage } from '../resources/photos'
import { errorText } from '../resources/drive'

export interface Feed {
  method: string
  params: Record<string, unknown>
  rows: Photo[]
  nextStart: number
  hasNext: boolean
  loading: boolean
  loaded: boolean
  error: string | null
}
export function createFeed(method: string, params: Record<string, unknown> = {}) {
  const feed = reactive<Feed>({
    method,
    params,
    rows: [],
    nextStart: 0,
    hasNext: true,
    loading: false,
    loaded: false,
    error: null,
  })

  let pending: Promise<void> | null = null
  let generation = 0

  function loadMore(limit?: number) {
    if (pending) return pending
    if (!feed.hasNext) return Promise.resolve()
    const request = fetchMore(limit, generation).finally(() => pending === request && (pending = null))
    pending = request
    return request
  }

  async function fetchMore(limit: number | undefined, started: number) {
    feed.loading = true
    try {
      const page = await fetchPage(feed.method, {
        ...feed.params,
        start: feed.nextStart,
        ...(limit ? { limit } : {}),
      })
      if (started !== generation) return
      const known = new Set(feed.rows.map((row) => row.name))
      feed.rows.push(...page.rows.filter((row) => !known.has(row.name)))
      feed.nextStart = page.next_start
      feed.hasNext = page.has_next
      feed.error = null
    } catch (error) {
      if (started !== generation) return
      feed.error = errorText(error)
      feed.hasNext = false
    } finally {
      if (started === generation) {
        feed.loading = false
        feed.loaded = true
      }
    }
  }

  async function reload() {
    generation++
    pending = null
    feed.rows = []
    feed.nextStart = 0
    feed.hasNext = true
    await loadMore()
  }

  function remove(names: string[]) {
    const gone = new Set(names)
    feed.rows = feed.rows.filter((row) => !gone.has(row.name))
  }

  return { feed, loadMore, reload, remove }
}
export function createStaticFeed(rows: Photo[]) {
  const handle = createFeed('static')
  Object.assign(handle.feed, { rows, hasNext: false, loaded: true })
  return { ...handle, reload: async () => {} }
}
export type FeedHandle = ReturnType<typeof createFeed>
export const activeFeed = shallowRef<FeedHandle | null>(null)
export const gridNav = reactive<{
  month: string
  jump: ((month: string, upto: number) => Promise<void>) | null
}>({
  month: '',
  jump: null,
})
