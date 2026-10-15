import { reactive, shallowRef } from 'vue'
import { type Photo, fetchPage } from '../resources/photos'

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

  async function loadMore() {
    if (feed.loading || !feed.hasNext) return
    feed.loading = true
    try {
      const page = await fetchPage(feed.method, {
        ...feed.params,
        start: feed.nextStart,
      })
      const known = new Set(feed.rows.map((row) => row.name))
      feed.rows.push(...page.rows.filter((row) => !known.has(row.name)))
      feed.nextStart = page.next_start
      feed.hasNext = page.has_next
      feed.error = null
    } catch (error) {
      feed.error = (error as Error).message
      feed.hasNext = false
    } finally {
      feed.loading = false
      feed.loaded = true
    }
  }

  async function reload() {
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
