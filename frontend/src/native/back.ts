import { App } from '@capacitor/app'

import { closeTopLayer } from '../composables/useBackClose'

const openDialog = () =>
  document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')

export async function watchBackButton() {
  await App.addListener('backButton', ({ canGoBack }) => {
    const dialog = openDialog()
    if (dialog) {
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      return
    }
    if (closeTopLayer()) return
    if (canGoBack && (window.location.pathname !== '/' || window.history.state?.photosViewer))
      window.history.back()
    else App.minimizeApp()
  })
}
