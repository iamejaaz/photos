import { call } from 'frappe-ui'

const ACCOUNT = 'photos.api.account'

export const deleteLibrary = () => call(`${ACCOUNT}.delete_library`)
export const deleteAccount = () => call(`${ACCOUNT}.delete_account`)
export const accountDeletionStatus = () =>
  call(`${ACCOUNT}.account_deletion_status`) as Promise<'Pending Verification' | 'Pending Approval' | null>
