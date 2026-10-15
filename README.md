### Photos

Google Photos style library for Frappe. It runs on top of [Frappe Suite](https://github.com/frappe/suite): photos and videos live in Drive, albums are shared with Drive permissions, and the UI is built with frappe-ui.

- Timeline, favourites, archive, trash, folders and duplicates for everything you upload to Drive
- Albums with sharing, comments and likes
- People, places and things, found on your own server with OpenCV
- Collages, slideshow movies and a photo editor

### Installation

Photos needs Suite on the same bench.

```bash
bench get-app https://github.com/frappe/suite
bench get-app https://github.com/iamejaaz/photos
bench --site your.site install-app photos
```

Load demo photos, people and shared albums:

```bash
bench --site your.site photos-demo-data
```

### Pick from Google Photos

1. In Google Cloud, enable the Google Photos Picker API and create an OAuth client of type Web application.
2. Add `https://your.site/api/method/frappe.integrations.google_oauth.callback` as a redirect URI.
3. Enter the client ID and secret in Google Settings on your site and enable it.

Each user then connects their account under Settings → Import and picks photos in Google Photos.

### Android app

The app in `mobile/` bundles the same frontend with Capacitor. It signs in with OAuth, backs up the phone's gallery in the background, and accepts photos shared from other apps.

```bash
yarn install
yarn native:sync
cd mobile/android && ./gradlew assembleDebug
```

The APK is at `mobile/android/app/build/outputs/apk/debug/app-debug.apk`. To use a plain `http://` bench while developing, add `mobile/capacitor.config.local.json` with `{"android": {"allowMixedContent": true}}` and sync again.

### License

agpl-3.0
