import { isNative } from './platform'
import { photosShell } from './shell'

export type MovieProgress = {
  id: string
  title: string
  done: number
  total: number
  left: number | null
  state: 'running' | 'ready' | 'failed'
}

export function showMovieProgress(p: MovieProgress) {
  if (!isNative()) return
  photosShell()
    .then(({ plugin }) => plugin.movieProgress(p))
    .catch(() => {})
}
