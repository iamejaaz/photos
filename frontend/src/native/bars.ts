import { StatusBar, Style } from '@capacitor/status-bar'

export async function viewerBars(open: boolean, chrome: boolean) {
  await StatusBar.setStyle({ style: open ? Style.Dark : Style.Default }).catch(() => {})
  await (open && !chrome ? StatusBar.hide() : StatusBar.show()).catch(() => {})
}
