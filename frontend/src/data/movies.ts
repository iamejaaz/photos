import { reactive } from 'vue'
import { showMovieProgress, type MovieProgress } from '../native/movie'

export type Movie = MovieProgress & { name?: string }
export const movies = reactive<Record<string, Movie>>({})
const STALLED_MS = 10 * 60 * 1000
const stalls: Record<string, ReturnType<typeof setTimeout>> = {}

export function updateMovie(id: string, data: Partial<Movie>) {
  if (movies[id] && movies[id].state !== 'running' && !data.state) return
  movies[id] ??= { id, title: '', done: 0, total: 0, left: null, state: 'running' }
  const movie = movies[id]
  Object.assign(movie, data)
  const { title, done, total, left, state } = movie
  showMovieProgress({ id, title, done, total, left, state })
  clearTimeout(stalls[id])
  if (state === 'running') stalls[id] = setTimeout(() => updateMovie(id, { state: 'failed' }), STALLED_MS)
}

export const closeMovie = (id: string) => delete movies[id]

export function timeLeft(left: number | null, done = 0, total = 0) {
  if (total && done >= total) return __('Finishing…')
  if (left == null) return ''
  return left >= 90 ? __('About {0} min left', [Math.round(left / 60)]) : __('Less than a minute left')
}
