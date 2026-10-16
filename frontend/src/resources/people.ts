import { call } from 'frappe-ui'
import { mediaUrl } from './media'

export interface Person {
  name: string
  person_name: string | null
  cover_face: string
  face_count: number
  hidden: number
}
export interface PhotoPerson {
  face: string
  person: string
  person_name: string | null
  timestamp: number | null
}
const PEOPLE = 'photos.api.people'
export const PERSON_PHOTOS = `${PEOPLE}.person_photos`
export const faceUrl = (face: string) => mediaUrl(`/api/method/${PEOPLE}.face_thumbnail?face=${face}`)
export const getPeople = (includeHidden = false) =>
  call(`${PEOPLE}.people`, { include_hidden: includeHidden }) as Promise<{
    enabled: boolean
    people: Person[]
  }>
export const getPerson = (person: string) => call(`${PEOPLE}.person`, { person }) as Promise<Person>
export const getPhotoPeople = (file: string, album?: string) =>
  call(`${PEOPLE}.photo_people`, { file, album }) as Promise<PhotoPerson[]>
export const moveFace = (face: string, person: string | null, personName?: string) =>
  call(`${PEOPLE}.move_face`, { face, person, person_name: personName })
export const markNotAFace = (face: string) => call(`${PEOPLE}.not_a_face`, { face })
export const unassignFace = (face: string) => call(`${PEOPLE}.remove_face`, { face })
export interface PersonSummary {
  name: string
  person_name: string | null
  cover_face: string
  face_count: number
}
export const renamePerson = (person: string, personName: string, merge = false, separate = false) =>
  call(`${PEOPLE}.rename_person`, { person, person_name: personName, merge, separate }) as Promise<{
    duplicate?: PersonSummary
    merged_into?: string
    undo?: string
  } | null>
export const mergeSuggestions = () =>
  call(`${PEOPLE}.merge_suggestions`) as Promise<
    { first: PersonSummary; second: PersonSummary; score: number }[]
  >
export const notSamePeople = (first: string, second: string) =>
  call(`${PEOPLE}.not_same_people`, { first, second })
export const setPersonHidden = (person: string, hidden: boolean) =>
  call(`${PEOPLE}.set_hidden`, { person, hidden })
export const mergePeople = (target: string, sources: string[]) =>
  call(`${PEOPLE}.merge_people`, { target, sources }) as Promise<{ undo: string }>
export const undoMerge = (token: string) => call(`${PEOPLE}.undo_merge`, { token })
export const removePhotosFromPerson = (person: string, files: string[]) =>
  call(`${PEOPLE}.remove_photos`, { person, files })
export const personFaces = (person: string) =>
  call(`${PEOPLE}.person_faces`, { person }) as Promise<{ name: string; file: string }[]>
export const setCover = (person: string, face: string) => call(`${PEOPLE}.set_cover`, { person, face })
