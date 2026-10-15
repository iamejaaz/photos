import { call } from 'frappe-ui'

export const createMovie = (files: string[], title: string, seconds: number, album?: string) =>
  call('photos.api.movies.create_movie', { files, title, seconds, album })
