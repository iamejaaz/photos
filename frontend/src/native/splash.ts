import { SplashScreen } from '@capacitor/splash-screen'

export const hideSplash = () => SplashScreen.hide({ fadeOutDuration: 150 }).catch(() => {})
